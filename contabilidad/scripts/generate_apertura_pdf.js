const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const PDFDocument = require('pdfkit');

const DB_PATH = path.join(__dirname, '..', 'data', 'contabilidad.sqlite');
const OUTPUT_PDF = path.join(__dirname, '..', 'public', 'Reporte_Oficial_Apertura_2026.pdf');

const db = new DatabaseSync(DB_PATH);

function mapPlainObject(row) {
  if (!row) return row;
  const obj = {};
  for (const key of Object.keys(row)) {
    obj[key] = row[key];
  }
  return obj;
}

function computeStandings(phaseTournamentId, groupName = null) {
  let teams;
  if (groupName) {
    teams = db.prepare(`
      SELECT t.id, t.name
      FROM t2_groups g JOIN teams t ON t.id = g.team_id
      WHERE g.phase_tournament_id = ? AND g.group_name = ?
    `).all(phaseTournamentId, groupName.toUpperCase()).map(mapPlainObject);
  } else {
    teams = db.prepare('SELECT id, name FROM teams').all().map(mapPlainObject);
  }

  if (!teams.length) return [];

  const teamIdSet = new Set(teams.map(t => t.id));
  const playedMatches = db.prepare(`
    SELECT home_team_id AS homeTeamId, away_team_id AS awayTeamId,
           home_goals AS homeGoals, away_goals AS awayGoals
    FROM matches WHERE phase_tournament_id = ? AND status = 'played'
  `).all(phaseTournamentId).map(mapPlainObject);

  const stats = {};
  for (const t of teams) {
    stats[t.id] = { id: t.id, name: t.name, played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  }

  for (const m of playedMatches) {
    const home = stats[m.homeTeamId];
    const away = stats[m.awayTeamId];
    if (home && away) {
      home.played++; away.played++;
      home.gf += m.homeGoals; home.ga += m.awayGoals;
      away.gf += m.awayGoals; away.ga += m.homeGoals;
      if (m.homeGoals > m.awayGoals) { home.won++; home.pts += 3; away.lost++; }
      else if (m.homeGoals < m.awayGoals) { away.won++; away.pts += 3; home.lost++; }
      else { home.draw++; home.pts += 1; away.draw++; away.pts += 1; }
    }
  }

  return Object.values(stats).map(s => {
    s.gd = s.gf - s.ga;
    return s;
  }).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name));
}

// Fetch data from SQLite
function getData() {
  const standingsLargo = computeStandings(1, null);
  const standingsZonaA = computeStandings(2, 'A');
  const standingsZonaB = computeStandings(2, 'B');

  // 4. Scorers in Apertura (phase_id = 1)
  const scorers = db.prepare(`
    SELECT p.name AS playerName, t.name AS teamName, COUNT(g.id) AS goals
    FROM match_goals g
    JOIN players p ON p.id = g.player_id
    JOIN teams t ON t.id = p.team_id
    JOIN matches m ON m.id = g.match_id
    JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
    WHERE g.is_own_goal = 0 AND pt.phase_id = 1
    GROUP BY p.id
    ORDER BY goals DESC, p.name ASC
  `).all().map(mapPlainObject);

  // 5. Cards Ranking in Apertura (phase_id = 1)
  const cards = db.prepare(`
    SELECT p.id, p.name AS playerName, t.id AS teamId, t.name AS teamName,
           SUM(CASE WHEN mc.card_type = 'yellow' THEN 1 ELSE 0 END) AS yellowCards,
           SUM(CASE WHEN mc.card_type = 'red' THEN 1 ELSE 0 END) AS redCards
    FROM match_cards mc
    JOIN players p ON p.id = mc.player_id
    JOIN teams t ON t.id = p.team_id
    JOIN matches m ON m.id = mc.match_id
    JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
    WHERE pt.phase_id = 1
    GROUP BY p.id
    ORDER BY yellowCards DESC, redCards DESC, p.name ASC
  `).all().map(mapPlainObject);

  cards.forEach(p => {
    if (p.yellowCards >= 4) {
      const yellows = db.prepare(`
        SELECT mc.id AS cardId, mc.match_id AS matchId
        FROM match_cards mc
        JOIN matches m ON m.id = mc.match_id
        JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
        WHERE mc.player_id = ? AND mc.card_type = 'yellow' AND pt.phase_id = 1
        ORDER BY m.id ASC, mc.id ASC
      `).all(p.id).map(mapPlainObject);

      if (yellows.length >= 4) {
        const triggerCard = yellows[3];
        const servedRow = db.prepare(`
          SELECT COUNT(*) AS count
          FROM matches m2
          WHERE m2.status = 'played'
            AND (m2.home_team_id = ? OR m2.away_team_id = ?)
            AND m2.id > ?
        `).get(p.teamId, p.teamId, triggerCard.matchId);

        const servedMatches = Number(servedRow ? servedRow.count : 0);
        p.yellowServedMatches = servedMatches;
        p.yellowSuspensionStatus = servedMatches >= 1 ? 'cumplida' : 'pendiente';
      }
    }
  });

  return { standingsLargo, standingsZonaA, standingsZonaB, scorers, cards };
}

