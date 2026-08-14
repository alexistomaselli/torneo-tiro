const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, '..', 'data', 'contabilidad.sqlite');
const db = new DatabaseSync(DB_PATH);

console.log('--- START TEST ---');

// 1. Get original state
const originalPlayer = db.prepare('SELECT id, name, team_id FROM players WHERE id = 23').get();
console.log('Original Player:', originalPlayer);

// 2. Perform transfer to team 3
console.log('Simulating transfer of JONATHAN TISERA (id=23) from team 2 to team 3...');
db.prepare('UPDATE players SET team_id = 3 WHERE id = 23').run();

// 3. Verify in DB
const transferredPlayer = db.prepare('SELECT id, name, team_id FROM players WHERE id = 23').get();
console.log('Transferred Player:', transferredPlayer);

// 4. Query stats scorers dynamically (simulating what the API does)
const scorersRow = db.prepare(`
  SELECT p.id, p.name AS playerName, t.name AS teamName, COUNT(g.id) AS goals
  FROM match_goals g
  JOIN players p ON p.id = g.player_id
  JOIN teams t ON t.id = p.team_id
  WHERE p.id = 23
  GROUP BY p.id
`).get();
console.log('Stats Scorers output for player 23:', scorersRow);

// 5. Revert back to original team
console.log('Reverting player 23 back to team 2...');
db.prepare('UPDATE players SET team_id = 2 WHERE id = 23').run();

const revertedPlayer = db.prepare('SELECT id, name, team_id FROM players WHERE id = 23').get();
console.log('Reverted Player:', revertedPlayer);

console.log('--- END TEST ---');
