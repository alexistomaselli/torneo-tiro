/**
 * init_torneo_corto.js
 * Script one-shot para crear el Torneo Corto 2026 (Zonas A y B)
 * Basado en la tabla final del Apertura 2026 con "Simular quita de puntos" activo.
 *
 * Zonas:
 *   Zona A (posiciones impares): Pollo Mio, T3RCER TI3MPO, Improvisemos, Sabor Casero, Acinom II
 *   Zona B (posiciones pares):   Orden Maderas, Piedritas FC, El Distinto Don Ramon, La Leñera FC, Criollos
 *
 * Uso: node init_torneo_corto.js
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'data', 'contabilidad.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const nowIso = () => new Date().toISOString();

// ── GRUPOS ── (team_id, group_name) basado en tabla final con simulación de puntos
// Posición 1 → Pollo Mio (id=7) → Zona A (impar)
// Posición 2 → Orden Maderas (id=2) → Zona B (par)
// Posición 3 → T3RCER TI3MPO (id=4) → Zona A
// Posición 4 → Piedritas FC (id=9) → Zona B
// Posición 5 → Improvisemos (id=8) → Zona A
// Posición 6 → El Distinto Don Ramon (id=3) → Zona B
// Posición 7 → Sabor Casero (id=5) → Zona A
// Posición 8 → La Leñera FC (id=6) → Zona B
// Posición 9 → Acinom II (id=1) → Zona A
// Posición 10 → Criollos (id=10) → Zona B

const ZONA_A = [
  { id: 7, name: 'Pollo Mio' },
  { id: 4, name: 'T3RCER TI3MPO' },
  { id: 8, name: 'Improvisemos' },
  { id: 5, name: 'Sabor Casero' },
  { id: 1, name: 'Acinom II' },
];

const ZONA_B = [
  { id: 2, name: 'Orden Maderas' },
  { id: 9, name: 'Piedritas FC' },
  { id: 3, name: 'El Distinto Don Ramon' },
  { id: 6, name: 'La Leñera FC' },
  { id: 10, name: 'Criollos' },
];

/**
 * Genera partidos round-robin para n=5 equipos (odd round-robin con bye).
 * 5 rondas × 2 partidos = 10 partidos por zona. Cada equipo juega 4 veces.
 */
function generateZoneMatches(groupTeams, phaseTournamentId) {
  const n = groupTeams.length; // 5
  const allMatches = [];
  for (let r = 0; r < n; r++) {
    const rot = [...groupTeams.slice(r), ...groupTeams.slice(0, r)];
    const round = r + 1;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const a = rot[i];
      const b = rot[n - 2 - i]; // avoids rot[n-1] (bye)
      allMatches.push({
        phaseTournamentId,
        roundNumber: round,
        homeTeamId: (r + i) % 2 === 0 ? a.id : b.id,
        awayTeamId: (r + i) % 2 === 0 ? b.id : a.id,
      });
    }
  }
  return allMatches;
}

try {
  const now = nowIso();

  // ── 1. Verificar si ya existe la fase del Torneo Corto ──
  const existingPhase = db.prepare("SELECT id FROM phases WHERE name = 'clausura' AND year = 2026").get();
  if (existingPhase) {
    console.log('⚠️  La fase del Torneo Corto 2026 ya existe (id=' + existingPhase.id + ').');
    console.log('   Para regenerarla, eliminá la fase manualmente y volvé a correr el script.');
    process.exit(0);
  }

  // ── 2. Crear la phase "Torneo Corto 2026" ──
  const phaseRes = db.prepare(
    'INSERT INTO phases (year, name, label, created_at) VALUES (?, ?, ?, ?)'
  ).run(2026, 'clausura', 'Torneo Corto 2026', now);
  const phaseId = Number(phaseRes.lastInsertRowid);
  console.log(`✅ Phase creada: id=${phaseId} (Torneo Corto 2026)`);

  // ── 3. Crear phase_tournament de tipo 'zonas' ──
  const ptRes = db.prepare(
    'INSERT INTO phase_tournaments (phase_id, type, label, is_complete, created_at) VALUES (?, ?, ?, 0, ?)'
  ).run(phaseId, 'zonas', 'Torneo Corto — Zonas A y B', now);
  const ptId = Number(ptRes.lastInsertRowid);
  console.log(`✅ Phase tournament creado: id=${ptId} (Zonas A y B)`);

  // ── 4. Asignar equipos a los grupos ──
  const insertGroup = db.prepare(
    'INSERT INTO t2_groups (phase_tournament_id, team_id, group_name) VALUES (?, ?, ?)'
  );
  for (const team of ZONA_A) {
    insertGroup.run(ptId, team.id, 'A');
  }
  for (const team of ZONA_B) {
    insertGroup.run(ptId, team.id, 'B');
  }
  console.log(`✅ Grupos asignados:`);
  console.log(`   Zona A: ${ZONA_A.map(t => t.name).join(', ')}`);
  console.log(`   Zona B: ${ZONA_B.map(t => t.name).join(', ')}`);

  // ── 5. Generar partidos de cada zona ──
  const insertMatch = db.prepare(`
    INSERT INTO matches (phase_tournament_id, round_number, home_team_id, away_team_id, status, created_at)
    VALUES (?, ?, ?, ?, 'scheduled', ?)
  `);

  const matchesA = generateZoneMatches(ZONA_A, ptId);
  const matchesB = generateZoneMatches(ZONA_B, ptId);

  for (const m of [...matchesA, ...matchesB]) {
    insertMatch.run(m.phaseTournamentId, m.roundNumber, m.homeTeamId, m.awayTeamId, now);
  }

  console.log(`✅ Partidos generados: ${matchesA.length} en Zona A + ${matchesB.length} en Zona B = ${matchesA.length + matchesB.length} total`);

  // ── 6. Verificación final ──
  const totalMatches = db.prepare('SELECT COUNT(*) AS c FROM matches WHERE phase_tournament_id = ?').get(ptId);
  const totalGroups = db.prepare('SELECT COUNT(*) AS c FROM t2_groups WHERE phase_tournament_id = ?').get(ptId);
  console.log(`\n📊 Verificación:`);
  console.log(`   phase_tournament_id = ${ptId}`);
  console.log(`   Grupos asignados: ${Number(totalGroups.c)}/10`);
  console.log(`   Partidos en DB: ${Number(totalMatches.c)} (esperados: 20)`);

  // Print the schedule
  const allMatches = db.prepare(`
    SELECT m.round_number, ht.name AS home, at2.name AS away
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at2 ON at2.id = m.away_team_id
    WHERE m.phase_tournament_id = ?
    ORDER BY m.round_number, m.id
  `).all(ptId);

  console.log(`\n📅 Fixture generado:`);
  let currentRound = 0;
  for (const m of allMatches) {
    if (m.round_number !== currentRound) {
      currentRound = m.round_number;
      console.log(`\n  Fecha ${currentRound}:`);
    }
    console.log(`    ${m.home} vs ${m.away}`);
  }

  console.log('\n🎉 Torneo Corto 2026 inicializado correctamente.');
  console.log(`   phaseId=${phaseId}, phaseTournamentId=${ptId}`);

} catch (err) {
  console.error('❌ Error durante la inicialización:', err);
  process.exit(1);
}