function generatePDF() {
  const data = getData();
  const doc = new PDFDocument({
    size: 'A4',
    margin: 35,
    bufferPages: true
  });

  doc.pipe(fs.createWriteStream(OUTPUT_PDF));

  // Colors
  const PRIMARY = '#0f172a';
  const SECONDARY = '#0284c7';
  const PITCH = '#059669';
  const AMBER = '#d97706';
  const RED = '#dc2626';
  const BG_LIGHT = '#f8fafc';
  const BORDER_COLOR = '#e2e8f0';

  // Helper Header Function
  function drawHeader(title, subtitle) {
    doc.rect(35, 25, 525, 45).fill(PRIMARY);
    doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(title.toUpperCase(), 45, 33, { width: 505 });
    doc.fillColor('#10b981').fontSize(9).font('Helvetica-Bold').text(subtitle.toUpperCase(), 45, 52, { width: 505 });
  }

  // -------------------------------------------------------------
  // PAGE 1: RESUMEN FINALES
  // -------------------------------------------------------------
  drawHeader('Torneo Tiro — Reporte Oficial de Cierre', 'Temporada Apertura 2026 · Resultados e Incidencias de Finales');

  doc.y = 80;

  // Banner Campeón Apertura
  doc.rect(35, doc.y, 525, 65).fillAndStroke('#ecfdf5', '#a7f3d0');
  let startY = doc.y + 10;
  doc.fillColor(PITCH).fontSize(10).font('Helvetica-Bold').text('🎉 CAMPEÓN OFICIAL DEL TORNEO APERTURA 2026 🎉', 45, startY, { align: 'center' });
  doc.fillColor(PRIMARY).fontSize(18).font('Helvetica-Bold').text('ORDEN MADERAS', 45, startY + 16, { align: 'center' });
  doc.fillColor('#475569').fontSize(9).font('Helvetica').text('Ganador de la Gran Final Apertura vs. Pollo Mío (2 - 0)', 45, startY + 38, { align: 'center' });

  doc.y += 80;

  // Box 1: Gran Final Apertura
  doc.rect(35, doc.y, 525, 175).fillAndStroke(BG_LIGHT, BORDER_COLOR);
  let box1Y = doc.y + 12;

  doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('🏆 GRAN FINAL DEL TORNEO APERTURA 2026', 45, box1Y);
  doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('Ganador Torneo Largo vs. Ganador Torneo Corto', 45, box1Y + 14);

  // Score Box
  doc.rect(45, box1Y + 30, 505, 32).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('ORDEN MADERAS   2  :  0   POLLO MÍO', 45, box1Y + 40, { align: 'center' });

  // Incidencias Row
  let incY = box1Y + 70;
  doc.fillColor(PRIMARY).fontSize(9).font('Helvetica-Bold').text('Incidencias y Sanciones del Partido:', 45, incY);

  incY += 14;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Orden Maderas (2):', 45, incY);
  doc.font('Helvetica').text('⚽ Mariano Falcón (x2) (Goles en min 15\' y 42\')', 140, incY);
  incY += 12;
  doc.text('🟡 Tarjetas Amarillas: Jonathan Lamanno, Alexis Tomaselli, Federico Barbera, Rodrigo Cano', 140, incY);

  incY += 16;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Pollo Mío (0):', 45, incY);
  doc.font('Helvetica').text('🟡 Tarjetas Amarillas: Maximiliano Córdoba', 140, incY);
  incY += 12;
  doc.fillColor(RED).font('Helvetica-Bold').text('🔴 Tarjetas Rojas: Alejandro Suárez (1 fecha), Cristian Paéz (1 fecha)', 140, incY);

  doc.y = box1Y + 185;

  // Box 2: Final Torneo Corto
  doc.rect(35, doc.y, 525, 160).fillAndStroke(BG_LIGHT, BORDER_COLOR);
  let box2Y = doc.y + 12;

  doc.fillColor(PRIMARY).fontSize(11).font('Helvetica-Bold').text('🏆 FINAL DEL TORNEO CORTO APERTURA (ZONAS A Y B)', 45, box2Y);
  doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('Definición del Ganador del Torneo Corto', 45, box2Y + 14);

  // Score Box
  doc.rect(45, box2Y + 30, 505, 32).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('ORDEN MADERAS   1  :  1   ACINOM II', 45, box2Y + 37, { align: 'center' });
  doc.fillColor('#fbbf24').fontSize(8).font('Helvetica-Bold').text('Penales: 4 - 3 (Ganó Orden Maderas)', 45, box2Y + 50, { align: 'center' });

  // Incidencias Row
  let inc2Y = box2Y + 70;
  doc.fillColor(PRIMARY).fontSize(9).font('Helvetica-Bold').text('Incidencias del Partido:', 45, inc2Y);

  inc2Y += 14;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Orden Maderas (1):', 45, inc2Y);
  doc.font('Helvetica').text('⚽ Jonatan Lamano (Gol)', 140, inc2Y);
  inc2Y += 12;
  doc.text('🟡 Tarjetas Amarillas: Mariano Falcón, Federico Barbera', 140, inc2Y);

  inc2Y += 16;
  doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Acinom II (1):', 45, inc2Y);
  doc.font('Helvetica').text('⚽ Diego Larramendi (Gol)', 140, inc2Y);
  inc2Y += 12;
  doc.text('🟡 Tarjetas Amarillas: José Berneche, Franco Aicardi, Alexis Oscar Masch', 140, inc2Y);

  // -------------------------------------------------------------
  // PAGE 2: TABLAS DE POSICIONES
  // -------------------------------------------------------------
  doc.addPage();
  drawHeader('Tablas de Posiciones Oficiales', 'Temporada Apertura 2026 · Clasificación General y Por Zonas');

  let curY = 80;

  // Table 1: Torneo Largo
  doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold').text('1. Torneo Largo Apertura (11 Fechas - Todos contra Todos)', 35, curY);
  curY += 15;

  // Table Header
  doc.rect(35, curY, 525, 18).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  doc.text('#', 42, curY + 5, { width: 20 });
  doc.text('EQUIPO', 65, curY + 5, { width: 180 });
  doc.text('PJ', 250, curY + 5, { width: 30, align: 'center' });
  doc.text('PG', 285, curY + 5, { width: 30, align: 'center' });
  doc.text('PE', 320, curY + 5, { width: 30, align: 'center' });
  doc.text('PP', 355, curY + 5, { width: 30, align: 'center' });
  doc.text('GF', 390, curY + 5, { width: 30, align: 'center' });
  doc.text('GC', 425, curY + 5, { width: 30, align: 'center' });
  doc.text('DIF', 460, curY + 5, { width: 35, align: 'center' });
  doc.text('PTS', 500, curY + 5, { width: 50, align: 'center' });

  curY += 18;

  data.standingsLargo.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(35, curY, 525, 16).fill(bg);
    doc.fillColor('#334155').fontSize(8).font('Helvetica');
    doc.font('Helvetica-Bold').text(`${idx + 1}`, 42, curY + 4, { width: 20 });
    doc.font('Helvetica-Bold').text(row.name, 65, curY + 4, { width: 180 });
    doc.font('Helvetica').text(`${row.played}`, 250, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.won}`, 285, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.draw}`, 320, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.lost}`, 355, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.gf}`, 390, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.ga}`, 425, curY + 4, { width: 30, align: 'center' });
    doc.text(`${row.gd > 0 ? '+' : ''}${row.gd}`, 460, curY + 4, { width: 35, align: 'center' });
    doc.fillColor(PRIMARY).font('Helvetica-Bold').text(`${row.pts}`, 500, curY + 4, { width: 50, align: 'center' });
    curY += 16;
  });

  curY += 20;

  // Table 2: Zonas A & B
  doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold').text('2. Torneo Corto Apertura (Fase de Zonas A y B)', 35, curY);
  curY += 15;

  // Function to render mini table
  function renderGroupTable(title, groupData, startX, startYWidth) {
    doc.rect(startX, startYWidth, 255, 16).fill(PRIMARY);
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold').text(title, startX + 8, startYWidth + 4);

    let gY = startYWidth + 16;
    doc.rect(startX, gY, 255, 16).fill('#334155');
    doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
    doc.text('#', startX + 5, gY + 4, { width: 15 });
    doc.text('EQUIPO', startX + 22, gY + 4, { width: 110 });
    doc.text('PJ', startX + 135, gY + 4, { width: 20, align: 'center' });
    doc.text('DIF', startX + 160, gY + 4, { width: 25, align: 'center' });
    doc.text('PTS', startX + 190, gY + 4, { width: 55, align: 'center' });

    gY += 16;
    groupData.forEach((row, idx) => {
      const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
      doc.rect(startX, gY, 255, 16).fill(bg);
      doc.fillColor('#334155').fontSize(7.5).font('Helvetica');
      doc.font('Helvetica-Bold').text(`${idx + 1}`, startX + 5, gY + 4, { width: 15 });
      doc.font('Helvetica-Bold').text(row.name, startX + 22, gY + 4, { width: 110 });
      doc.font('Helvetica').text(`${row.played}`, startX + 135, gY + 4, { width: 20, align: 'center' });
      doc.text(`${row.gd > 0 ? '+' : ''}${row.gd}`, startX + 160, gY + 4, { width: 25, align: 'center' });
      doc.fillColor(PRIMARY).font('Helvetica-Bold').text(`${row.pts}`, startX + 190, gY + 4, { width: 55, align: 'center' });
      gY += 16;
    });
  }

  renderGroupTable('ZONA A', data.standingsZonaA, 35, curY);
  renderGroupTable('ZONA B', data.standingsZonaB, 305, curY);

  // -------------------------------------------------------------
  // PAGE 3: GOLEADORES Y RANKING DISCIPLINARIO
  // -------------------------------------------------------------
  doc.addPage();
  drawHeader('Estadísticas Individuales y Disciplina', 'Temporada Apertura 2026 · Goleadores y Sanciones Cumplidas / Pendientes');

  let p3Y = 80;

  // Goleadores (Top 8)
  doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold').text('1. Top Goleadores del Apertura (Torneo Largo + Corto + Finales)', 35, p3Y);
  p3Y += 15;

  doc.rect(35, p3Y, 525, 16).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  doc.text('#', 42, p3Y + 4, { width: 20 });
  doc.text('JUGADOR', 70, p3Y + 4, { width: 220 });
  doc.text('EQUIPO', 300, p3Y + 4, { width: 180 });
  doc.text('GOLES', 490, p3Y + 4, { width: 60, align: 'center' });

  p3Y += 16;
  const topScorers = data.scorers.slice(0, 8);
  topScorers.forEach((s, idx) => {
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(35, p3Y, 525, 15).fill(bg);
    doc.fillColor('#334155').fontSize(8).font('Helvetica');
    doc.font('Helvetica-Bold').text(`${idx + 1}`, 42, p3Y + 3, { width: 20 });
    doc.font('Helvetica-Bold').text(s.playerName, 70, p3Y + 3, { width: 220 });
    doc.font('Helvetica').text(s.teamName, 300, p3Y + 3, { width: 180 });
    doc.fillColor(PITCH).font('Helvetica-Bold').text(`${s.goals} ⚽`, 490, p3Y + 3, { width: 60, align: 'center' });
    p3Y += 15;
  });

  p3Y += 20;

  // Ranking Disciplinario
  doc.fillColor(PRIMARY).fontSize(10).font('Helvetica-Bold').text('2. Ranking Disciplinario (Amarillas, Rojas y Sanciones por 4 Amarillas)', 35, p3Y);
  p3Y += 15;

  doc.rect(35, p3Y, 525, 16).fill('#1e293b');
  doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
  doc.text('JUGADOR', 42, p3Y + 4, { width: 160 });
  doc.text('EQUIPO', 210, p3Y + 4, { width: 130 });
  doc.text('AMARILLAS', 350, p3Y + 4, { width: 80, align: 'center' });
  doc.text('ESTADO DE SANCIÓN POR 4 AMARILLAS', 435, p3Y + 4, { width: 120, align: 'center' });

  p3Y += 16;
  const topCards = data.cards.slice(0, 10);
  topCards.forEach((c, idx) => {
    const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(35, p3Y, 525, 16).fill(bg);
    doc.fillColor('#334155').fontSize(7.5).font('Helvetica-Bold').text(c.playerName, 42, p3Y + 4, { width: 160 });
    doc.font('Helvetica').text(c.teamName, 210, p3Y + 4, { width: 130 });

    doc.fillColor(AMBER).font('Helvetica-Bold').text(`${c.yellowCards} 🟨`, 350, p3Y + 4, { width: 80, align: 'center' });

    if (c.yellowSuspensionStatus === 'cumplida') {
      doc.fillColor('#15803d').font('Helvetica-Bold').text('✓ 1 fecha cumplida', 435, p3Y + 4, { width: 120, align: 'center' });
    } else if (c.yellowSuspensionStatus === 'pendiente') {
      doc.fillColor('#b45309').font('Helvetica-Bold').text('⚠️ Susp. 1 fecha (Pendiente)', 435, p3Y + 4, { width: 120, align: 'center' });
    } else {
      doc.fillColor('#94a3b8').font('Helvetica').text('-', 435, p3Y + 4, { width: 120, align: 'center' });
    }
    p3Y += 16;
  });

  p3Y += 20;

  // Box Sanciones Pendientes para el Clausura
  doc.rect(35, p3Y, 525, 75).fillAndStroke('#fff1f2', '#fecdd3');
  doc.fillColor(RED).fontSize(9).font('Helvetica-Bold').text('⚠️ SANCIONES PENDIENTES PARA EL INICIO DEL CLAUSURA 2026', 45, p3Y + 10);

  doc.fillColor('#334155').fontSize(8).font('Helvetica');
  doc.text('• Alejandro Suárez (Pollo Mío): 1 fecha pendiente por expulsión en la Gran Final.', 55, p3Y + 26);
  doc.text('• Cristian Paéz (Pollo Mío): 1 fecha pendiente por expulsión en la Gran Final.', 55, p3Y + 38);
  doc.text('• Maximiliano Córdoba (Pollo Mío): 1 fecha pendiente por acumular 4 tarjetas amarillas.', 55, p3Y + 50);
  doc.text('• José Berneche (Acinom II): 1 fecha pendiente por acumular 4 tarjetas amarillas.', 55, p3Y + 62);

  // Global Page Footer
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fillColor('#94a3b8').fontSize(7.5).font('Helvetica').text(
      `Torneo Tiro — Documento Oficial de la Comisión Organizadora · Página ${i + 1} de ${totalPages}`,
      35,
      815,
      { align: 'center', width: 525 }
    );
  }

  doc.end();
  console.log('PDF generado exitosamente en:', OUTPUT_PDF);
}

generatePDF();
