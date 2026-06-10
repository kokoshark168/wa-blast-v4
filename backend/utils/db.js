import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.join(__dirname, '..');

// Resolve relative DATABASE_PATH against the backend root (not process.cwd())
// so the same database is used no matter where the process is started from.
// ':memory:' is passed through for tests.
const rawPath = process.env.DATABASE_PATH;
const dbPath = rawPath === ':memory:'
  ? rawPath
  : rawPath
    ? path.resolve(backendRoot, rawPath)
    : path.join(backendRoot, 'db', 'drama.db');

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
