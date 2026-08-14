const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '..', 'data', 'contabilidad.sqlite');
const db = new DatabaseSync(DB_PATH);

console.log('--- START FIXTURE UPDATE ---');

// We will update each match for Zona A to align with the user's provided capture.

const updates = [
  // Fecha 1 (13-06)
  {
    id: 137,
    home: 7, // Pollo Mio
    away: 5, // Sabor Casero
    date: '2026-06-13',
    time: '13:15'
  },
  // Fecha 2 (20-06)
  {
    id: 139,
    home: 4, // T3RCER TI3MPO
    away: 5, // Sabor Casero
    date: '2026-06-20',
    time: '14:30'
  },
  {
    id: 140,
    home: 1, // Acinom II
    away: 7, // Pollo Mio
    date: '2026-06-20',
    time: '15:40'
  },
  // Fecha 3 (27-06)
  {
    id: 141,
    home: 8, // Improvisemos
    away: 7, // Pollo Mio
    date: '2026-06-27',
    time: '14:30'
  },
  {
    id: 142,
    home: 4, // T3RCER TI3MPO
    away: 1, // Acinom II
    date: '2026-06-27',
    time: '15:40'
  },
  // Fecha 4 (04-07)
  {
    id: 143,
    home: 5, // Sabor Casero
    away: 1, // Acinom II
    date: '2026-07-04',
    time: '13:15'
  },
  {
    id: 144,
    home: 8, // Improvisemos
    away: 4, // T3RCER TI3MPO
    date: '2026-07-04',
    time: '16:50'
  },
  // Fecha 5 (11-07)
  {
    id: 145,
    home: 7, // Pollo Mio
    away: 4, // T3RCER TI3MPO
    date: '2026-07-11',
    time: '13:15'
  },
  {
    id: 146,
    home: 5, // Sabor Casero
    away: 8, // Improvisemos
    date: '2026-07-11',
    time: '15:40'
  }
];

const stmt = db.prepare(`
  UPDATE matches 
  SET home_team_id = ?, away_team_id = ?, match_date = ?, match_time = ? 
  WHERE id = ?
`);

for (const u of updates) {
  console.log(`Updating match ${u.id}: Home=${u.home}, Away=${u.away}, Date=${u.date}, Time=${u.time}`);
  stmt.run(u.home, u.away, u.date, u.time, u.id);
}

console.log('--- VERIFICATION ---');
const updatedMatches = db.prepare(`
  SELECT m.id, m.round_number, 
         ht.name AS homeName, at.name AS awayName, 
         m.match_date, m.match_time 
  FROM matches m
  JOIN teams ht ON ht.id = m.home_team_id
  JOIN teams at ON at.id = m.away_team_id
  WHERE m.id IN (137, 138, 139, 140, 141, 142, 143, 144, 145, 146)
  ORDER BY m.round_number, m.id
`).all();

console.log(JSON.stringify(updatedMatches, null, 2));
console.log('--- END FIXTURE UPDATE ---');
