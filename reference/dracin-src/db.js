import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data', 'dracin.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT,
    first_name TEXT,
    joined_at TEXT DEFAULT (datetime('now')),
    vip_until TEXT,
    referral_code TEXT UNIQUE,
    referred_by INTEGER REFERENCES users(id),
    watch_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    drama_id TEXT NOT NULL,
    drama_title TEXT,
    episode_no INTEGER,
    watched_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    package_id TEXT,
    package_name TEXT,
    amount INTEGER,
    proof_file_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vip_packages (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    duration_days INTEGER NOT NULL,
    price_idr INTEGER NOT NULL,
    description TEXT,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS auto_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    response TEXT NOT NULL,
    active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Default VIP packages
const insertPackage = db.prepare(`
  INSERT OR IGNORE INTO vip_packages (id, name, duration_days, price_idr, description)
  VALUES (?, ?, ?, ?, ?)
`);

const packages = [
  ['vip_3d', 'VIP 3 Hari', 3, 19000, 'Akses Unlimited 3 Hari - Hemat Buat Coba'],
  ['vip_7d', 'VIP 7 Hari', 7, 29000, 'Akses Unlimited Seminggu - Paling Populer'],
  ['vip_30d', 'VIP 30 Hari', 30, 49000, 'Akses Unlimited Sebulan - Best Value!'],
  ['vip_lifetime', 'VIP Permanen', 36500, 129000, 'VIP Seumur Hidup - Sekali Bayar'],
];

const insertAll = db.transaction(() => {
  for (const p of packages) insertPackage.run(...p);
});
insertAll();

// Default auto-replies
const insertReply = db.prepare(`
  INSERT OR IGNORE INTO auto_replies (keyword, response) VALUES (?, ?)
`);

const replies = [
  ['cara bayar', '💳 Cara Bayar:\n1. Klik tombol VIP di menu\n2. Pilih paket\n3. Scan QRIS atau transfer ke rekening\n4. Upload bukti pembayaran\n5. Tunggu verifikasi (auto <1 menit)\n\nAda pertanyaan lain?'],
  ['harga', '💰 Paket VIP:\n• 3 Hari: Rp 19.000\n• 7 Hari: Rp 29.000 (Paling Populer!)\n• 30 Hari: Rp 49.000\n• Permanen: Rp 129.000\n\nSemua paket UNLIMITED nonton!'],
  ['error', '⚠️ Coba langkah ini:\n1. Refresh halaman (swipe down)\n2. Tutup & buka lagi Mini App\n3. Kalau masih error, ketik /bantuan\n\nAdmin akan bantu sebentar lagi 🙏'],
  ['admin', '📞 Butuh bantuan admin? Ketik /bantuan dan admin kami akan merespon secepatnya.\n\nAtau langsung chat: @elang1689'],
  ['gratis', '🎁 Kamu bisa nonton GRATIS sampai 10 episode pertama!\nSetelah itu, butuh VIP untuk lanjut.\n\nKlik menu VIP untuk lihat paket 👑'],
];

const insertReplies = db.transaction(() => {
  for (const r of replies) insertReply.run(...r);
});
insertReplies();

// Insert default settings
db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('free_episode_limit', '10')`).run();
db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('vip_expiry_warning_days', '3')`).run();

export default db;
