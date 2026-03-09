require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getDb } = require('./init');
const { v4: uuidv4 } = require('uuid');

const db = getDb();

// Clear existing data
const tables = ['blast_queue','contacts','contact_lists','campaigns','templates','phone_numbers','phone_groups','proxies','media','breeding_sessions','replies','blacklist','alerts','audit_log','settings','api_keys','otp_codes','users'];
for (const t of tables) db.exec(`DELETE FROM ${t}`);

// Admin user
db.prepare('INSERT INTO users (phone, name, role) VALUES (?, ?, ?)').run('+6281234567890', 'Admin Tom', 'admin');

// Phone groups
db.prepare('INSERT INTO phone_groups (name, description) VALUES (?, ?)').run('Group A', 'Primary senders');
db.prepare('INSERT INTO phone_groups (name, description) VALUES (?, ?)').run('Group B', 'Backup senders');

// Proxies
db.prepare('INSERT INTO proxies (host, port, username, password, type, status) VALUES (?,?,?,?,?,?)').run('proxy1.example.com', 8080, 'user1', 'pass1', 'http', 'active');
db.prepare('INSERT INTO proxies (host, port, username, password, type, status) VALUES (?,?,?,?,?,?)').run('proxy2.example.com', 1080, 'user2', 'pass2', 'socks5', 'active');
db.prepare('INSERT INTO proxies (host, port, username, password, type, status) VALUES (?,?,?,?,?,?)').run('proxy3.example.com', 8080, null, null, 'http', 'dead');

// Phone numbers
const phones = [
  ['+6281100000001', 'active', 95, 1, 1, 150, 3, 0],
  ['+6281100000002', 'active', 80, 1, 1, 200, 15, 0],
  ['+6281100000003', 'active', 60, 2, 2, 100, 25, 1],
  ['+6281100000004', 'inactive', 40, 2, 2, 50, 30, 2],
  ['+6281100000005', 'banned', 10, null, null, 300, 100, 5],
];
const insertPhone = db.prepare('INSERT INTO phone_numbers (number, status, health_score, proxy_id, group_id, total_sent, total_failed, ban_count) VALUES (?,?,?,?,?,?,?,?)');
for (const p of phones) insertPhone.run(...p);

// Templates
db.prepare('INSERT INTO templates (name, content, variables, spin_variants) VALUES (?,?,?,?)').run(
  'Promo Template', 'Halo {{name}}, ada promo spesial untuk Anda! Diskon {{discount}}% hari ini.',
  '["name","discount"]', '["Halo|Hi|Hey","promo spesial|penawaran istimewa"]'
);
db.prepare('INSERT INTO templates (name, content, variables, spin_variants) VALUES (?,?,?,?)').run(
  'Follow Up', 'Hi {{name}}, terima kasih sudah berbelanja. Ada pertanyaan?',
  '["name"]', '["Hi|Hello|Hai"]'
);

// Contact list + contacts
db.prepare('INSERT INTO contact_lists (name, count) VALUES (?, ?)').run('Demo Contacts', 10);
const insertContact = db.prepare('INSERT INTO contacts (list_id, phone, name, vars) VALUES (?,?,?,?)');
for (let i = 1; i <= 10; i++) {
  insertContact.run(1, `+628900000000${i}`, `Contact ${i}`, JSON.stringify({ discount: (i * 5).toString() }));
}

// Campaign with blast history
db.prepare('INSERT INTO campaigns (name, status, template_id, contact_list_id, delay_min, delay_max, numbers_used) VALUES (?,?,?,?,?,?,?)').run(
  'Demo Campaign', 'completed', 1, 1, 5, 15, '[1,2]'
);
const insertQueue = db.prepare('INSERT INTO blast_queue (campaign_id, sender_number_id, target_phone, status, sent_at, error) VALUES (?,?,?,?,?,?)');
for (let i = 1; i <= 10; i++) {
  const status = i <= 7 ? 'sent' : (i <= 9 ? 'failed' : 'pending');
  const sentAt = status === 'sent' ? '2026-02-20 10:00:00' : null;
  const error = status === 'failed' ? 'Timeout' : null;
  insertQueue.run(1, (i % 2) + 1, `+628900000000${i}`, status, sentAt, error);
}

// Settings
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_delay_min', '5');
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('default_delay_max', '15');
db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('max_daily_per_number', '200');

// Alert
db.prepare('INSERT INTO alerts (type, message) VALUES (?, ?)').run('warning', 'Phone +6281100000005 has been banned');

console.log('✅ Seed data inserted successfully');
