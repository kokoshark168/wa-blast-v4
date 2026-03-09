const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

let db;

function getDb() {
  if (db) return db;
  const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrate users table: make phone nullable (was NOT NULL)
  try {
    db.exec("INSERT INTO users (email, name, role) VALUES ('__test_nullable__', 'test', 'operator')");
    db.exec("DELETE FROM users WHERE email = '__test_nullable__'");
  } catch (e) {
    // phone is NOT NULL, need to recreate table
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT UNIQUE,
          email TEXT UNIQUE,
          name TEXT,
          role TEXT DEFAULT 'operator' CHECK(role IN ('admin','operator')),
          created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        );
        INSERT INTO users_new (id, phone, name, role, created_at) SELECT id, phone, name, role, created_at FROM users;
        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    } catch (e2) { /* ignore */ }
  }

  // Migrate otp_codes: make phone nullable, add email column
  try {
    db.exec("INSERT INTO otp_codes (email, code, expires_at) VALUES ('__test__', '000000', '2099-01-01')");
    db.exec("DELETE FROM otp_codes WHERE email = '__test__'");
  } catch (e) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS otp_codes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          phone TEXT,
          email TEXT,
          code TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used INTEGER DEFAULT 0
        );
        INSERT INTO otp_codes_new (id, phone, code, expires_at, used) SELECT id, phone, code, expires_at, used FROM otp_codes;
        DROP TABLE otp_codes;
        ALTER TABLE otp_codes_new RENAME TO otp_codes;
      `);
      console.log('✅ Migrated otp_codes table (phone nullable, email added)');
    } catch (e2) { /* ignore */ }
  }

  // Add missing columns safely
  const alterStatements = [
    "ALTER TABLE replies ADD COLUMN read INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN is_ab_test INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN message TEXT",
    "ALTER TABLE users ADD COLUMN email TEXT UNIQUE",
    "ALTER TABLE otp_codes ADD COLUMN email TEXT",
    "ALTER TABLE campaigns ADD COLUMN media_url TEXT",
    "ALTER TABLE campaigns ADD COLUMN media_type TEXT",
    "ALTER TABLE campaigns ADD COLUMN interactive_type TEXT DEFAULT 'none'",
    "ALTER TABLE campaigns ADD COLUMN interactive_data TEXT",
  ];

  // Migrate blast_queue to support 'skipped' status (recreate table if CHECK constraint is old)
  try {
    // Test if 'skipped' status works
    db.exec("INSERT INTO blast_queue (campaign_id, target_phone, status) VALUES (-1, 'test', 'skipped')");
    db.exec("DELETE FROM blast_queue WHERE campaign_id = -1");
  } catch (e) {
    // Need to recreate table with new CHECK constraint
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS blast_queue_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          sender_number_id INTEGER REFERENCES phone_numbers(id) ON DELETE SET NULL,
          target_phone TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','skipped')),
          sent_at DATETIME,
          error TEXT
        );
        INSERT INTO blast_queue_new SELECT * FROM blast_queue;
        DROP TABLE blast_queue;
        ALTER TABLE blast_queue_new RENAME TO blast_queue;
      `);
    } catch (e2) { /* ignore if already migrated */ }
  }
  for (const sql of alterStatements) {
    try { db.exec(sql); } catch (e) { /* column already exists */ }
  }

  // Reporting features migration
  const reportingMigrations = [
    "ALTER TABLE blast_queue ADD COLUMN delivered_at DATETIME",
    "ALTER TABLE blast_queue ADD COLUMN read_at DATETIME",
    "ALTER TABLE blast_queue ADD COLUMN created_at DATETIME",
    "ALTER TABLE contacts ADD COLUMN is_valid INTEGER DEFAULT 1",
  ];
  for (const sql of reportingMigrations) {
    try { db.exec(sql); } catch (e) { /* column already exists */ }
  }

  // Migrate blast_queue CHECK constraint to include 'delivered' and 'read' statuses
  try {
    db.exec("INSERT INTO blast_queue (campaign_id, target_phone, status) VALUES (-1, 'test_status', 'delivered')");
    db.exec("DELETE FROM blast_queue WHERE campaign_id = -1");
  } catch (e) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS blast_queue_new2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          sender_number_id INTEGER REFERENCES phone_numbers(id) ON DELETE SET NULL,
          target_phone TEXT NOT NULL,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','read','failed','skipped')),
          sent_at DATETIME,
          error TEXT,
          delivered_at DATETIME,
          read_at DATETIME,
          tenant_id INTEGER,
          created_at DATETIME
        );
        INSERT INTO blast_queue_new2 (id, campaign_id, sender_number_id, target_phone, status, sent_at, error, delivered_at, read_at, created_at)
          SELECT id, campaign_id, sender_number_id, target_phone, status, sent_at, error, delivered_at, read_at, sent_at FROM blast_queue;
        DROP TABLE blast_queue;
        ALTER TABLE blast_queue_new2 RENAME TO blast_queue;
      `);
    } catch (e2) { /* ignore */ }
  }

  // Migrate phone_numbers CHECK constraint to include 'cooling' status
  try {
    db.exec("UPDATE phone_numbers SET status = 'cooling' WHERE id = -999");
    // If no error, constraint already allows 'cooling'
  } catch (e) {
    try {
      const cols = db.pragma('table_info(phone_numbers)');
      db.exec(`
        CREATE TABLE IF NOT EXISTS phone_numbers_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          number TEXT UNIQUE NOT NULL,
          status TEXT DEFAULT 'inactive' CHECK(status IN ('active','inactive','banned','qr_pending','connecting','disconnected','cooling')),
          health_score INTEGER DEFAULT 100,
          proxy_id INTEGER REFERENCES proxies(id) ON DELETE SET NULL,
          group_id INTEGER REFERENCES phone_groups(id) ON DELETE SET NULL,
          connected_at DATETIME,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          cooldown_until DATETIME,
          total_sent INTEGER DEFAULT 0,
          total_failed INTEGER DEFAULT 0,
          ban_count INTEGER DEFAULT 0
        );
        INSERT INTO phone_numbers_new SELECT * FROM phone_numbers;
        DROP TABLE phone_numbers;
        ALTER TABLE phone_numbers_new RENAME TO phone_numbers;
      `);
      console.log('✅ Migrated phone_numbers to support cooling status');
    } catch (e2) { /* ignore */ }
  }

  // Link tracking tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER REFERENCES campaigns(id),
      blast_queue_id INTEGER REFERENCES blast_queue(id),
      original_url TEXT NOT NULL,
      short_code TEXT UNIQUE NOT NULL,
      contact_number TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS link_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracked_link_id INTEGER REFERENCES tracked_links(id),
      clicked_at DATETIME DEFAULT (datetime('now', 'localtime')),
      user_agent TEXT,
      ip_address TEXT,
      referer TEXT
    );
  `);

  // Shortlink domains table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shortlink_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','dns_verified','ssl_active','active','failed','disabled')),
      is_primary INTEGER DEFAULT 0,
      total_clicks INTEGER DEFAULT 0,
      total_links INTEGER DEFAULT 0,
      ssl_expires_at DATETIME,
      verified_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      notes TEXT
    );
  `);

  // Migration: add domain_id to tracked_links
  try { db.exec("ALTER TABLE tracked_links ADD COLUMN domain_id INTEGER REFERENCES shortlink_domains(id)"); } catch (e) { /* already exists */ }

  // A/B Testing columns on campaigns
  const abMigrations = [
    "ALTER TABLE campaigns ADD COLUMN variant TEXT",
    "ALTER TABLE campaigns ADD COLUMN ab_test_group TEXT",
  ];
  for (const sql of abMigrations) {
    try { db.exec(sql); } catch (e) { /* already exists */ }
  }

  // Drip campaign tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS drip_sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS drip_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL DEFAULT 1,
      delay_hours REAL NOT NULL DEFAULT 1,
      message_text TEXT,
      template_id INTEGER REFERENCES templates(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS drip_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sequence_id INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
      contact_phone TEXT NOT NULL,
      current_step INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','paused','completed','cancelled')),
      next_send_at DATETIME,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Contact segments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_segments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      criteria_json TEXT DEFAULT '[]',
      auto_update INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Warmup plans table
  db.exec(`
    CREATE TABLE IF NOT EXISTS warmup_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_number_id INTEGER NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
      plan_type TEXT NOT NULL CHECK(plan_type IN ('conservative','moderate','aggressive')),
      current_day INTEGER DEFAULT 1,
      total_days INTEGER NOT NULL,
      daily_target INTEGER DEFAULT 5,
      daily_sent INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // === Feature 11: Multi-tenant / Reseller ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'reseller' CHECK(role IN ('admin','reseller')),
      max_numbers INTEGER DEFAULT 5,
      max_messages_per_day INTEGER DEFAULT 1000,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Add tenant_id to relevant tables
  const tenantMigrations = [
    "ALTER TABLE phone_numbers ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
    "ALTER TABLE contact_lists ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
    "ALTER TABLE campaigns ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
    "ALTER TABLE templates ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
    "ALTER TABLE blast_queue ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL",
  ];
  for (const sql of tenantMigrations) {
    try { db.exec(sql); } catch (e) { /* column already exists */ }
  }

  // Add tenant_id to users
  try { db.exec("ALTER TABLE users ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL"); } catch (e) {}

  // === Feature 12: API Key System (enhanced) ===
  // Add missing columns to api_keys
  const apiKeyMigrations = [
    "ALTER TABLE api_keys ADD COLUMN tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE",
    "ALTER TABLE api_keys ADD COLUMN key_hash TEXT",
    "ALTER TABLE api_keys ADD COLUMN permissions_json TEXT DEFAULT '[\"send_message\",\"manage_campaigns\",\"manage_contacts\",\"view_reports\"]'",
    "ALTER TABLE api_keys ADD COLUMN rate_limit INTEGER DEFAULT 100",
    "ALTER TABLE api_keys ADD COLUMN is_active INTEGER DEFAULT 1",
    "ALTER TABLE api_keys ADD COLUMN last_used_at DATETIME",
  ];
  for (const sql of apiKeyMigrations) {
    try { db.exec(sql); } catch (e) {}
  }

  // === Feature 13: Usage Billing Tracker ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('message_sent','message_delivered','api_call')),
      count INTEGER DEFAULT 1,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS billing_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      monthly_price REAL DEFAULT 0,
      message_limit INTEGER DEFAULT 1000,
      number_limit INTEGER DEFAULT 5,
      features_json TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id INTEGER NOT NULL REFERENCES billing_plans(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','cancelled','past_due','trialing')),
      current_period_start TEXT,
      current_period_end TEXT,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Seed default billing plans
  const plansExist = db.prepare("SELECT COUNT(*) as c FROM billing_plans").get().c;
  if (!plansExist) {
    db.prepare("INSERT INTO billing_plans (name, monthly_price, message_limit, number_limit, features_json) VALUES (?, ?, ?, ?, ?)").run('Free', 0, 500, 2, '["basic_blast"]');
    db.prepare("INSERT INTO billing_plans (name, monthly_price, message_limit, number_limit, features_json) VALUES (?, ?, ?, ?, ?)").run('Starter', 29, 5000, 10, '["basic_blast","templates","auto_reply"]');
    db.prepare("INSERT INTO billing_plans (name, monthly_price, message_limit, number_limit, features_json) VALUES (?, ?, ?, ?, ?)").run('Pro', 99, 50000, 50, '["basic_blast","templates","auto_reply","api_access","webhooks"]');
    db.prepare("INSERT INTO billing_plans (name, monthly_price, message_limit, number_limit, features_json) VALUES (?, ?, ?, ?, ?)").run('Enterprise', 299, 500000, 200, '["basic_blast","templates","auto_reply","api_access","webhooks","priority_support"]');
  }

  // === Feature 15: Webhook Notifications ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      events_json TEXT DEFAULT '[]',
      secret TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload TEXT,
      response_status INTEGER,
      response_body TEXT,
      attempts INTEGER DEFAULT 0,
      success INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // === Campaign Number Performance Stats ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_number_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      phone_number_id INTEGER NOT NULL,
      messages_sent INTEGER DEFAULT 0,
      messages_delivered INTEGER DEFAULT 0,
      messages_failed INTEGER DEFAULT 0,
      started_at DATETIME,
      ended_at DATETIME,
      end_reason TEXT DEFAULT NULL,
      UNIQUE(campaign_id, phone_number_id)
    );
  `);

  // Seed default admin tenant + user
  const defaultTenant = db.prepare("SELECT id FROM tenants WHERE role = 'admin' LIMIT 1").get();
  if (!defaultTenant) {
    const r = db.prepare("INSERT INTO tenants (name, email, role, max_numbers, max_messages_per_day) VALUES (?, ?, ?, ?, ?)").run('Super Admin', 'admin@wabackoffice.com', 'admin', 9999, 999999);
    // Link existing admin user to tenant
    try { db.prepare("UPDATE users SET tenant_id = ? WHERE role = 'admin'").run(r.lastInsertRowid); } catch (e) {}
  }

  // Seed default admin with email
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (!adminExists) {
    db.prepare("INSERT INTO users (phone, email, name, role) VALUES (?, ?, ?, ?)").run('+628000000000', 'admin@wabackoffice.com', 'Admin', 'admin');
  } else {
    // Ensure existing admin has an email
    const admin = db.prepare("SELECT id, email FROM users WHERE role = 'admin' LIMIT 1").get();
    if (admin && !admin.email) {
      try { db.prepare("UPDATE users SET email = ? WHERE id = ?").run('admin@wabackoffice.com', admin.id); } catch (e) { /* email might conflict */ }
    }
  }

  return db;
}

function cleanupExpiredRecords() {
  try {
    const d = getDb();
    const otpResult = d.prepare("DELETE FROM otp_codes WHERE expires_at < datetime('now', 'localtime') OR used = 1").run();
    let sessionChanges = 0;
    try {
      const sessionResult = d.prepare("DELETE FROM sessions WHERE expires_at < datetime('now', 'localtime')").run();
      sessionChanges = sessionResult.changes;
    } catch (e) { /* sessions table may not exist */ }
    console.log(`🧹 Cleanup: removed ${otpResult.changes} expired/used OTPs, ${sessionChanges} expired sessions`);
  } catch (err) {
    console.error('❌ Cleanup error:', err.message);
  }
}

module.exports = { getDb, cleanupExpiredRecords };
