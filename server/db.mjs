// SQLite storage (node:sqlite, synchronous). Everything persistent lives here;
// presence and SSE connections are kept in memory by app.mjs.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY,
  username     TEXT NOT NULL,
  username_lc  TEXT NOT NULL UNIQUE,
  pass_salt    BLOB NOT NULL,
  pass_hash    BLOB NOT NULL,
  cat_json     TEXT,
  allow_visits INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);
CREATE TABLE IF NOT EXISTS saves (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  rev        INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_failures (
  username_lc TEXT NOT NULL,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_failures_name ON login_failures(username_lc, at);
CREATE TABLE IF NOT EXISTS visits (
  id          INTEGER PRIMARY KEY,
  from_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  answered_at INTEGER
);
CREATE INDEX IF NOT EXISTS visits_pair ON visits(from_id, to_id, status);
CREATE TABLE IF NOT EXISTS gifts (
  id         INTEGER PRIMARY KEY,
  from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  acked_at   INTEGER
);
CREATE INDEX IF NOT EXISTS gifts_inbox ON gifts(to_id, acked_at);
`;

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);

  const q = (sql) => db.prepare(sql);
  const st = {
    userById: q('SELECT * FROM users WHERE id = ?'),
    userByName: q('SELECT * FROM users WHERE username_lc = ?'),
    insertUser: q(`INSERT INTO users (username, username_lc, pass_salt, pass_hash, created_at)
                   VALUES (?, ?, ?, ?, ?)`),
    setProfile: q('UPDATE users SET cat_json = ?, allow_visits = ? WHERE id = ?'),

    insertToken: q('INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)'),
    userByToken: q(`SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?`),
    deleteToken: q('DELETE FROM tokens WHERE token_hash = ?'),

    getSave: q('SELECT data, rev FROM saves WHERE user_id = ?'),
    insertSave: q('INSERT INTO saves (user_id, data, rev, updated_at) VALUES (?, ?, 1, ?)'),
    updateSave: q('UPDATE saves SET data = ?, rev = rev + 1, updated_at = ? WHERE user_id = ? AND rev = ?'),

    countFailures: q('SELECT COUNT(*) AS n FROM login_failures WHERE username_lc = ? AND at > ?'),
    addFailure: q('INSERT INTO login_failures (username_lc, at) VALUES (?, ?)'),
    clearFailures: q('DELETE FROM login_failures WHERE username_lc = ?'),
    pruneFailures: q('DELETE FROM login_failures WHERE at <= ?'),

    pendingVisit: q(`SELECT id FROM visits WHERE from_id = ? AND to_id = ? AND status = 'pending' AND expires_at > ?`),
    insertVisit: q(`INSERT INTO visits (from_id, to_id, status, created_at, expires_at) VALUES (?, ?, 'pending', ?, ?)`),
    visitById: q('SELECT * FROM visits WHERE id = ?'),
    answerVisit: q(`UPDATE visits SET status = ?, answered_at = ? WHERE id = ? AND status = 'pending'`),
    acceptedVisit: q(`SELECT id FROM visits WHERE from_id = ? AND to_id = ? AND status = 'accepted' AND answered_at > ? LIMIT 1`),

    insertGift: q('INSERT INTO gifts (from_id, to_id, kind, amount, created_at) VALUES (?, ?, ?, ?, ?)'),
    inbox: q(`SELECT g.id, g.kind, g.amount, g.created_at, g.from_id, u.username AS from_name
              FROM gifts g JOIN users u ON u.id = g.from_id
              WHERE g.to_id = ? AND g.acked_at IS NULL ORDER BY g.id LIMIT 200`),
    ackGift: q('UPDATE gifts SET acked_at = ? WHERE id = ? AND to_id = ? AND acked_at IS NULL'),
  };

  // Plaza needs each listed user's level from their save; json_extract avoids
  // parsing every blob in JS.
  function levels(ids) {
    if (!ids.length) return new Map();
    const rows = db.prepare(
      `SELECT user_id, json_extract(data, '$.level') AS level FROM saves
       WHERE user_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    return new Map(rows.map((r) => [r.user_id, r.level]));
  }

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  return { db, st, levels, tx, close: () => { if (db.isOpen) db.close(); } };
}
