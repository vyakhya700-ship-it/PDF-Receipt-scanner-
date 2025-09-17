const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', '..', 'receipts.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables as per README specification
db.exec(`
CREATE TABLE IF NOT EXISTS receipt_file (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT, -- Add file_hash column
  is_valid INTEGER DEFAULT 0 CHECK (is_valid IN (0, 1)),
  invalid_reason TEXT,
  is_processed INTEGER DEFAULT 0 CHECK (is_processed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchased_at TEXT,
  merchant_name TEXT,
  total_amount REAL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;

