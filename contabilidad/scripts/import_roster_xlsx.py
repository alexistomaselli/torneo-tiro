#!/usr/bin/env python3

import argparse
import re
import sqlite3
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from xml.etree import ElementTree as ET
from zipfile import ZipFile


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


@dataclass
class PlayerRecord:
    name: str
    number: Optional[int]
    dni: str


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    workbook = load_workbook(Path(args.file))
    sheet_name, header_row_index, header_cells = find_roster_header(workbook)
    players = extract_players(workbook[sheet_name], header_row_index, header_cells)

    if not players:
        raise SystemExit("No se encontraron jugadores en la planilla.")

    team_name = args.team_name or infer_team_name(workbook[sheet_name], header_row_index)
    if not team_name:
        raise SystemExit(
            "No se pudo inferir el nombre del equipo. Usa --team-name para indicarlo."
        )

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row

    try:
        team = find_team(conn, team_name)
        if team is None:
            raise SystemExit(f"No existe un equipo compatible con '{team_name}' en la base.")

        inserted, updated, deactivated = upsert_players(conn, team["id"], players)
        conn.commit()
    finally:
        conn.close()

    print(f"Equipo: {team['name']} (id={team['id']})")
    print(f"Hoja detectada: {sheet_name}")
    print(f"Jugadores detectados: {len(players)}")
    print(f"Insertados: {inserted}")
    print(f"Actualizados: {updated}")
    print(f"Desactivados: {deactivated}")
    for player in players:
        label = f"{player.number}" if player.number is not None else "-"
        dni = player.dni or "sin-dni"
        print(f"- {label}: {player.name} [{dni}]")

    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Importa jugadores desde una planilla XLSX a la base SQLite del torneo."
    )
    parser.add_argument("--db", required=True, help="Ruta a la base SQLite.")
    parser.add_argument("--file", required=True, help="Ruta al archivo XLSX.")
    parser.add_argument(
        "--team-name",
        help="Nombre del equipo en la base. Si no se pasa, se intenta inferir desde la planilla.",
    )
    return parser


def load_workbook(path: Path) -> Dict[str, List[Tuple[int, Dict[str, str]]]]:
    with ZipFile(path) as archive:
        shared_strings = load_shared_strings(archive)
        workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
        rels_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {node.attrib["Id"]: node.attrib["Target"] for node in rels_root}
        sheets: Dict[str, List[Tuple[int, Dict[str, str]]]] = {}

        for sheet in workbook_root.find("a:sheets", NS):
            name = sheet.attrib["name"]
            rel_id = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            target = rel_map[rel_id]
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            sheets[name] = list(iter_sheet_rows(archive, target, shared_strings))

        return sheets


def load_shared_strings(archive: ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: List[str] = []

    for item in root.findall("a:si", NS):
        text = "".join(node.text or "" for node in item.iterfind(".//a:t", NS))
        strings.append(text)

    return strings


def iter_sheet_rows(
    archive: ZipFile, sheet_path: str, shared_strings: List[str]
) -> Iterable[Tuple[int, Dict[str, str]]]:
    root = ET.fromstring(archive.read(sheet_path))

    for row in root.findall(".//a:sheetData/a:row", NS):
        row_index = int(row.attrib["r"])
        cells: Dict[str, str] = {}

        for cell in row.findall("a:c", NS):
            ref = cell.attrib.get("r", "")
            column = extract_column_name(ref)
            value = read_cell_value(cell, shared_strings)
            cells[column] = value

        yield row_index, cells


def read_cell_value(cell: ET.Element, shared_strings: List[str]) -> str:
    cell_type = cell.attrib.get("t")
    value_node = cell.find("a:v", NS)

    if cell_type == "s" and value_node is not None:
        return shared_strings[int(value_node.text)]

    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.iterfind(".//a:t", NS))

    if value_node is not None and value_node.text is not None:
        return value_node.text

    return ""


def extract_column_name(ref: str) -> str:
    match = re.match(r"([A-Z]+)\d+", ref)
    return match.group(1) if match else ref


def find_roster_header(
    workbook: Dict[str, List[Tuple[int, Dict[str, str]]]]
) -> Tuple[str, int, Dict[str, str]]:
    for sheet_name, rows in workbook.items():
        for row_index, cells in rows:
            normalized = {column: normalize_text(value) for column, value in cells.items() if value}
            values = set(normalized.values())
            if "jugadores" not in values:
                continue

            if any(condense_text(value) == "n" for value in values):
                return sheet_name, row_index, cells

            return sheet_name, row_index, cells

    raise SystemExit("No se encontro una cabecera de jugadores en el archivo.")


def extract_players(
    rows: List[Tuple[int, Dict[str, str]]], header_row_index: int, header_cells: Dict[str, str]
) -> List[PlayerRecord]:
    name_column = detect_column(header_cells, {"jugadores"})
    number_column = detect_column(header_cells, {"n", "nro", "numero"})
    dni_column = detect_column(header_cells, {"dni", "documento"})

    if not name_column:
        raise SystemExit("No se pudo identificar la columna de nombres en la planilla.")

    players: List[PlayerRecord] = []
    started = False

    for row_index, cells in rows:
        if row_index <= header_row_index:
            continue

        raw_number = clean_spaces(cells.get(number_column, "")) if number_column else ""
        name = clean_player_name(cells.get(name_column, ""))
        number = parse_number(raw_number) if number_column else None
        dni = normalize_dni(cells.get(dni_column, "")) if dni_column else ""

        if not name:
            if started and raw_number and is_staff_marker(raw_number):
                break
            if started:
                break
            continue

        if raw_number and is_staff_marker(raw_number):
            break

        if number is None:
            continue

        started = True
        players.append(PlayerRecord(name=name, number=number, dni=dni))

    return dedupe_players(players)


