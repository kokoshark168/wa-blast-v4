/**
 * Database schema initialization.
 * Uses the single shared connection from utils/db.js — opening a second
 * connection here previously risked initializing a different file than the
 * one the application actually queries.
 */
import db from '../utils/db.js';

const schema = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE,
  username TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  vip_tier TEXT CHECK(vip_tier IN ('free', 'premium', 'plus')) DEFAULT 'free',
  storage_limit_gb INTEGER DEFAULT 1,
  storage_used_gb REAL DEFAULT 0,
  download_bandwidth_gb_month INTEGER DEFAULT 10,
  concurrent_uploads INTEGER DEFAULT 1,
  vip_expires_at DATETIME,
  is_admin BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Drama catalog
CREATE TABLE IF NOT EXISTS dramas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  source TEXT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  year INTEGER,
  total_episodes INTEGER,
  rating REAL,
  genres TEXT,
  country TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Drama parts (merged episodes with file_id cache)
CREATE TABLE IF NOT EXISTS drama_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL,
  source TEXT,
  part_number INTEGER NOT NULL,
  episodes_start INTEGER,
  episodes_end INTEGER,
  file_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(drama_id, part_number),
  FOREIGN KEY (drama_id) REFERENCES dramas(id) ON DELETE CASCADE
);

-- Episode sources (raw video URLs from adapters)
CREATE TABLE IF NOT EXISTS episode_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drama_id INTEGER NOT NULL,
  episode_number INTEGER,
  source TEXT,
  video_url TEXT,
  duration_seconds INTEGER,
  quality TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(drama_id, episode_number, source),
  FOREIGN KEY (drama_id) REFERENCES dramas(id) ON DELETE CASCADE
);

-- File cache (for file_id lookups)
CREATE TABLE IF NOT EXISTS file_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE,
  file_hash TEXT UNIQUE,
  file_id TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- VIP subscriptions
CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT CHECK(tier IN ('free', 'premium', 'plus')) DEFAULT 'free',
  storage_limit_gb INTEGER,
  storage_used_gb REAL DEFAULT 0,
  download_bandwidth_gb_month INTEGER,
  concurrent_uploads INTEGER,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payments (NOWPayments)
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  payment_id TEXT UNIQUE,
  order_id TEXT UNIQUE,
  status TEXT,
  amount REAL,
  currency TEXT,
  tier TEXT,
  pay_amount REAL,
  txid TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Referral codes
CREATE TABLE IF NOT EXISTS referral_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  code TEXT UNIQUE NOT NULL,
  total_earned REAL DEFAULT 0,
  pending_balance REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Referrals (who referred whom)
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referred_user_id INTEGER NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Referral earnings
CREATE TABLE IF NOT EXISTS referral_earnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id INTEGER NOT NULL,
  referred_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'earned',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Withdrawals (admin approval)
CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  wallet_address TEXT,
  status TEXT DEFAULT 'pending',
  transaction_id TEXT,
  rejection_reason TEXT,
  requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  approved_at DATETIME,
  rejected_at DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_vip_tier ON users(vip_tier);
CREATE INDEX IF NOT EXISTS idx_dramas_source ON dramas(source);
CREATE INDEX IF NOT EXISTS idx_dramas_external_id ON dramas(external_id);
CREATE INDEX IF NOT EXISTS idx_drama_parts_drama_id ON drama_parts(drama_id);
CREATE INDEX IF NOT EXISTS idx_episode_sources_drama_id ON episode_sources(drama_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_user_id ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_earnings_referred ON referral_earnings(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_file_cache_hash ON file_cache(file_hash);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
`;

// Execute the whole schema at once. Schema errors are fatal — silently
// swallowing them would leave the app running against a broken database.
db.exec(schema);

// Lightweight migrations for columns added after the initial release
// (CREATE TABLE IF NOT EXISTS does not alter existing tables). These must run
// before any index that references the new columns is created.
const migrations = [
  { table: 'payments', column: 'order_id', ddl: 'ALTER TABLE payments ADD COLUMN order_id TEXT' }
];

for (const m of migrations) {
  const columns = db.prepare(`PRAGMA table_info(${m.table})`).all().map(c => c.name);
  if (!columns.includes(m.column)) {
    db.exec(m.ddl);
    console.log(`✅ Migration applied: ${m.table}.${m.column}`);
  }
}

// Indexes on migrated columns (created after the migrations above)
db.exec('CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id)');

console.log('✅ Database initialized');

export default db;
