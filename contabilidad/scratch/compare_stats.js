const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, '..', 'data', 'contabilidad.sqlite');
const db = new DatabaseSync(DB_PATH);

const pdfText = fs.readFileSync('/Users/alexi/.gemini/antigravity-ide/brain/a7051056-ec5b-4d21-9bf2-fc25adf13f62/scratch/pdf_stats.txt', 'utf8');
const lines = pdfText.split('\n').map(l => l.trim());

// 1. Parse Scorers from PDF
// We find the index of "GOLEADORES"
const scorersStartIndex = lines.findIndex(l => l.includes('GOLEADORES'));
const rankingStartIndex = lines.findIndex(l => l.includes('RANKING DISCIPLINARIO'));

const pdfGoals = {};
// Between scorersStartIndex and rankingStartIndex, we parse names and goals.
// Note: player names are followed by blank line and then a number.
// Since the layout has two blocks (names/goals then teams), the names and goals are sequential.
let i = scorersStartIndex + 1;
while (i < rankingStartIndex) {
  const line = lines[i];
  if (line && isNaN(line) && !line.includes('JUGADOR') && !line.includes('GOLES') && line !== 'C') {
    // Check if the next non-empty line after blank is a number
    let nextValIndex = i + 1;
    while (nextValIndex < rankingStartIndex && lines[nextValIndex] === '') {
      nextValIndex++;
    }
    const val = lines[nextValIndex];
    if (val && !isNaN(val)) {
      const goals = parseInt(val, 10);
      const nameUpper = line.toUpperCase();
      pdfGoals[nameUpper] = goals;
    }
  }
  i++;
}

// 2. Parse Cards from PDF
// Starting at rankingStartIndex + 1, we look for player names, yellow cards, red cards.
const pdfCards = {};
let j = rankingStartIndex + 1;
while (j < lines.length) {
  const line = lines[j];
  if (line === 'JUGADORES SUSPENDIDOS' || line.includes('GENERADO POR')) {
    break; // end of ranking
  }
  if (line && isNaN(line) && !line.includes('🟨') && !line.includes('🟥') && !line.includes('JUGADOR')) {
    // Check if next values are numbers (yellow, then red)
    let yIdx = j + 1;
    while (yIdx < lines.length && lines[yIdx] === '') yIdx++;
    const yVal = lines[yIdx];
    
    let rIdx = yIdx + 1;
    while (rIdx < lines.length && lines[rIdx] === '') rIdx++;
    const rVal = lines[rIdx];
    
    if (yVal && !isNaN(yVal) && rVal && !isNaN(rVal)) {
      const yellow = parseInt(yVal, 10);
      const red = parseInt(rVal, 10);
      const nameUpper = line.toUpperCase();
      pdfCards[nameUpper] = { yellow, red };
    }
  }
  j++;
}

console.log('Parsed PDF Scorers Count:', Object.keys(pdfGoals).length);
console.log('Parsed PDF Cards Count:', Object.keys(pdfCards).length);

// 3. Query Database Scorers for Tournament 1
const dbGoalsRaw = db.prepare(`
  SELECT p.name AS playerName, COUNT(g.id) AS goals
  FROM match_goals g
  JOIN players p ON p.id = g.player_id
  JOIN matches m ON m.id = g.match_id
  WHERE m.phase_tournament_id = 1 AND g.is_own_goal = 0
  GROUP BY p.id
`).all();

const dbGoals = {};
for (const row of dbGoalsRaw) {
  dbGoals[row.playerName.toUpperCase()] = row.goals;
}

// 4. Query Database Cards for Tournament 1
const dbCardsRaw = db.prepare(`
  SELECT p.name AS playerName,
         SUM(CASE WHEN mc.card_type = 'yellow' THEN 1 ELSE 0 END) AS yellow,
         SUM(CASE WHEN mc.card_type = 'red' THEN 1 ELSE 0 END) AS red
  FROM match_cards mc
  JOIN players p ON p.id = mc.player_id
  JOIN matches m ON m.id = mc.match_id
  WHERE m.phase_tournament_id = 1
  GROUP BY p.id
`).all();

const dbCards = {};
for (const row of dbCardsRaw) {
  dbCards[row.playerName.toUpperCase()] = { yellow: row.yellow, red: row.red };
}

// ── COMPARE GOALS ──
console.log('\n=== GOALS COMPARISON ===');
const allGoalPlayers = new Set([...Object.keys(pdfGoals), ...Object.keys(dbGoals)]);
let goalDiscrepancies = 0;
for (const player of allGoalPlayers) {
  const pdfVal = pdfGoals[player] || 0;
  const dbVal = dbGoals[player] || 0;
  if (pdfVal !== dbVal) {
    console.log(`❌ ${player}: PDF=${pdfVal} | DB=${dbVal}`);
    goalDiscrepancies++;
  }
}
if (goalDiscrepancies === 0) {
  console.log('✅ All goals match perfectly!');
}

// ── COMPARE CARDS ──
console.log('\n=== CARDS COMPARISON ===');
const allCardPlayers = new Set([...Object.keys(pdfCards), ...Object.keys(dbCards)]);
let cardDiscrepancies = 0;
for (const player of allCardPlayers) {
  const pdfVal = pdfCards[player] || { yellow: 0, red: 0 };
  const dbVal = dbCards[player] || { yellow: 0, red: 0 };
  if (pdfVal.yellow !== dbVal.yellow || pdfVal.red !== dbVal.red) {
    console.log(`❌ ${player}: PDF (Y:${pdfVal.yellow}, R:${pdfVal.red}) | DB (Y:${dbVal.yellow}, R:${dbVal.red})`);
    cardDiscrepancies++;
  }
}
if (cardDiscrepancies === 0) {
  console.log('✅ All cards match perfectly!');
}
