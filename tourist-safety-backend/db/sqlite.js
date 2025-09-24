const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function init(dbPath) {
  const abs = path.resolve(dbPath || './data/tourist-safety.db');
  ensureDir(path.dirname(abs));
  const db = new Database(abs);
  db.pragma('journal_mode = WAL');
  // Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS tourists (
      id TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT,
      registeredAt TEXT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      touristId TEXT,
      bleAddress TEXT,
      pairedAt TEXT
    );
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      touristId TEXT,
      deviceId TEXT,
      type TEXT,
      severity TEXT,
      status TEXT,
      latitude REAL,
      longitude REAL,
      regionId TEXT,
      createdAt TEXT,
      resolvedAt TEXT,
      meta TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      deviceId TEXT,
      touristId TEXT,
      type TEXT,
      payload TEXT,
      createdAt TEXT
    );
  `);
  return db;
}

function createIncident(db, row) {
  const stmt = db.prepare(`INSERT INTO incidents
    (id, touristId, deviceId, type, severity, status, latitude, longitude, regionId, createdAt, resolvedAt, meta)
    VALUES (@id, @touristId, @deviceId, @type, @severity, @status, @latitude, @longitude, @regionId, @createdAt, @resolvedAt, @meta)`);
  stmt.run({ ...row, meta: row.meta ? JSON.stringify(row.meta) : null });
}

function updateIncidentStatus(db, id, status) {
  const now = new Date().toISOString();
  db.prepare("UPDATE incidents SET status=@status, resolvedAt=CASE WHEN @status = 'resolved' THEN @now ELSE resolvedAt END WHERE id=@id")
    .run({ id, status, now });
}

function listIncidents(db, { regionId, sinceISO, limit = 1000 } = {}) {
  let sql = 'SELECT * FROM incidents';
  const where = [];
  const params = {};
  if (regionId && regionId !== 'all') { where.push('regionId = @regionId'); params.regionId = regionId; }
  if (sinceISO) { where.push('createdAt >= @sinceISO'); params.sinceISO = sinceISO; }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY datetime(createdAt) DESC LIMIT @limit';
  params.limit = limit;
  const rows = db.prepare(sql).all(params).map(r => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : undefined }));
  return rows;
}

function addEventsBatch(db, items = []) {
  const stmt = db.prepare('INSERT INTO events (id, deviceId, touristId, type, payload, createdAt) VALUES (@id, @deviceId, @touristId, @type, @payload, @createdAt)');
  const tx = db.transaction((batch) => {
    for (const it of batch) {
      stmt.run({ ...it, payload: it.payload ? JSON.stringify(it.payload) : null });
    }
  });
  tx(items);
  return items.length;
}

function listEvents(db, { limit = 200 } = {}) {
  const sql = 'SELECT * FROM events ORDER BY datetime(createdAt) DESC LIMIT @limit';
  return db.prepare(sql).all({ limit }).map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : undefined }));
}

module.exports = { init, createIncident, updateIncidentStatus, listIncidents, addEventsBatch, listEvents };
