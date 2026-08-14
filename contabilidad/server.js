const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3010);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOGOS_DIR = path.join(ROOT_DIR, 'logos-equipos');
const DB_PATH = path.join(DATA_DIR, 'contabilidad.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    budget_cents INTEGER NOT NULL DEFAULT 0,
    start_date TEXT,
    end_date TEXT,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_number INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    occurred_on TEXT NOT NULL,
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_movements_occurred_on
  ON movements(occurred_on DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_movements_team_id
  ON movements(team_id);

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    name TEXT NOT NULL CHECK(name IN('apertura','clausura')),
    label TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS phase_tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id INTEGER NOT NULL REFERENCES phases(id),
    type TEXT NOT NULL CHECK(type IN('todos_contra_todos','zonas')),
    label TEXT NOT NULL,
    is_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS t2_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_tournament_id INTEGER NOT NULL REFERENCES phase_tournaments(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    group_name TEXT NOT NULL CHECK(group_name IN('A','B')),
    UNIQUE(phase_tournament_id, team_id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_tournament_id INTEGER NOT NULL REFERENCES phase_tournaments(id),
    round_number INTEGER NOT NULL,
    home_team_id INTEGER NOT NULL REFERENCES teams(id),
    away_team_id INTEGER NOT NULL REFERENCES teams(id),
    match_date TEXT,
    home_goals INTEGER CHECK(home_goals >= 0),
    away_goals INTEGER CHECK(away_goals >= 0),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','played')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_matches_phase_tournament
  ON matches(phase_tournament_id, round_number);

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    number INTEGER,
    position TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    card_type TEXT NOT NULL CHECK(card_type IN('yellow','red')),
    minute INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    minute INTEGER,
    is_own_goal INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
  CREATE INDEX IF NOT EXISTS idx_match_cards_match ON match_cards(match_id);
  CREATE INDEX IF NOT EXISTS idx_match_goals_match ON match_goals(match_id);
`);

seedTournamentIfNeeded();
seedTeamsIfNeeded();
seedFixtureIfNeeded();

// Safe migration: add dni column to players if not present
try { db.prepare("ALTER TABLE players ADD COLUMN dni TEXT").run(); } catch (_) {}
// Safe migration: add shield_url column to teams if not present
try { db.prepare("ALTER TABLE teams ADD COLUMN shield_url TEXT").run(); } catch (_) {}
try { db.prepare("ALTER TABLE matches ADD COLUMN match_time TEXT").run(); } catch (_) {}
// Safe migration: add points_deduction column to teams if not present
try { db.prepare("ALTER TABLE teams ADD COLUMN points_deduction INTEGER DEFAULT 0").run(); } catch (_) {}


const insertMovementStmt = db.prepare(`
  INSERT INTO movements (
    type,
    amount_cents,
    category,
    payment_method,
    description,
    occurred_on,
    team_id,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const updateMovementStmt = db.prepare(`
  UPDATE movements
  SET type = ?, amount_cents = ?, category = ?, payment_method = ?, description = ?, occurred_on = ?, team_id = ?
  WHERE id = ?
`);


const updateTeamStmt = db.prepare(`
  UPDATE teams
  SET name = ?, notes = ?, shield_url = ?, points_deduction = ?, updated_at = ?
  WHERE id = ?
`);

const deleteMovementStmt = db.prepare(`
  DELETE FROM movements
  WHERE id = ?
`);

const updateTournamentStmt = db.prepare(`
  UPDATE tournaments
  SET name = ?, budget_cents = ?, start_date = ?, end_date = ?, notes = ?, updated_at = ?
  WHERE id = 1
`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname.startsWith('/logos-equipos/')) {
      serveLogosFile(req, res, url.pathname);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Metodo no permitido.' });
      return;
    }

    serveStaticFile(req, res, url.pathname);
  } catch (error) {
    console.error(error);
    const statusCode = Number(error.statusCode || 500);
    const message = statusCode >= 500
      ? 'Ocurrio un error inesperado en el servidor.'
      : error.message;
    sendJson(res, statusCode, { error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Tesoreria disponible en http://${HOST}:${PORT}`);
  console.log(`Base SQLite: ${DB_PATH}`);
});

async function handleApi(req, res, url) {
  if (url.pathname.startsWith('/api/fixture')) {
    await handleFixtureApi(req, res, url);
    return;
  }

  if (url.pathname.startsWith('/api/stats')) {
    await handleStatsApi(req, res, url);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const phaseParam = url.searchParams.get('phaseId') || url.searchParams.get('tournamentId');
    sendJson(res, 200, getSummary(phaseParam));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/tournament') {
    const tIdParam = url.searchParams.get('id') || url.searchParams.get('tournamentId') || url.searchParams.get('phaseId');
    const tId = tIdParam === '1' || tIdParam === 'apertura' ? 1 : 2;
    sendJson(res, 200, getTournament(tId));
    return;
  }

  // GET /api/phases → list all phases with their phase_tournaments (for selector)
  if (req.method === 'GET' && url.pathname === '/api/phases') {
    const rows = db.prepare(`
      SELECT pt.id AS phaseTournamentId, pt.type, pt.label AS ptLabel, pt.is_complete AS isComplete,
             p.id AS phaseId, p.label AS phaseLabel, p.name AS phaseName, p.year
      FROM phase_tournaments pt
      JOIN phases p ON p.id = pt.phase_id
      ORDER BY p.year ASC, pt.id ASC
    `).all().map(mapPlainObject);
    sendJson(res, 200, rows);
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/tournament') {
    const body = await readJsonBody(req);
    const name = cleanText(body.name, 80);
    const budgetCents = parseAmountCentsValue(body.budgetCents !== undefined ? body.budgetCents : body.budget_cents);
    const startDate = typeof body.startDate === 'string' ? body.startDate.trim().slice(0, 10) || null : null;
    const endDate = typeof body.endDate === 'string' ? body.endDate.trim().slice(0, 10) || null : null;
    const notes = cleanText(body.notes, 240);

    if (!name) {
      sendJson(res, 422, { error: 'El nombre del torneo es obligatorio.' });
      return;
    }
    if (!Number.isFinite(budgetCents) || budgetCents < 0) {
      sendJson(res, 422, { error: 'El presupuesto debe ser un número mayor o igual a cero.' });
      return;
    }

    updateTournamentStmt.run(name, Math.round(budgetCents), startDate, endDate, notes, nowIso());
    sendJson(res, 200, getTournament());
    return;
  }

  // ── PLAYER ENDPOINTS ──
  // GET /api/teams/:id/players
  const teamPlayersMatch = url.pathname.match(/^\/api\/teams\/(\d+)\/players$/);
  if (req.method === 'GET' && teamPlayersMatch) {
    const teamId = Number(teamPlayersMatch[1]);
    const players = db.prepare(
      'SELECT id, team_id AS teamId, name, number, dni, position, is_active AS isActive FROM players WHERE team_id = ? ORDER BY number IS NULL, number ASC, name ASC'
    ).all(teamId).map(mapPlainObject);
    sendJson(res, 200, players);
    return;
  }

  // POST /api/teams/:id/players
  if (req.method === 'POST' && teamPlayersMatch) {
    const teamId = Number(teamPlayersMatch[1]);
    const body = await readJsonBody(req);
    const name = cleanText(body.name, 80);
    if (!name) { sendJson(res, 422, { error: 'El nombre del jugador es obligatorio.' }); return; }
    const number = Number.isInteger(body.number) && body.number >= 0 ? body.number : null;
    const position = cleanText(body.position, 40);
    const dni = cleanText(body.dni, 20);
    const res2 = db.prepare('INSERT INTO players (team_id, name, number, dni, position, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(teamId, name, number, dni || null, position, nowIso());
    sendJson(res, 201, { id: Number(res2.lastInsertRowid), teamId, name, number, dni: dni || null, position, isActive: 1 });
    return;
  }

  // PUT /api/players/:id
  const playerIdMatch = url.pathname.match(/^\/api\/players\/(\d+)$/);
  if (req.method === 'PUT' && playerIdMatch) {
    const playerId = Number(playerIdMatch[1]);
    const body = await readJsonBody(req);
    const name = cleanText(body.name, 80);
    if (!name) { sendJson(res, 422, { error: 'El nombre del jugador es obligatorio.' }); return; }
    const number = Number.isInteger(body.number) && body.number >= 0 ? body.number : null;
    const position = cleanText(body.position, 40);
    const dni = cleanText(body.dni, 20);
    const isActive = body.isActive === false || body.isActive === 0 ? 0 : 1;
    const teamId = body.teamId !== undefined && body.teamId !== null ? Number(body.teamId) : null;
    if (teamId !== null) {
      if (isNaN(teamId)) {
        sendJson(res, 422, { error: 'El equipo es obligatorio y debe ser válido.' });
        return;
      }
      db.prepare('UPDATE players SET team_id = ?, name = ?, number = ?, dni = ?, position = ?, is_active = ? WHERE id = ?').run(teamId, name, number, dni || null, position, isActive, playerId);
      sendJson(res, 200, { id: playerId, teamId, name, number, dni: dni || null, position, isActive });
    } else {
      db.prepare('UPDATE players SET name = ?, number = ?, dni = ?, position = ?, is_active = ? WHERE id = ?').run(name, number, dni || null, position, isActive, playerId);
      sendJson(res, 200, { id: playerId, name, number, dni: dni || null, position, isActive });
    }
    return;
  }

  // DELETE /api/players/:id
  if (req.method === 'DELETE' && playerIdMatch) {
    const playerId = Number(playerIdMatch[1]);
    db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    sendJson(res, 200, { deleted: playerId });
    return;
  }

  // GET /api/players (all)
  if (req.method === 'GET' && url.pathname === '/api/players') {
    const players = db.prepare('SELECT id, team_id AS teamId, name, number, position FROM players').all().map(mapPlainObject);
    sendJson(res, 200, players);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/teams') {
    sendJson(res, 200, listTeams());
    return;
  }

  if (req.method === 'PUT' && /^\/api\/teams\/\d+$/.test(url.pathname)) {
    const teamId = Number(url.pathname.split('/').pop());
    const body = await readJsonBody(req);
    const name = cleanText(body.name, 80);
    const notes = cleanText(body.notes, 240);
    const pointsDeduction = body.pointsDeduction ? 1 : 0;

    const existingTeam = getTeamById(teamId);
    if (!existingTeam) {
      sendJson(res, 404, { error: 'Equipo no encontrado.' });
      return;
    }

    const shieldUrl = body.shieldUrl !== undefined ? cleanText(body.shieldUrl, 255) : existingTeam.shieldUrl;

    if (!name) {
      sendJson(res, 422, { error: 'El nombre del equipo es obligatorio.' });
      return;
    }

    const updatedAt = nowIso();
    const result = updateTeamStmt.run(name, notes, shieldUrl || null, pointsDeduction, updatedAt, teamId);

    if (!result.changes) {
      sendJson(res, 404, { error: 'Equipo no encontrado.' });
      return;
    }

    sendJson(res, 200, getTeamById(teamId));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/summary') {
    const phaseParam = url.searchParams.get('phaseId') || url.searchParams.get('tournamentId');
    sendJson(res, 200, getSummary(phaseParam));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/movements') {
    const phaseParam = url.searchParams.get('phaseId') || url.searchParams.get('phase') || url.searchParams.get('tournamentId');
    sendJson(res, 200, listMovements(phaseParam));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/movements') {
    const body = await readJsonBody(req);
    const movement = normalizeMovement(body);
    const createdAt = nowIso();
    const result = insertMovementStmt.run(
      movement.type,
      movement.amountCents,
      movement.category,
      movement.paymentMethod,
      movement.description,
      movement.occurredOn,
      movement.teamId,
      createdAt
    );

    sendJson(res, 201, getMovementById(Number(result.lastInsertRowid)));
    return;
  }
  if (req.method === 'PUT' && /^\/api\/movements\/\d+$/.test(url.pathname)) {
    const movementId = Number(url.pathname.split('/').pop());
    const body = await readJsonBody(req);
    const movement = normalizeMovement(body);
    
    const result = updateMovementStmt.run(
      movement.type,
      movement.amountCents,
      movement.category,
      movement.paymentMethod,
      movement.description,
      movement.occurredOn,
      movement.teamId,
      movementId
    );

    if (!result.changes) {
      sendJson(res, 404, { error: 'Movimiento no encontrado.' });
      return;
    }

    sendJson(res, 200, { id: movementId, ...movement });
    return;
  }

  if (req.method === 'DELETE' && /^\/api\/movements\/\d+$/.test(url.pathname)) {
    const movementId = Number(url.pathname.split('/').pop());
    const result = deleteMovementStmt.run(movementId);

    if (!result.changes) {
      sendJson(res, 404, { error: 'Movimiento no encontrado.' });
      return;
    }

    res.writeHead(204);
    res.end();
    return;
  }

  sendJson(res, 404, { error: 'Ruta no encontrada.' });
}

function getSummary(phaseParam = null) {
  // 1. Real Continuous Cash Balance (All time)
  const globalRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS globalIncome,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS globalExpense
    FROM movements
  `).get();
  const balanceCents = Number(globalRow.globalIncome || 0) - Number(globalRow.globalExpense || 0);

  // 2. Determine phase filter & tournament ID
  let tournamentId = 2; // Default to Clausura
  if (phaseParam === '1' || phaseParam === 'apertura') {
    tournamentId = 1;
  } else if (phaseParam === '3' || phaseParam === 'clausura' || phaseParam === '2') {
    tournamentId = 2;
  } else if (phaseParam === 'all') {
    tournamentId = 'all';
  }

  // 3. Filtered Cobrado (Income), Pagado (Expense), and Movimientos (Count) by Phase Date Range
  let dateFilterWhere = '';
  if (tournamentId === 1) {
    dateFilterWhere = ` WHERE occurred_on <= '2026-07-31'`;
  } else if (tournamentId === 2) {
    dateFilterWhere = ` WHERE occurred_on >= '2026-08-01'`;
  }

  const phaseStatsRow = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents,
      COALESCE(SUM(CASE WHEN type = 'income' AND category = 'Inscripción' THEN amount_cents ELSE 0 END), 0) AS inscriptionIncomeCents,
      COUNT(*) AS movementCount
    FROM movements
    ${dateFilterWhere}
  `).get();

  const incomeCents = Number(phaseStatsRow.incomeCents || 0);
  const expenseCents = Number(phaseStatsRow.expenseCents || 0);
  const phaseInscriptionIncomeCents = Number(phaseStatsRow.inscriptionIncomeCents || 0);
  const movementCount = Number(phaseStatsRow.movementCount || 0);

  let tournament;
  if (tournamentId === 1) {
    tournament = getTournament(1);
  } else if (tournamentId === 2) {
    tournament = getTournament(2);
  } else {
    const t1 = getTournament(1);
    const t2 = getTournament(2);
    tournament = {
      id: 'all',
      name: 'Anual 2026',
      budgetCents: (t1.budgetCents || 0) + (t2.budgetCents || 0),
      startDate: t1.startDate,
      endDate: t2.endDate,
      notes: 'Presupuesto total anual sumando Apertura y Clausura.'
    };
  }

  const budgetCents = Number(tournament.budgetCents || 0);
  const pendingCollectionCents = Math.max(0, budgetCents - phaseInscriptionIncomeCents);
  const collectionProgressPct = budgetCents > 0 ? Math.min(100, Math.round((phaseInscriptionIncomeCents / budgetCents) * 100)) : null;
  const budgetBalanceCents = phaseInscriptionIncomeCents - expenseCents - budgetCents;

  return {
    balanceCents, // Real cumulative cash balance (constant)
    incomeCents,  // Filtered income for selected phase
    expenseCents, // Filtered expense for selected phase
    movementCount,// Filtered movement count for selected phase
    tournament: {
      id: tournament.id,
      name: tournament.name,
      budgetCents,
      phaseIncomeCents: phaseInscriptionIncomeCents,
      pendingCollectionCents,
      collectionProgressPct,
      budgetBalanceCents,
    },
  };
}

function getTournament(id = 2) {
  const row = db.prepare(`
    SELECT
      id,
      name,
      budget_cents AS budgetCents,
      start_date AS startDate,
      end_date AS endDate,
      notes
    FROM tournaments
    WHERE id = ?
  `).get(id);
  return row ? mapPlainObject(row) : { id: id, name: 'Torneo', budgetCents: 0, startDate: null, endDate: null, notes: '' };
}

function listTeams() {
  return db.prepare(`
    SELECT
      id,
      slot_number AS slotNumber,
      name,
      notes,
      shield_url AS shieldUrl,
      points_deduction AS pointsDeduction
    FROM teams
    ORDER BY slot_number ASC
  `).all().map(mapPlainObject);
}

function listMovements(phaseParam = null) {
  let query = `
    SELECT
      movements.id,
      movements.type,
      movements.amount_cents AS amountCents,
      movements.amount_cents AS amount,
      movements.category,
      movements.payment_method AS method,
      movements.payment_method AS paymentMethod,
      movements.description,
      movements.occurred_on AS date,
      movements.occurred_on AS occurredOn,
      movements.team_id AS teamId,
      teams.name AS teamName,
      movements.created_at AS createdAt
    FROM movements
    LEFT JOIN teams ON teams.id = movements.team_id
  `;
  const params = [];
  if (phaseParam === '1' || phaseParam === 'apertura') {
    query += ` WHERE movements.occurred_on <= '2026-07-31'`;
  } else if (phaseParam === '3' || phaseParam === 'clausura' || phaseParam === '2') {
    query += ` WHERE movements.occurred_on >= '2026-08-01'`;
  }
  query += ` ORDER BY movements.occurred_on DESC, movements.id DESC`;
  return db.prepare(query).all(...params).map(mapPlainObject);
}

function getTeamById(teamId) {
  const row = db.prepare(`
    SELECT
      id,
      slot_number AS slotNumber,
      name,
      notes,
      shield_url AS shieldUrl,
      points_deduction AS pointsDeduction
    FROM teams
    WHERE id = ?
  `).get(teamId);

  return row ? mapPlainObject(row) : null;
}

function getMovementById(movementId) {
  const row = db.prepare(`
    SELECT
      movements.id,
      movements.type,
      movements.amount_cents AS amountCents,
      movements.amount_cents AS amount,
      movements.category,
      movements.payment_method AS method,
      movements.payment_method AS paymentMethod,
      movements.description,
      movements.occurred_on AS date,
      movements.occurred_on AS occurredOn,
      movements.team_id AS teamId,
      teams.name AS teamName,
      movements.created_at AS createdAt
    FROM movements
    LEFT JOIN teams ON teams.id = movements.team_id
    WHERE movements.id = ?
  `).get(movementId);

  return row ? mapPlainObject(row) : null;
}

function normalizeMovement(body) {
  const type = body.type === 'expense' ? 'expense' : body.type === 'income' ? 'income' : null;
  const category = cleanText(body.category, 60);
  const paymentMethod = cleanText(body.method ?? body.paymentMethod, 40);
  const description = cleanText(body.description, 240);
  const occurredOn = normalizeDate(body.date ?? body.occurredOn);
  const amountCents = body.amountCents !== undefined
    ? parseAmountCentsValue(body.amountCents)
    : parseAmountCents(body.amount);
  const teamId = body.teamId === null || body.teamId === undefined || body.teamId === ''
    ? null
    : Number(body.teamId);

  if (!type) {
    throw validationError('El tipo de movimiento debe ser ingreso o egreso.');
  }

  if (!category) {
    throw validationError('La categoria es obligatoria.');
  }

  if (!paymentMethod) {
    throw validationError('El metodo de pago es obligatorio.');
  }

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw validationError('El monto debe ser mayor a cero.');
  }

  if (teamId !== null) {
    if (!Number.isInteger(teamId) || !getTeamById(teamId)) {
      throw validationError('El equipo seleccionado no existe.');
    }
  }

  return {
    type,
    amountCents,
    category,
    paymentMethod,
    description,
    occurredOn,
    teamId
  };
}

function parseAmountCents(rawValue) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.round(rawValue * 100);
  }

  if (typeof rawValue !== 'string') {
    return NaN;
  }

  const cleaned = rawValue.trim().replace(/\s+/g, '').replace(/\$/g, '');

  if (!cleaned) {
    return NaN;
  }

  let normalized = cleaned;

  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }

  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function parseAmountCentsValue(rawValue) {
  if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
    return Math.round(rawValue);
  }

  if (typeof rawValue !== 'string') {
    return NaN;
  }

  const normalized = rawValue.trim();
  if (!normalized) {
    return NaN;
  }

  const amountCents = Number(normalized);
  return Number.isFinite(amountCents) ? Math.round(amountCents) : NaN;
}

function normalizeDate(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    throw validationError('La fecha debe tener formato YYYY-MM-DD.');
  }

  const parsed = new Date(`${candidate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError('La fecha del movimiento no es valida.');
  }

  return candidate;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function seedTeamsIfNeeded() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM teams').get();
  const currentCount = Number(row.count || 0);

  if (currentCount > 0) {
    return;
  }

  const insertTeamStmt = db.prepare(`
    INSERT INTO teams (slot_number, name, notes, created_at, updated_at)
    VALUES (?, ?, '', ?, ?)
  `);
  const now = nowIso();

  for (let slot = 1; slot <= 10; slot += 1) {
    insertTeamStmt.run(slot, `Equipo ${slot}`, now, now);
  }
}

function seedTournamentIfNeeded() {
  const row = db.prepare('SELECT COUNT(*) AS count FROM tournaments').get();
  if (Number(row.count || 0) > 0) return;

  const now = nowIso();
  db.prepare(`
    INSERT INTO tournaments (name, budget_cents, start_date, end_date, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', ?, ?)
  `).run('Apertura 2026', 1235600000, '2026-01-01', null, now, now);
}

function seedFixtureIfNeeded() {
  const phaseCount = Number(db.prepare('SELECT COUNT(*) AS c FROM phases').get().c || 0);
  if (phaseCount > 0) return;

  const teams = db.prepare('SELECT id, slot_number FROM teams ORDER BY slot_number ASC').all().map(mapPlainObject);
  if (teams.length < 10) return; // teams not seeded yet

  const now = nowIso();

  // Create Apertura 2026 phase
  const phaseRes = db.prepare(
    'INSERT INTO phases (year, name, label, created_at) VALUES (?, ?, ?, ?)'
  ).run(2026, 'apertura', 'Apertura 2026', now);
  const phaseId = Number(phaseRes.lastInsertRowid);

  // Torneo 1 — Todos contra todos
  const t1Res = db.prepare(
    'INSERT INTO phase_tournaments (phase_id, type, label, created_at) VALUES (?, ?, ?, ?)'
  ).run(phaseId, 'todos_contra_todos', 'Torneo 1 — Todos vs Todos', now);
  const t1Id = Number(t1Res.lastInsertRowid);

  // Torneo 2 — Zonas (empty until T1 standings assigned)
  db.prepare(
    'INSERT INTO phase_tournaments (phase_id, type, label, created_at) VALUES (?, ?, ?, ?)'
  ).run(phaseId, 'zonas', 'Torneo 2 — Zonas', now);

  // Generate and insert round-robin matches for T1
  const insertMatch = db.prepare(`
    INSERT INTO matches (phase_tournament_id, round_number, home_team_id, away_team_id, status, created_at)
    VALUES (?, ?, ?, ?, 'scheduled', ?)
  `);
  for (const m of generateRoundRobin(teams, t1Id, now)) {
    insertMatch.run(m.phaseTournamentId, m.roundNumber, m.homeTeamId, m.awayTeamId, now);
  }
}

function generateRoundRobin(teams, phaseTournamentId, now) {
  // Standard circle method for n=10 (even): 9 rounds × 5 matches
  const n = teams.length;
  const fixed = teams[0];
  const rotating = teams.slice(1); // n-1 = 9 teams
  const allMatches = [];

  for (let r = 0; r < n - 1; r++) {
    // Rotate left by r
    const rot = [...rotating.slice(r), ...rotating.slice(0, r)];
    const round = r + 1;

    // fixed vs last in rotated
    const lastTeam = rot[rot.length - 1];
    allMatches.push({
      phaseTournamentId, roundNumber: round,
      homeTeamId: r % 2 === 0 ? fixed.id : lastTeam.id,
      awayTeamId: r % 2 === 0 ? lastTeam.id : fixed.id,
    });

    // Pair remaining (n-2)/2 = 4 pairs from outside in
    const pairCount = (n - 2) / 2;
    for (let i = 0; i < pairCount; i++) {
      const a = rot[i];
      const b = rot[rot.length - 2 - i]; // avoid last (already paired)
      allMatches.push({
        phaseTournamentId, roundNumber: round,
        homeTeamId: (r + i) % 2 === 0 ? a.id : b.id,
        awayTeamId: (r + i) % 2 === 0 ? b.id : a.id,
      });
    }
  }
  return allMatches;
}

function generateT2Matches(groupTeams, phaseTournamentId, now) {
  // Odd round-robin (n=5): 5 rounds × 2 matches per round = 10 total
  // rotLeft[n-1] is the "bye" each round
  const n = groupTeams.length;
  const allMatches = [];
  for (let r = 0; r < n; r++) {
    const rot = [...groupTeams.slice(r), ...groupTeams.slice(0, r)];
    const round = r + 1;
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const a = rot[i];
      const b = rot[n - 2 - i]; // avoids rot[n-1] (bye)
      allMatches.push({
        phaseTournamentId, roundNumber: round,
        homeTeamId: (r + i) % 2 === 0 ? a.id : b.id,
        awayTeamId: (r + i) % 2 === 0 ? b.id : a.id,
      });
    }
  }
  return allMatches;
}

function computeStandings(phaseTournamentId, groupName = null, simulateDeduction = false) {
  const ptRow = db.prepare('SELECT phase_id FROM phase_tournaments WHERE id = ?').get(phaseTournamentId);
  const isApertura = ptRow ? ptRow.phase_id === 1 : false;

  let teams;
  if (groupName) {
    const rows = db.prepare(`
      SELECT t.id, t.slot_number AS slotNumber, t.name, t.shield_url AS shieldUrl, t.points_deduction AS pointsDeduction
      FROM t2_groups g JOIN teams t ON t.id = g.team_id
      WHERE g.phase_tournament_id = ? AND g.group_name = ?
    `).all(phaseTournamentId, groupName.toUpperCase()).map(mapPlainObject);
    teams = rows;
  } else {
    teams = db.prepare('SELECT id, slot_number AS slotNumber, name, shield_url AS shieldUrl, points_deduction AS pointsDeduction FROM teams ORDER BY slot_number ASC').all().map(mapPlainObject);
  }

  if (!teams.length) return [];

  // Sanctions (pointsDeduction) only apply to Apertura (phase_id = 1)
  for (const t of teams) {
    if (!isApertura) {
      t.pointsDeduction = 0;
    }
  }

  const teamIdSet = new Set(teams.map(t => t.id));
  const playedMatches = db.prepare(`
    SELECT home_team_id AS homeTeamId, away_team_id AS awayTeamId,
           home_goals AS homeGoals, away_goals AS awayGoals,
           round_number AS roundNumber
    FROM matches WHERE phase_tournament_id = ? AND status = 'played'
  `).all(phaseTournamentId).map(mapPlainObject);

  const stats = {};
  for (const t of teams) {
    stats[t.id] = { 
      id: t.id, 
      slotNumber: t.slotNumber, 
      name: t.name, 
      shieldUrl: t.shieldUrl, 
      pointsDeduction: isApertura ? (t.pointsDeduction || 0) : 0,
      played: 0, 
      won: 0, 
      draw: 0, 
      lost: 0, 
      goalsFor: 0, 
      goalsAgainst: 0,
      points: 0
    };
  }

  for (const m of playedMatches) {
    const home = stats[m.homeTeamId];
    const away = stats[m.awayTeamId];
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goalsFor += m.homeGoals; home.goalsAgainst += m.awayGoals;
    away.goalsFor += m.awayGoals; away.goalsAgainst += m.homeGoals;
    
    if (m.homeGoals > m.awayGoals) {
      home.won++;
      away.lost++;
      if (!simulateDeduction || home.pointsDeduction === 0 || m.roundNumber >= 10) {
        home.points += 3;
      }
    } else if (m.homeGoals < m.awayGoals) {
      away.won++;
      home.lost++;
      if (!simulateDeduction || away.pointsDeduction === 0 || m.roundNumber >= 10) {
        away.points += 3;
      }
    } else {
      home.draw++;
      away.draw++;
      if (!simulateDeduction || home.pointsDeduction === 0 || m.roundNumber >= 10) {
        home.points += 1;
      }
      if (!simulateDeduction || away.pointsDeduction === 0 || m.roundNumber >= 10) {
        away.points += 1;
      }
    }
  }

  return Object.values(stats)
    .map(s => {
      const gd = s.goalsFor - s.goalsAgainst;
      return { 
        ...s, 
        goalDiff: gd,
        pj: s.played,
        pg: s.won,
        pe: s.draw,
        pp: s.lost,
        gf: s.goalsFor,
        gc: s.goalsAgainst,
        dif: gd,
        pts: s.points
      };
    })
    .sort((a, b) => b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor)
    .map((s, i) => ({ ...s, position: i + 1 }));
}

async function handleFixtureApi(req, res, url) {
  console.log(`[API FIXTURE] ${req.method} ${url.pathname}`);

  const standingsMatch = url.pathname.match(/^\/api\/fixture\/tournaments\/(\d+)\/standings$/);
  const matchesListMatch = url.pathname.match(/^\/api\/fixture\/tournaments\/(\d+)\/matches$/);
  const resultMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)\/result$/);
  const updateMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)$/);
  const createMatch = url.pathname.match(/^\/api\/fixture\/tournaments\/(\d+)\/matches$/);
  const delMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)$/);
  const resetMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)\/result$/);
  const goalsReportMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)\/goals$/);
  const cardsReportMatch = url.pathname.match(/^\/api\/fixture\/matches\/(\d+)\/cards$/);
  const goalDeleteMatch = url.pathname.match(/^\/api\/fixture\/goals\/(\d+)$/);
  const cardDeleteMatch = url.pathname.match(/^\/api\/fixture\/cards\/(\d+)$/);
  const genT2Match = url.pathname.match(/^\/api\/fixture\/tournaments\/(\d+)\/generate-t2$/);

  // GET /api/fixture  → all phases + tournaments
  if (req.method === 'GET' && url.pathname === '/api/fixture') {
    const phases = db.prepare('SELECT id, year, name, label FROM phases ORDER BY year ASC, id ASC').all().map(mapPlainObject);
    for (const phase of phases) {
      phase.tournaments = db.prepare(
        'SELECT id, type, label, is_complete AS isComplete FROM phase_tournaments WHERE phase_id = ? ORDER BY id ASC'
      ).all(phase.id).map(mapPlainObject);
    }
    sendJson(res, 200, phases);
    return;
  }

  // GET /api/fixture/tournaments/:id/standings?group=A|B
  if (req.method === 'GET' && standingsMatch) {
    const tournamentId = Number(standingsMatch[1]);
    const group = url.searchParams.get('group') || null;
    const simulateDeduction = url.searchParams.get('simulateDeduction') === 'true';
    sendJson(res, 200, computeStandings(tournamentId, group, simulateDeduction));
    return;
  }

  // GET /api/fixture/tournaments/:id/matches?group=A|B
  if (req.method === 'GET' && matchesListMatch) {
    const tournamentId = Number(matchesListMatch[1]);
    const group = url.searchParams.get('group') || null;

    let groupTeamIds = null;
    if (group) {
      const rows = db.prepare(
        'SELECT team_id FROM t2_groups WHERE phase_tournament_id = ? AND group_name = ?'
      ).all(tournamentId, group.toUpperCase());
      groupTeamIds = rows.map(r => Number(r.team_id));
    }

    const allMatches = db.prepare(`
      SELECT m.id, m.round_number AS roundNumber, m.match_date AS matchDate, m.match_time AS matchTime,
             m.home_goals AS homeGoals, m.away_goals AS awayGoals, m.status,
             m.home_team_id AS homeTeamId, m.away_team_id AS awayTeamId,
             ht.name AS homeTeamName, ht.slot_number AS homeSlot, ht.shield_url AS homeShield,
             at.name AS awayTeamName, at.slot_number AS awaySlot, at.shield_url AS awayShield,
             (SELECT group_name FROM t2_groups WHERE phase_tournament_id = m.phase_tournament_id AND team_id = m.home_team_id) AS groupName
      FROM matches m
      JOIN teams ht ON ht.id = m.home_team_id
      LEFT JOIN teams at ON at.id = m.away_team_id
      WHERE m.phase_tournament_id = ?
      ORDER BY m.round_number ASC, COALESCE(m.match_time, '99:99') ASC, m.id ASC
    `).all(tournamentId).map(mapPlainObject);

    const filtered = groupTeamIds
      ? allMatches.filter(m => groupTeamIds.includes(m.homeTeamId) && groupTeamIds.includes(m.awayTeamId))
      : allMatches;

    // Group by round
    const byRound = {};
    for (const m of filtered) {
      if (!byRound[m.roundNumber]) byRound[m.roundNumber] = [];
      byRound[m.roundNumber].push(m);
    }
    const rounds = Object.entries(byRound).map(([r, ms]) => ({ round: Number(r), matches: ms }));
    sendJson(res, 200, rounds);
    return;
  }

  // PUT /api/fixture/matches/:id/result  → {homeGoals, awayGoals}
  if (req.method === 'PUT' && resultMatch) {
    const matchId = Number(resultMatch[1]);
    const body = await readJsonBody(req);
    const homeGoals = parseInt(body.homeGoals, 10);
    const awayGoals = parseInt(body.awayGoals, 10);
    if (!Number.isInteger(homeGoals) || homeGoals < 0 || !Number.isInteger(awayGoals) || awayGoals < 0) {
      sendJson(res, 422, { error: 'Los goles deben ser números enteros mayores o iguales a cero.' });
      return;
    }
    const result = db.prepare(`
      UPDATE matches SET home_goals = ?, away_goals = ?, status = 'played' WHERE id = ?
    `).run(homeGoals, awayGoals, matchId);
    if (!result.changes) {
      sendJson(res, 404, { error: 'Partido no encontrado.' });
      return;
    }
    sendJson(res, 200, { id: matchId, homeGoals, awayGoals, status: 'played' });
    return;
  }

  // PUT /api/fixture/matches/:id  → Update match details
  if (req.method === 'PUT' && updateMatch) {
    const matchId = Number(updateMatch[1]);
    const body = await readJsonBody(req);
    const { homeTeamId, awayTeamId, matchDate, matchTime, status, homeGoals, awayGoals } = body;
    
    const result = db.prepare(`
      UPDATE matches 
      SET home_team_id = ?, away_team_id = ?, match_date = ?, match_time = ?, 
          status = ?, home_goals = ?, away_goals = ?
      WHERE id = ?
    `).run(
      homeTeamId, awayTeamId || null, matchDate || null, matchTime || null,
      status || 'scheduled', homeGoals ?? null, awayGoals ?? null, matchId
    );
    
    if (!result.changes) return sendJson(res, 404, { error: 'Partido no encontrado.' });
    sendJson(res, 200, { id: matchId, ...body });
    return;
  }

  // POST /api/fixture/tournaments/:id/matches  → Create match
  if (req.method === 'POST' && createMatch) {
    const tournamentId = Number(createMatch[1]);
    const body = await readJsonBody(req);
    const { roundNumber, homeTeamId, awayTeamId, matchDate, matchTime } = body;
    
    const result = db.prepare(`
      INSERT INTO matches (phase_tournament_id, round_number, home_team_id, away_team_id, match_date, match_time, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?)
    `).run(tournamentId, roundNumber, homeTeamId, awayTeamId || null, matchDate || null, matchTime || null, new Date().toISOString());
    
    sendJson(res, 201, { id: Number(result.lastInsertRowid), ...body });
    return;
  }

  // DELETE /api/fixture/matches/:id
  if (req.method === 'DELETE' && delMatch) {
    const matchId = Number(delMatch[1]);
    db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);
    sendJson(res, 200, { success: true, deleted: matchId });
    return;
  }

  // DELETE /api/fixture/matches/:id/result  → reset to scheduled
  if (req.method === 'DELETE' && resetMatch) {
    const matchId = Number(resetMatch[1]);
    db.prepare("UPDATE matches SET home_goals = NULL, away_goals = NULL, status = 'scheduled' WHERE id = ?").run(matchId);
    sendJson(res, 200, { id: matchId, status: 'scheduled' });
    return;
  }

  // POST /api/fixture/tournaments/:id/generate-t2  → assign T2 groups from T1 standings
  if (req.method === 'POST' && genT2Match) {
    const t1Id = Number(genT2Match[1]);
    const t1 = db.prepare('SELECT id, phase_id, type FROM phase_tournaments WHERE id = ?').get(t1Id);
    if (!t1 || t1.type !== 'todos_contra_todos') {
      sendJson(res, 422, { error: 'El torneo indicado no es de tipo todos contra todos.' });
      return;
    }

    // Get T2 tournament for same phase
    const t2 = db.prepare(
      "SELECT id FROM phase_tournaments WHERE phase_id = ? AND type = 'zonas' ORDER BY id ASC LIMIT 1"
    ).get(t1.phase_id);
    if (!t2) {
      sendJson(res, 404, { error: 'No existe Torneo 2 en esta fase.' });
      return;
    }
    const t2Id = Number(t2.id);

    // Get T1 standings (position-ordered)
    const standings = computeStandings(t1Id);

    // Assign groups: even position → A, odd position → B
    db.prepare('DELETE FROM t2_groups WHERE phase_tournament_id = ?').run(t2Id);
    db.prepare('DELETE FROM matches WHERE phase_tournament_id = ?').run(t2Id);

    const insertGroup = db.prepare('INSERT OR REPLACE INTO t2_groups (phase_tournament_id, team_id, group_name) VALUES (?, ?, ?)');
    const groupA = [];
    const groupB = [];
    for (const s of standings) {
      const group = s.position % 2 === 0 ? 'A' : 'B';
      insertGroup.run(t2Id, s.id, group);
      if (group === 'A') groupA.push(s); else groupB.push(s);
    }

    // Generate T2 matches for each group
    const now = nowIso();
    const insertMatch = db.prepare(`
      INSERT INTO matches (phase_tournament_id, round_number, home_team_id, away_team_id, status, created_at)
      VALUES (?, ?, ?, ?, 'scheduled', ?)
    `);
    for (const m of generateT2Matches(groupA, t2Id, now)) {
      insertMatch.run(m.phaseTournamentId, m.roundNumber, m.homeTeamId, m.awayTeamId, now);
    }
    for (const m of generateT2Matches(groupB, t2Id, now)) {
      insertMatch.run(m.phaseTournamentId, m.roundNumber, m.homeTeamId, m.awayTeamId, now);
    }

    sendJson(res, 200, { t2Id, groupA: groupA.map(s => s.name), groupB: groupB.map(s => s.name) });
    return;
  }

  if (req.method === 'GET' && cardsReportMatch) {
    const matchId = Number(cardsReportMatch[1]);
    sendJson(res, 200, getMatchCardsReport(matchId));
    return;
  }

  // POST /api/fixture/matches/:id/cards  → {playerId, teamId, cardType, minute?, suspensionMatches?, isPending?}
  if (req.method === 'POST' && cardsReportMatch) {
    const matchId = Number(cardsReportMatch[1]);
    const body = await readJsonBody(req);
    const playerId = Number(body.playerId);
    const teamId   = Number(body.teamId);
    const cardType = body.cardType === 'red' ? 'red' : 'yellow';
    const minute   = Number.isInteger(body.minute) && body.minute > 0 ? body.minute : null;
    const isPending = body.isPending === true || body.isPending === 1;
    const suspensionMatches = cardType === 'red' && !isPending && Number.isInteger(body.suspensionMatches) ? body.suspensionMatches : 0;
    const details = (cardType === 'red' && body.details && typeof body.details === 'string') ? body.details.trim() : null;

    if (!playerId || !teamId) { sendJson(res, 422, { error: 'playerId y teamId son requeridos.' }); return; }

    const ins = db.prepare('INSERT INTO match_cards (match_id, player_id, team_id, card_type, minute, suspension_matches, is_pending_suspension, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      matchId, playerId, teamId, cardType, minute, suspensionMatches, isPending ? 1 : 0, details, nowIso()
    );

    sendJson(res, 201, { id: Number(ins.lastInsertRowid), matchId, playerId, teamId, cardType, minute, suspensionMatches, isPending });
    return;
  }

  // DELETE /api/fixture/cards/:id  → remove a card
  if (req.method === 'DELETE' && cardDeleteMatch) {
    db.prepare('DELETE FROM match_cards WHERE id = ?').run(Number(cardDeleteMatch[1]));
    sendJson(res, 200, { deleted: Number(cardDeleteMatch[1]) });
    return;
  }

  // PUT /api/fixture/cards/:id → {suspensionMatches, isPending}
  if (req.method === 'PUT' && cardDeleteMatch) {
    const cardId = Number(cardDeleteMatch[1]);
    const body = await readJsonBody(req);
    const suspensionMatches = Number.isInteger(body.suspensionMatches) ? body.suspensionMatches : 0;
    const isPending = body.isPending ? 1 : 0;

    db.prepare('UPDATE match_cards SET suspension_matches = ?, is_pending_suspension = ? WHERE id = ?').run(
      suspensionMatches, isPending, cardId
    );

    sendJson(res, 200, { id: cardId, suspensionMatches, isPending });
    return;
  }

  // GET /api/fixture/matches/:id/goals
  if (req.method === 'GET' && goalsReportMatch) {
    const matchId = Number(goalsReportMatch[1]);
    sendJson(res, 200, getMatchGoalsReport(matchId));
    return;
  }

  // POST /api/fixture/matches/:id/goals → {playerId, teamId, minute?, isOwnGoal?}
  if (req.method === 'POST' && goalsReportMatch) {
    const matchId = Number(goalsReportMatch[1]);
    const body = await readJsonBody(req);
    const playerId = Number(body.playerId);
    const teamId   = Number(body.teamId);
    const minute   = Number.isInteger(body.minute) && body.minute > 0 ? body.minute : null;
    const isOwnGoal = body.isOwnGoal ? 1 : 0;
    if (!playerId || !teamId) { sendJson(res, 422, { error: 'playerId y teamId son requeridos.' }); return; }
    const ins = db.prepare('INSERT INTO match_goals (match_id, player_id, team_id, minute, is_own_goal, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(matchId, playerId, teamId, minute, isOwnGoal, nowIso());
    sendJson(res, 201, { id: Number(ins.lastInsertRowid), matchId, playerId, teamId, minute, isOwnGoal });
    return;
  }

  // DELETE /api/fixture/goals/:id → remove a goal
  if (req.method === 'DELETE' && goalDeleteMatch) {
    db.prepare('DELETE FROM match_goals WHERE id = ?').run(Number(goalDeleteMatch[1]));
    sendJson(res, 200, { deleted: Number(goalDeleteMatch[1]) });
    return;
  }

  sendJson(res, 404, { error: 'Ruta de fixture no encontrada.' });
}

async function handleStatsApi(req, res, url) {
  const tIdParam = url.searchParams.get('tournamentId');
  const pIdParam = url.searchParams.get('phaseId');
  const isGlobal = tIdParam === 'all' || pIdParam === 'all';
  const tournamentId = Number(tIdParam || 1);
  const group = url.searchParams.get('group') || null;

  // Resolve phase_id if not global
  let phaseId = null;
  if (!isGlobal) {
    if (pIdParam && !isNaN(Number(pIdParam))) {
      phaseId = Number(pIdParam);
    } else if (!isNaN(tournamentId)) {
      const ptRow = db.prepare(`SELECT phase_id FROM phase_tournaments WHERE id = ?`).get(tournamentId);
      if (ptRow) {
        phaseId = ptRow.phase_id;
      }
    }
  }

  // GET /api/stats/standings
  if (req.method === 'GET' && url.pathname === '/api/stats/standings') {
    const simulateDeduction = url.searchParams.get('simulateDeduction') === 'true';
    sendJson(res, 200, computeStandings(tournamentId, group, simulateDeduction));
    return;
  }

  // GET /api/stats/scorers
  if (req.method === 'GET' && url.pathname === '/api/stats/scorers') {
    let query = `
      SELECT p.id, p.name AS playerName, t.name AS teamName, t.shield_url AS shieldUrl, COUNT(g.id) AS goals
      FROM match_goals g
      JOIN players p ON p.id = g.player_id
      JOIN teams t ON t.id = p.team_id
      JOIN matches m ON m.id = g.match_id
      WHERE g.is_own_goal = 0
    `;
    const params = [];
    if (phaseId !== null) {
      query += ` AND m.phase_tournament_id IN (SELECT id FROM phase_tournaments WHERE phase_id = ?)`;
      params.push(phaseId);
    }
    query += `
      GROUP BY p.id
      ORDER BY goals DESC, p.name ASC
    `;
    const scorers = db.prepare(query).all(...params).map(mapPlainObject);
    sendJson(res, 200, scorers);
    return;
  }

  // GET /api/stats/results?tournamentId=1&round=1
  if (req.method === 'GET' && url.pathname === '/api/stats/results') {
    const round = Number(url.searchParams.get('round') || 1);
    sendJson(res, 200, getRoundResults(tournamentId, round));
    return;
  }

  // GET /api/stats/current-round
  if (req.method === 'GET' && url.pathname === '/api/stats/current-round') {
    try {
      const row = db.prepare(`SELECT MAX(round_number) as maxRound FROM matches WHERE status='played' AND phase_tournament_id = ?`).get(tournamentId);
      sendJson(res, 200, { currentRound: row.maxRound || 1 });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/stats/cards
  if (req.method === 'GET' && url.pathname === '/api/stats/cards') {
    let query = `
      SELECT p.id, p.name AS playerName, t.name AS teamName, t.shield_url AS shieldUrl,
             SUM(CASE WHEN mc.card_type = 'yellow' THEN 1 ELSE 0 END) AS yellowCards,
             SUM(CASE WHEN mc.card_type = 'red' THEN 1 ELSE 0 END) AS redCards,
             SUM(mc.suspension_matches) AS suspensionMatches
      FROM match_cards mc
      JOIN players p ON p.id = mc.player_id
      JOIN teams t ON t.id = p.team_id
      JOIN matches m ON m.id = mc.match_id
    `;
    const params = [];
    if (phaseId !== null) {
      query += ` WHERE m.phase_tournament_id IN (SELECT id FROM phase_tournaments WHERE phase_id = ?)`;
      params.push(phaseId);
    }
    query += `
      GROUP BY p.id
      ORDER BY yellowCards DESC, redCards DESC, p.name ASC
    `;
    const cards = db.prepare(query).all(...params).map(mapPlainObject);
    sendJson(res, 200, cards);
    return;
  }

  // GET /api/stats/suspended
  if (req.method === 'GET' && url.pathname === '/api/stats/suspended') {
    try {
      // 1. Get red card suspensions globally but filtered by phase order if specified
      let redQuery = `
        SELECT mc.id AS cardId, p.id, p.name AS playerName, t.name AS teamName, t.shield_url AS shieldUrl,
               mc.suspension_matches AS originalSuspension,
               mc.is_pending_suspension AS isPending,
               m.round_number AS cardRound,
               m.id AS matchId,
               mc.details,
               (
                 SELECT COUNT(*) 
                 FROM matches m2 
                 WHERE m2.status='played' 
                   AND (m2.home_team_id = p.team_id OR m2.away_team_id = p.team_id)
                   AND m2.id > m.id
               ) AS servedMatches,
               (mc.suspension_matches - (
                 SELECT COUNT(*) 
                 FROM matches m2 
                 WHERE m2.status='played' 
                   AND (m2.home_team_id = p.team_id OR m2.away_team_id = p.team_id)
                   AND m2.id > m.id
               )) AS remainingMatches
        FROM match_cards mc
        JOIN players p ON p.id = mc.player_id
        JOIN teams t ON t.id = p.team_id
        JOIN matches m ON m.id = mc.match_id
        WHERE mc.card_type = 'red'
          AND (
            mc.is_pending_suspension = 1
            OR
            (mc.suspension_matches - (
                 SELECT COUNT(*) 
                 FROM matches m2 
                 WHERE m2.status='played' 
                   AND (m2.home_team_id = p.team_id OR m2.away_team_id = p.team_id)
                   AND m2.id > m.id
               )) > 0
          )
      `;
      const redParams = [];
      if (phaseId !== null) {
        redQuery += ` AND m.phase_tournament_id IN (SELECT pt.id FROM phase_tournaments pt WHERE pt.phase_id <= ?)`;
        redParams.push(phaseId);
      }
      
      const suspended = db.prepare(redQuery).all(...redParams).map(mapPlainObject);

      suspended.forEach(s => {
        s.suspensionType = s.details ? s.details : 'Roja Directa';
      });

      // 2. Find players with exactly 4 yellow cards (or multiples of 4) grouped by phase
      let yellowQuery = `
        SELECT p.id, p.name AS playerName, t.id AS teamId, t.name AS teamName, t.shield_url AS shieldUrl,
               pt.phase_id AS phaseId, COUNT(mc.id) AS yellowCount
        FROM match_cards mc
        JOIN players p ON p.id = mc.player_id
        JOIN teams t ON t.id = p.team_id
        JOIN matches m ON m.id = mc.match_id
        JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
        WHERE mc.card_type = 'yellow'
      `;
      const yellowParams = [];
      if (phaseId !== null) {
        yellowQuery += ` AND pt.phase_id <= ?`;
        yellowParams.push(phaseId);
      }
      yellowQuery += `
        GROUP BY p.id, pt.phase_id
        HAVING yellowCount >= 4
      `;
      const playersWith4Yellows = db.prepare(yellowQuery).all(...yellowParams).map(mapPlainObject);

      for (const p of playersWith4Yellows) {
        // Find all yellow cards of this player in this specific phase
        const yellowCards = db.prepare(`
          SELECT mc.id AS cardId, mc.match_id AS matchId, m.round_number AS cardRound
          FROM match_cards mc
          JOIN matches m ON m.id = mc.match_id
          JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
          WHERE mc.player_id = ? AND mc.card_type = 'yellow' AND pt.phase_id = ?
          ORDER BY m.id ASC, mc.id ASC
        `).all(p.id, p.phaseId).map(mapPlainObject);

        if (yellowCards.length >= 4) {
          // The 4th yellow card determines when the suspension is triggered
          const triggerCard = yellowCards[3]; // index 3 is the 4th card!
          
          // Calculate served matches: matches played by their team after triggerCard.matchId
          const teamId = p.teamId;
          
          const servedMatchesRow = db.prepare(`
            SELECT COUNT(*) AS count
            FROM matches m2
            WHERE m2.status='played'
              AND (m2.home_team_id = ? OR m2.away_team_id = ?)
              AND m2.id > ?
          `).get(teamId, teamId, triggerCard.matchId);
          
          const servedMatches = Number(servedMatchesRow.count || 0);
          const originalSuspension = 1;
          const remainingMatches = originalSuspension - servedMatches;

          if (remainingMatches > 0) {
            suspended.push({
              cardId: triggerCard.cardId,
              id: p.id,
              playerName: p.playerName,
              teamName: p.teamName,
              shieldUrl: p.shieldUrl,
              originalSuspension: originalSuspension,
              isPending: 0,
              cardRound: triggerCard.cardRound,
              servedMatches: servedMatches,
              remainingMatches: remainingMatches,
              suspensionType: '4 Amarillas'
            });
          }
        }
      }

      // Sort by status, remaining matches, and name
      suspended.sort((a, b) => b.isPending - a.isPending || b.remainingMatches - a.remainingMatches || a.playerName.localeCompare(b.playerName));

      sendJson(res, 200, suspended);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/stats/player/:id/cards
  const playerCardsMatch = url.pathname.match(/^\/api\/stats\/player\/(\d+)\/cards$/);
  if (req.method === 'GET' && playerCardsMatch) {
    try {
      const pId = Number(playerCardsMatch[1]);
      const history = db.prepare(`
        SELECT 
            mc.card_type AS cardType,
            mc.minute,
            mc.suspension_matches AS suspensionMatches,
            mc.is_pending_suspension AS isPending,
            m.round_number AS roundNumber,
            m.match_date AS calendarDate,
            pt.label AS phaseLabel,
            ph.label AS tournamentLabel
        FROM match_cards mc
        JOIN matches m ON m.id = mc.match_id
        JOIN phase_tournaments pt ON pt.id = m.phase_tournament_id
        JOIN phases ph ON ph.id = pt.phase_id
        WHERE mc.player_id = ?
        ORDER BY m.id DESC
      `).all(pId).map(mapPlainObject);
      
      sendJson(res, 200, history);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  sendJson(res, 404, { error: 'Ruta de estadisticas no encontrada.' });
}

function getMatchGoalsReport(matchId) {
  const match = db.prepare('SELECT id, home_team_id AS homeTeamId, away_team_id AS awayTeamId FROM matches WHERE id = ?').get(matchId);
  if (!match) return null;

  const matchGoals = db.prepare(`
    SELECT g.id, g.player_id AS playerId, g.team_id AS teamId, g.minute, g.is_own_goal AS isOwnGoal, p.name AS playerName, t.name AS teamName
    FROM match_goals g
    JOIN players p ON p.id = g.player_id
    JOIN teams t ON t.id = g.team_id
    WHERE g.match_id = ?
  `).all(matchId).map(mapPlainObject);

  function buildTeamData(teamId) {
    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(Number(teamId));
    if (!team) return null;
    const players = db.prepare(`
      SELECT id, name, number, position FROM players WHERE team_id = ? AND is_active = 1 ORDER BY number IS NULL, number ASC, name ASC
    `).all(Number(teamId)).map(mapPlainObject);

    return {
      ...mapPlainObject(team),
      players: players.map(p => ({
        ...p,
        goals: matchGoals.filter(g => g.playerId === p.id)
      }))
    };
  }

  return { homeTeam: buildTeamData(match.homeTeamId), awayTeam: buildTeamData(match.awayTeamId) };
}

function getRoundResults(tournamentId, round) {
  const matches = db.prepare(`
    SELECT m.id, m.round_number AS roundNumber, m.home_team_id AS homeTeamId, m.away_team_id AS awayTeamId,
           m.home_goals AS homeScore, m.away_goals AS awayScore, m.status,
           ht.name AS homeTeamName, ht.shield_url AS homeTeamShield,
           at.name AS awayTeamName, at.shield_url AS awayTeamShield
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.phase_tournament_id = ? AND m.round_number = ?
    ORDER BY COALESCE(m.match_time, '99:99') ASC, m.id ASC
  `).all(tournamentId, round).map(mapPlainObject);

  return matches.map(m => {
    const goals = db.prepare(`
      SELECT g.id, g.player_id AS playerId, g.team_id AS teamId, g.minute, g.is_own_goal AS isOwnGoal, p.name AS playerName
      FROM match_goals g
      JOIN players p ON p.id = g.player_id
      WHERE g.match_id = ?
      ORDER BY g.minute ASC
    `).all(m.id).map(mapPlainObject);

    const cards = db.prepare(`
      SELECT id, player_id AS playerId, team_id AS teamId, card_type AS cardType, minute, 
             (SELECT name FROM players WHERE id = player_id) AS playerName
      FROM match_cards WHERE match_id = ?
      ORDER BY minute ASC
    `).all(m.id).map(mapPlainObject);

    return { ...m, goals, cards };
  });
}

function getMatchCardsReport(matchId) {
  const match = db.prepare('SELECT id, phase_tournament_id AS phaseTournamentId, home_team_id AS homeTeamId, away_team_id AS awayTeamId FROM matches WHERE id = ?').get(matchId);
  if (!match) return null;
  match.phaseTournamentId = Number(match.phaseTournamentId);

  // Cards already given in THIS match
  const matchCards = db.prepare(`
    SELECT id, player_id AS playerId, team_id AS teamId, card_type AS cardType, minute, suspension_matches AS suspensionMatches, details FROM match_cards WHERE match_id = ?
  `).all(matchId).map(mapPlainObject);

  // Accumulated cards ELSEWHERE in same tournament (not this match)
  const maxRoundRow = db.prepare(`SELECT MAX(round_number) as maxRound FROM matches WHERE status='played' AND phase_tournament_id = ?`).get(match.phaseTournamentId);
  const currentRound = maxRoundRow.maxRound || 1;

  const tourCards = db.prepare(`
    SELECT mc.player_id AS playerId, mc.card_type AS cardType, COUNT(*) AS cnt,
           SUM(CASE WHEN mc.card_type = 'red' AND (mc.suspension_matches - (? - m.round_number)) > 0 THEN 1 ELSE 0 END) AS activeSuspensions
    FROM match_cards mc
    JOIN matches m ON m.id = mc.match_id
    WHERE m.phase_tournament_id = ? AND mc.match_id != ?
    GROUP BY mc.player_id, mc.card_type
  `).all(currentRound, match.phaseTournamentId, matchId).map(mapPlainObject);

  const tourMap = {};
  for (const tc of tourCards) {
    if (!tourMap[tc.playerId]) tourMap[tc.playerId] = { yellow: 0, red: 0, activeSuspensions: 0 };
    tourMap[tc.playerId][tc.cardType] = Number(tc.cnt);
    if (tc.cardType === 'red') {
      tourMap[tc.playerId].activeSuspensions += Number(tc.activeSuspensions);
    }
  }

  function buildTeamData(teamId) {
    const team = db.prepare('SELECT id, name FROM teams WHERE id = ?').get(Number(teamId));
    if (!team) return null;
    const players = db.prepare(`
      SELECT id, name, number, position FROM players WHERE team_id = ? AND is_active = 1 ORDER BY number IS NULL, number ASC, name ASC
    `).all(Number(teamId)).map(mapPlainObject);

    return {
      ...mapPlainObject(team),
      players: players.map(p => {
        const myMatchCards = matchCards.filter(c => c.playerId === p.id);
        const tour = tourMap[p.id] || { yellow: 0, red: 0 };
        return {
          ...p,
          matchYellows: myMatchCards.filter(c => c.cardType === 'yellow').map(c => ({ id: c.id, minute: c.minute })),
          matchReds:    myMatchCards.filter(c => c.cardType === 'red').map(c => ({ id: c.id, minute: c.minute, suspensionMatches: c.suspensionMatches })),
          tourYellows: tour.yellow,
          tourReds: tour.red,
          suspended: tour.activeSuspensions > 0,
        };
      }),
    };
  }

  return { homeTeam: buildTeamData(match.homeTeamId), awayTeam: buildTeamData(match.awayTeamId) };
}

function mapPlainObject(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? Number(value) : value])
  );
}

function nowIso() {
  return new Date().toISOString();
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      throw validationError('El cuerpo de la solicitud es demasiado grande.');
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw validationError('El JSON enviado no es valido.');
  }
}

function sendJson(res, statusCode, payload) {
  const body = payload !== undefined ? JSON.stringify(payload) : '';
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveLogosFile(req, res, pathname) {
  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const basename = path.basename(safePath);
  const filePath = path.join(LOGOS_DIR, basename);

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendPlain(res, 404, 'Logo no encontrado.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': stats.size
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStaticFile(req, res, pathname) {
  const relativePath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendPlain(res, 403, 'Acceso denegado.');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendPlain(res, 404, 'Archivo no encontrado.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentTypeFor(filePath),
      'Content-Length': stats.size
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  });
}

function sendPlain(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message)
  });
  res.end(message);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}