def detect_column(header_cells: Dict[str, str], expected_names: set[str]) -> Optional[str]:
    for column, value in header_cells.items():
        condensed = condense_text(value)
        if condensed in expected_names:
            return column
    return None


def infer_team_name(
    rows: List[Tuple[int, Dict[str, str]]], header_row_index: int
) -> Optional[str]:
    for row_index, cells in rows:
        if row_index >= header_row_index:
            break
        for value in cells.values():
            text = clean_spaces(value)
            if not text:
                continue
            normalized = normalize_text(text)
            if normalized.startswith("nombre del equipo"):
                parts = text.split(":", 1)
                return clean_spaces(parts[1]) if len(parts) > 1 else None

    candidates: List[str] = []
    for row_index, cells in rows:
        if row_index >= header_row_index:
            break
        for value in cells.values():
            text = clean_spaces(value)
            normalized = normalize_text(text)
            if not text:
                continue
            if normalized in {
                "torneo mayores de 30",
                "fecha",
                "rival",
                "resultado",
            }:
                continue
            if any(word in normalized for word in ("delegado", "director tecnico")):
                continue
            if len(normalized) >= 4:
                candidates.append(text)

    return max(candidates, key=len) if candidates else None


def find_team(conn: sqlite3.Connection, requested_name: str) -> Optional[sqlite3.Row]:
    rows = conn.execute("SELECT id, name FROM teams ORDER BY id").fetchall()
    requested_key = normalize_team_name(requested_name)

    for row in rows:
        if normalize_team_name(row["name"]) == requested_key:
            return row

    for row in rows:
        if requested_key in normalize_team_name(row["name"]):
            return row

    return None


def upsert_players(
    conn: sqlite3.Connection, team_id: int, players: List[PlayerRecord]
) -> Tuple[int, int, int]:
    now = current_timestamp()
    existing_rows = conn.execute(
        """
        SELECT id, name, number, dni
        FROM players
        WHERE team_id = ?
        """,
        (team_id,),
    ).fetchall()

    existing_by_dni: Dict[str, List[sqlite3.Row]] = {}
    existing_by_name: Dict[str, List[sqlite3.Row]] = {}

    for row in existing_rows:
        dni_key = normalize_dni(row["dni"])
        name_key = normalize_team_name(row["name"])
        if dni_key:
            existing_by_dni.setdefault(dni_key, []).append(row)
        if name_key:
            existing_by_name.setdefault(name_key, []).append(row)

    seen_ids = set()
    inserted = 0
    updated = 0

    for player in players:
        existing = None
        if player.dni:
            existing = first_unused(existing_by_dni.get(player.dni, []), seen_ids)
        if existing is None:
            existing = first_unused(
                existing_by_name.get(normalize_team_name(player.name), []),
                seen_ids,
            )

        if existing is None:
            conn.execute(
                """
                INSERT INTO players (team_id, name, number, position, is_active, created_at, dni)
                VALUES (?, ?, ?, '', 1, ?, ?)
                """,
                (team_id, player.name, player.number, now, player.dni),
            )
            inserted += 1
            continue

        seen_ids.add(existing["id"])
        conn.execute(
            """
            UPDATE players
            SET name = ?, number = ?, dni = ?, is_active = 1
            WHERE id = ?
            """,
            (player.name, player.number, player.dni, existing["id"]),
        )
        updated += 1

    deactivated = 0
    for row in existing_rows:
        if row["id"] in seen_ids:
            continue
        conn.execute("UPDATE players SET is_active = 0 WHERE id = ?", (row["id"],))
        deactivated += 1

    return inserted, updated, deactivated


def parse_number(value: str) -> Optional[int]:
    digits = normalize_dni(value)
    return int(digits) if digits else None


def clean_player_name(value: str) -> str:
    return clean_spaces(value)


def clean_spaces(value: str) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_dni(value: str) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def normalize_text(value: str) -> str:
    ascii_text = strip_accents(str(value or ""))
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return " ".join(ascii_text.split())


def condense_text(value: str) -> str:
    return normalize_text(value).replace(" ", "")


def normalize_team_name(value: str) -> str:
    normalized = normalize_text(value)
    normalized = normalized.replace(" fc ", " ")
    normalized = normalized.replace(" fc", "")
    return " ".join(normalized.split())


def strip_accents(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch))


def current_timestamp() -> str:
    return __import__("datetime").datetime.now().isoformat(timespec="seconds")


def is_staff_marker(value: str) -> bool:
    condensed = condense_text(value)
    return condensed in {"dt", "adt", "audt", "auxdt", "aydt"}


def dedupe_players(players: List[PlayerRecord]) -> List[PlayerRecord]:
    unique: List[PlayerRecord] = []
    seen_keys = set()

    for player in players:
        key = player.dni or normalize_team_name(player.name)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        unique.append(player)

    return unique


def first_unused(rows: List[sqlite3.Row], used_ids: set[int]) -> Optional[sqlite3.Row]:
    for row in rows:
        if row["id"] not in used_ids:
            return row
    return None


if __name__ == "__main__":
    sys.exit(main())
