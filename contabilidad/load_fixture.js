const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = path.join(__dirname, 'data', 'contabilidad.sqlite');
const db = new DatabaseSync(dbPath);

const PHASE_TOURNAMENT_ID = 1;

const fixture = [
  // FECHA 1 (2026-03-28)
  { r: 1, d: '2026-03-28', t: '13:15', h: 9, a: 3 },
  { r: 1, d: '2026-03-28', t: '14:30', h: 8, a: 7 },
  { r: 1, d: '2026-03-28', t: '15:40', h: 6, a: 1 },
  { r: 1, d: '2026-03-28', t: '16:50', h: 5, a: 10 },
  { r: 1, d: '2026-03-28', t: '18:00', h: 2, a: 4 },

  // FECHA 2 (2026-04-04)
  { r: 2, d: '2026-04-04', t: '13:15', h: 8, a: 10 },
  { r: 2, d: '2026-04-04', t: '14:30', h: 3, a: 2 },
  { r: 2, d: '2026-04-04', t: '15:40', h: 7, a: 4 },
  { r: 2, d: '2026-04-04', t: '16:50', h: 5, a: 9 },

  // FECHA 3 (2026-04-11)
  { r: 3, d: '2026-04-11', t: '13:15', h: 4, a: 1 },
  { r: 3, d: '2026-04-11', t: '14:30', h: 6, a: 5 },
  { r: 3, d: '2026-04-11', t: '15:40', h: 2, a: 8 },
  { r: 3, d: '2026-04-11', t: '16:50', h: 10, a: 7 },

  // FECHA 4 (2026-04-18)
  { r: 4, d: '2026-04-18', t: '13:15', h: 3, a: 6 },
  { r: 4, d: '2026-04-18', t: '14:30', h: 1, a: 10 },
  { r: 4, d: '2026-04-18', t: '15:40', h: 5, a: 4 },
  { r: 4, d: '2026-04-18', t: '16:50', h: 2, a: 9 },

  // FECHA 5 (2026-04-25)
  { r: 5, d: '2026-04-25', t: '13:15', h: 7, a: 1 },
  { r: 5, d: '2026-04-25', t: '14:30', h: 6, a: 2 },
  { r: 5, d: '2026-04-25', t: '15:40', h: 9, a: 8 },
  { r: 5, d: '2026-04-25', t: '16:50', h: 4, a: 3 },

  // FECHA 6 (2026-05-02)
  { r: 6, d: '2026-05-02', t: '13:15', h: 5, a: 7 },
  { r: 6, d: '2026-05-02', t: '14:30', h: 8, a: 1 },
  { r: 6, d: '2026-05-02', t: '15:40', h: 3, a: 10 },
  { r: 6, d: '2026-05-02', t: '16:50', h: 9, a: 6 },

  // FECHA 7 (2026-05-09)
  { r: 7, d: '2026-05-09', t: '13:15', h: 4, a: 9 },
  { r: 7, d: '2026-05-09', t: '14:30', h: 10, a: 2 },
  { r: 7, d: '2026-05-09', t: '15:40', h: 7, a: 3 },
  { r: 7, d: '2026-05-09', t: '16:50', h: 1, a: 5 },

  // FECHA 8 (2026-05-16)
  { r: 8, d: '2026-05-16', t: '13:15', h: 8, a: 5 },
  { r: 8, d: '2026-05-16', t: '14:30', h: 3, a: 1 },
  { r: 8, d: '2026-05-16', t: '15:40', h: 9, a: 10 },
  { r: 8, d: '2026-05-16', t: '16:50', h: 6, a: 4 },

  // FECHA 9 (2026-05-23)
  { r: 9, d: '2026-05-23', t: '13:15', h: 10, a: 6 },
  { r: 9, d: '2026-05-23', t: '14:30', h: 4, a: 8 },
  { r: 9, d: '2026-05-23', t: '15:40', h: 7, a: 9 },
  { r: 9, d: '2026-05-23', t: '16:50', h: 1, a: 2 },

  // FECHA 10 (2026-05-30)
  { r: 10, d: '2026-05-30', t: '13:15', h: 2, a: 5 },
  { r: 10, d: '2026-05-30', t: '14:30', h: 4, a: 10 },
  { r: 10, d: '2026-05-30', t: '15:40', h: 6, a: 7 },
  { r: 10, d: '2026-05-30', t: '16:50', h: 8, a: 3 },

  // FECHA 11 (2026-06-06)
  { r: 11, d: '2026-06-06', t: '13:15', h: 2, a: 7 },
  { r: 11, d: '2026-06-06', t: '14:40', h: 5, a: 3 },
  { r: 11, d: '2026-06-06', t: '15:50', h: 9, a: 1 },
  { r: 11, d: '2026-06-06', t: '17:10', h: 6, a: 8 },
];

console.log('--- Iniciando carga de fixture (node:sqlite) ---');

try {
  const now = new Date().toISOString();

  // 1. Limpiar matches previos
  db.prepare('DELETE FROM matches WHERE phase_tournament_id = ?').run(PHASE_TOURNAMENT_ID);
  console.log('Matches previos eliminados.');

  // 2. Insertar nuevos
  const insertStmt = db.prepare(`
    INSERT INTO matches (phase_tournament_id, round_number, match_date, match_time, home_team_id, away_team_id, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const m of fixture) {
    insertStmt.run(PHASE_TOURNAMENT_ID, m.r, m.d, m.t, m.h, m.a, 'scheduled', now);
    count++;
  }

  console.log(`Fixture cargado con éxito (${count} partidos).`);
} catch (err) {
  console.error('Error durante la carga:', err);
}
