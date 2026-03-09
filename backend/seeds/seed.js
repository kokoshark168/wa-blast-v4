const { getDb } = require('../db/init');

console.log('🌱 Seeding database...');
const db = getDb();

// Force migration of blast_queue CHECK constraint before seeding
try {
  db.exec("INSERT INTO blast_queue (campaign_id, target_phone, status) VALUES (-1, 'migration_test', 'read')");
  db.exec("DELETE FROM blast_queue WHERE campaign_id = -1");
} catch (e) {
  // Need to recreate with updated CHECK
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS blast_queue_seed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        sender_number_id INTEGER REFERENCES phone_numbers(id) ON DELETE SET NULL,
        target_phone TEXT NOT NULL,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending','sent','delivered','read','failed','skipped')),
        sent_at DATETIME,
        error TEXT,
        delivered_at DATETIME,
        read_at DATETIME
      );
      INSERT OR IGNORE INTO blast_queue_seed SELECT id, campaign_id, sender_number_id, target_phone, status, sent_at, error, delivered_at, read_at FROM blast_queue;
      DROP TABLE blast_queue;
      ALTER TABLE blast_queue_seed RENAME TO blast_queue;
    `);
    console.log('✅ Migrated blast_queue CHECK constraint');
  } catch (e2) { console.log('Migration skipped:', e2.message); }
}

// Preserve real phone numbers (id > 6, those are user-added with real WA sessions)
let preservedNumbers = [];
try { preservedNumbers = db.prepare("SELECT * FROM phone_numbers WHERE id > 6").all(); } catch (e) {}
console.log(`📦 Preserving ${preservedNumbers.length} real phone numbers`);

// Clear existing data (order matters for foreign keys)
const tables = ['link_clicks', 'tracked_links', 'shortlink_domains', 'audit_log', 'blast_queue', 'replies', 'alerts', 'breeding_sessions', 'campaigns', 'contacts', 'contact_lists', 'blacklist', 'templates', 'phone_numbers', 'phone_groups', 'proxies', 'antiban_profiles', 'api_keys', 'settings', 'media'];
for (const t of tables) {
  try { db.prepare(`DELETE FROM ${t}`).run(); } catch (e) { /* table may not exist */ }
}

// Restore real phone numbers
if (preservedNumbers.length) {
  const cols = Object.keys(preservedNumbers[0]);
  const placeholders = cols.map(() => '?').join(',');
  const restoreStmt = db.prepare(`INSERT OR REPLACE INTO phone_numbers (${cols.join(',')}) VALUES (${placeholders})`);
  for (const num of preservedNumbers) {
    restoreStmt.run(...cols.map(c => num[c]));
  }
  console.log(`✅ Restored ${preservedNumbers.length} real phone numbers`);
}

// Update demo user to admin
db.prepare("UPDATE users SET role = 'admin', name = 'Admin' WHERE phone = '+6281234567890'").run();
db.prepare("INSERT OR IGNORE INTO users (phone, name, role) VALUES ('+6281234567890', 'Admin', 'admin')").run();

// Phone groups
db.prepare("INSERT INTO phone_groups (id, name, description) VALUES (1, 'Batch 1 - Premium', 'Premium aged numbers')").run();
db.prepare("INSERT INTO phone_groups (id, name, description) VALUES (2, 'Batch 2 - New', 'Newly registered numbers')").run();

// Phone numbers - 5: 3 active, 1 inactive, 1 banned
const stmtNum = db.prepare("INSERT INTO phone_numbers (id, number, status, health_score, total_sent, total_failed, ban_count, group_id) VALUES (?,?,?,?,?,?,?,?)");
stmtNum.run(1, '+6281100000001', 'inactive', 95, 1250, 12, 0, 1);
stmtNum.run(2, '+6281100000002', 'inactive', 88, 980, 45, 0, 1);
stmtNum.run(3, '+6281100000003', 'inactive', 91, 450, 8, 0, 2);
stmtNum.run(4, '+6281100000004', 'inactive', 100, 0, 0, 0, 2);
stmtNum.run(5, '+6281100000005', 'banned', 15, 500, 200, 2, 1);

// Templates
db.prepare("INSERT INTO templates (id, name, content, spin_variants) VALUES (1, 'Promo Diskon', 'Halo {{name}}! 🎉\n\n{spin:Kami punya|Ada} promo {spin:menarik|spesial} dari {{company}}!\n\nDiskon hingga 50%!\n\n{spin:Terima kasih|Salam} 🙏', '[]')").run();
db.prepare("INSERT INTO templates (id, name, content, spin_variants) VALUES (2, 'Follow Up', 'Hi {{name}},\n\n{spin:Apakah|Sudahkah} Anda menerima info kami?\n\nKami dari {{company}} ingin {spin:memastikan|mengkonfirmasi}.\n\nHubungi kami! 😊', '[]')").run();

// Contact list with 10 contacts
db.prepare("INSERT INTO contact_lists (id, name, count) VALUES (1, 'Lead Jakarta', 10)").run();
const stmtContact = db.prepare("INSERT INTO contacts (list_id, phone, name) VALUES (?,?,?)");
for (let i = 1; i <= 10; i++) {
  stmtContact.run(1, `+62812000000${String(i).padStart(2, '0')}`, `Lead ${i}`);
}

// Campaigns
db.prepare("INSERT INTO campaigns (id, name, status, template_id, contact_list_id) VALUES (1, 'Promo Februari 2026', 'draft', 1, 1)").run();
db.prepare("INSERT INTO campaigns (id, name, status, template_id, contact_list_id) VALUES (2, 'Test Blast Campaign', 'completed', 2, 1)").run();
db.prepare("INSERT INTO campaigns (id, name, status, template_id, contact_list_id) VALUES (3, 'Flash Sale Weekend', 'completed', 1, 1)").run();

// Blast queue — Campaign 2 (completed, 5 sent)
const stmtQueue = db.prepare("INSERT INTO blast_queue (id, campaign_id, sender_number_id, target_phone, status, sent_at, delivered_at, read_at) VALUES (?,?,?,?,?,?,?,?)");
const now = Date.now();
stmtQueue.run(1, 2, 1, '+6281200000001', 'read', new Date(now - 86400000).toISOString(), new Date(now - 86300000).toISOString(), new Date(now - 85000000).toISOString());
stmtQueue.run(2, 2, 1, '+6281200000002', 'delivered', new Date(now - 86400000).toISOString(), new Date(now - 86200000).toISOString(), null);
stmtQueue.run(3, 2, 2, '+6281200000003', 'read', new Date(now - 86400000).toISOString(), new Date(now - 86100000).toISOString(), new Date(now - 80000000).toISOString());
stmtQueue.run(4, 2, 2, '+6281200000004', 'sent', new Date(now - 86400000).toISOString(), null, null);
stmtQueue.run(5, 2, 3, '+6281200000005', 'failed', null, null, null);

// Blast queue — Campaign 3 (completed, 8 sent, 2 failed, mixed statuses)
for (let i = 1; i <= 5; i++) {
  const sentAt = new Date(now - (i * 7200000)).toISOString();
  const delivAt = new Date(now - (i * 7200000) + 60000).toISOString();
  const readAt = i <= 3 ? new Date(now - (i * 7200000) + 300000).toISOString() : null;
  const status = i <= 3 ? 'read' : 'delivered';
  stmtQueue.run(5 + i, 3, (i % 3) + 1, `+62812000000${String(i).padStart(2, '0')}`, status, sentAt, delivAt, readAt);
}
for (let i = 6; i <= 8; i++) {
  stmtQueue.run(5 + i, 3, (i % 3) + 1, `+62812000000${String(i).padStart(2, '0')}`, 'sent', new Date(now - (i * 7200000)).toISOString(), null, null);
}
for (let i = 9; i <= 10; i++) {
  stmtQueue.run(5 + i, 3, (i % 3) + 1, `+62812000000${String(i).padStart(2, '0')}`, 'failed', null, null, null);
}

// Tracked links for Campaign 3
const stmtLink = db.prepare("INSERT INTO tracked_links (id, campaign_id, blast_queue_id, original_url, short_code, contact_number) VALUES (?,?,?,?,?,?)");
for (let i = 1; i <= 8; i++) {
  stmtLink.run(i, 3, 5 + i, 'https://example.com/promo?ref=flashsale', `fs${String(i).padStart(6, '0')}`, `+62812000000${String(i).padStart(2, '0')}`);
}

// Link clicks (some contacts clicked)
const stmtClick = db.prepare("INSERT INTO link_clicks (tracked_link_id, clicked_at, user_agent, ip_address) VALUES (?,?,?,?)");
// Contact 1 clicked twice
stmtClick.run(1, new Date(now - 80000000).toISOString(), 'Mozilla/5.0 (Android)', '103.10.20.1');
stmtClick.run(1, new Date(now - 70000000).toISOString(), 'Mozilla/5.0 (Android)', '103.10.20.1');
// Contact 2 clicked once
stmtClick.run(2, new Date(now - 75000000).toISOString(), 'Mozilla/5.0 (iPhone)', '182.1.2.3');
// Contact 3 clicked once
stmtClick.run(3, new Date(now - 60000000).toISOString(), 'Mozilla/5.0 (Android)', '36.70.1.1');
// Contact 5 clicked once
stmtClick.run(5, new Date(now - 50000000).toISOString(), 'Mozilla/5.0 (Windows)', '110.5.6.7');

// Settings
const settings = [
  ['cooldown_hours', '4'], ['max_messages_per_day', '500'], ['max_messages_per_hour', '50'],
  ['default_delay_min', '5'], ['default_delay_max', '15'], ['auto_rotate_on_ban', 'true'],
];
const stmtSettings = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of settings) stmtSettings.run(k, v);

// Breeding sessions
db.prepare("INSERT INTO breeding_sessions (name, status, frequency_minutes, number_ids, message_templates) VALUES ('Warm Group A', 'stopped', 30, '[1,2,3]', '[\"Hey!\",\"Apa kabar?\",\"Lagi apa?\"]')").run();
db.prepare("INSERT INTO breeding_sessions (name, status, frequency_minutes, number_ids, message_templates) VALUES ('Test Warming', 'active', 15, '[1,2]', '[\"Halo!\",\"Lagi sibuk?\",\"Cek pesan ya\"]')").run();

// Alerts
db.prepare("INSERT INTO alerts (type, message) VALUES ('error', 'Number +6281100000005 has been banned')").run();
db.prepare("INSERT INTO alerts (type, message) VALUES ('warning', 'Sender 5 has 28% failure rate')").run();
db.prepare("INSERT INTO alerts (type, message) VALUES ('info', 'WA Backoffice system started')").run();
db.prepare("INSERT INTO alerts (type, message) VALUES ('info', 'Campaign Flash Sale Weekend completed — 8/10 delivered')").run();

// Audit log (schema: user_id, action, details)
db.prepare("INSERT INTO audit_log (user_id, action, details) VALUES (1, 'create', 'Created campaign: Promo Februari 2026')").run();
db.prepare("INSERT INTO audit_log (user_id, action, details) VALUES (1, 'create', 'Created template: Promo Diskon')").run();
db.prepare("INSERT INTO audit_log (user_id, action, details) VALUES (1, 'ban_report', 'Reported ban: +6281100000005')").run();

// Antiban profile
db.prepare("INSERT INTO antiban_profiles (id, name, min_delay, max_delay, typing_simulation, online_status) VALUES (1, 'Conservative', 5, 15, 1, 1)").run();

// Blacklist
db.prepare("INSERT INTO blacklist (phone, reason) VALUES ('+6281999999999', 'Requested DND')").run();
db.prepare("INSERT INTO blacklist (phone, reason) VALUES ('+6281888888888', 'Complaint received')").run();

// Replies
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000001', '+6281100000001', 'Tertarik, info lebih lanjut?')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000002', '+6281100000001', 'Harganya berapa?')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000003', '+6281100000002', 'Mau dong promonya!')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000005', '+6281100000002', 'Stop')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000001', '+6281100000001', 'Oke saya mau daftar')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000006', '+6281100000003', 'Kirim brosurnya dong')").run();
db.prepare("INSERT INTO replies (from_number, to_number, message) VALUES ('+6281200000007', '+6281100000003', 'Kapan promonya berakhir?')").run();

// Auto Reply Rules
db.prepare("INSERT OR IGNORE INTO auto_reply_rules (id, keyword, match_type, action, response_text, is_active, priority) VALUES (1, 'stop, berhenti, unsub, unsubscribe', 'contains', 'blacklist', 'Maaf mengganggu. Nomor Anda telah dihapus dari daftar kami. 🙏', 1, 100)").run();
db.prepare("INSERT OR IGNORE INTO auto_reply_rules (id, keyword, match_type, action, response_text, is_active, priority) VALUES (2, 'harga, price, biaya, berapa, tarif', 'contains', 'reply', 'Terima kasih atas pertanyaan Anda! 🙏\\n\\nUntuk info harga dan katalog lengkap, silakan hubungi admin kami langsung.\\n\\nTerima kasih! 😊', 1, 50)").run();
db.prepare("INSERT OR IGNORE INTO auto_reply_rules (id, keyword, match_type, action, response_text, is_active, priority) VALUES (3, 'info, detail, katalog, catalog', 'contains', 'reply', 'Halo! Terima kasih sudah menghubungi kami. 😊\\n\\nUntuk informasi lengkap, silakan kunjungi website kami atau hubungi admin.\\n\\nTerima kasih!', 1, 40)").run();
db.prepare("INSERT OR IGNORE INTO auto_reply_rules (id, keyword, match_type, action, response_text, is_active, priority) VALUES (4, 'beli, order, mau, daftar, join', 'contains', 'forward', '', 1, 30)").run();

// Shortlink domains
db.prepare("INSERT INTO shortlink_domains (id, domain, status, is_primary, total_clicks, total_links) VALUES (1, 'promo.example.com', 'active', 1, 6, 8)").run();

console.log('✅ Seed complete!');
process.exit(0);
