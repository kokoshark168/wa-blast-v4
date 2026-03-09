-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT,
  role TEXT DEFAULT 'operator' CHECK(role IN ('admin','operator')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  email TEXT,
  code TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  used INTEGER DEFAULT 0
);

-- Phone Numbers & Groups
CREATE TABLE IF NOT EXISTS phone_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proxies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password TEXT,
  type TEXT DEFAULT 'http' CHECK(type IN ('http','socks5')),
  status TEXT DEFAULT 'active' CHECK(status IN ('active','dead')),
  assigned_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phone_numbers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'inactive' CHECK(status IN ('active','inactive','banned','qr_pending','connecting','disconnected','cooling')),
  health_score INTEGER DEFAULT 100,
  proxy_id INTEGER REFERENCES proxies(id) ON DELETE SET NULL,
  group_id INTEGER REFERENCES phone_groups(id) ON DELETE SET NULL,
  connected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  cooldown_until DATETIME,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  ban_count INTEGER DEFAULT 0
);

-- Media
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size INTEGER,
  path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT DEFAULT '[]',
  spin_variants TEXT DEFAULT '[]',
  media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contact Lists & Contacts
CREATE TABLE IF NOT EXISTS contact_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  vars TEXT DEFAULT '{}'
);

-- Campaigns & Queue
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft','scheduled','running','paused','completed')),
  template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
  contact_list_id INTEGER REFERENCES contact_lists(id) ON DELETE SET NULL,
  schedule_at DATETIME,
  delay_min INTEGER DEFAULT 5,
  delay_max INTEGER DEFAULT 15,
  numbers_used TEXT DEFAULT '[]',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blast_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_number_id INTEGER REFERENCES phone_numbers(id) ON DELETE SET NULL,
  target_phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')),
  sent_at DATETIME,
  error TEXT
);

-- Breeding
CREATE TABLE IF NOT EXISTS breeding_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT 'Untitled',
  number_ids TEXT NOT NULL DEFAULT '[]',
  frequency_minutes INTEGER NOT NULL DEFAULT 60,
  message_templates TEXT NOT NULL DEFAULT '["Hey!", "How are you?"]',
  status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('active','stopped')),
  last_run_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Replies & Blacklist
CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME
);

-- Anti-ban profiles
CREATE TABLE IF NOT EXISTS antiban_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  min_delay INTEGER DEFAULT 5,
  max_delay INTEGER DEFAULT 15,
  typing_simulation INTEGER DEFAULT 0,
  online_status INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Auto Reply Rules
CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  match_type TEXT DEFAULT 'contains' CHECK(match_type IN ('contains','exact','startswith','regex')),
  action TEXT DEFAULT 'reply' CHECK(action IN ('reply','blacklist','forward','ignore')),
  response_text TEXT,
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,
  hit_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
