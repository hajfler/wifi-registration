const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/registrations.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

function initDb() {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name   TEXT NOT NULL,
      last_name    TEXT NOT NULL,
      email        TEXT NOT NULL UNIQUE,
      phone        TEXT NOT NULL,
      password     TEXT NOT NULL,
      unifi_ppsk_id TEXT,
      expires_at   DATETIME,
      is_active    INTEGER DEFAULT 1,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Datenbank initialisiert:', DB_PATH);
}

function insertRegistration({ first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at }) {
  const stmt = getDb().prepare(`
    INSERT INTO registrations (first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at);
}

function findByEmail(email) {
  return getDb().prepare('SELECT * FROM registrations WHERE email = ?').get(email);
}

// Gibt nur aktive, noch nicht abgelaufene Registrierungen zurück
function findActiveByEmail(email) {
  return getDb().prepare(`
    SELECT * FROM registrations
    WHERE email = ?
      AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(email);
}

function upsertRegistration({ first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at }) {
  const existing = findByEmail(email);
  if (existing) {
    return getDb().prepare(`
      UPDATE registrations
      SET first_name = ?, last_name = ?, phone = ?, password = ?,
          unifi_ppsk_id = ?, expires_at = ?, is_active = 1, created_at = CURRENT_TIMESTAMP
      WHERE email = ?
    `).run(first_name, last_name, phone, password, unifi_ppsk_id, expires_at, email);
  }
  return insertRegistration({ first_name, last_name, email, phone, password, unifi_ppsk_id, expires_at });
}

function getExpiredActiveRegistrations() {
  return getDb().prepare(`
    SELECT * FROM registrations
    WHERE is_active = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')
  `).all();
}

function deactivateRegistration(id) {
  return getDb().prepare('UPDATE registrations SET is_active = 0 WHERE id = ?').run(id);
}

module.exports = { getDb, initDb, insertRegistration, upsertRegistration, findByEmail, findActiveByEmail, getExpiredActiveRegistrations, deactivateRegistration };
