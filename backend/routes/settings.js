const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const auditLog = require('../middleware/auditLog');
const crypto = require('crypto');
const router = Router();

// === Core settings ===
router.get('/', auth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM settings').all();
  const obj = {};
  rows.forEach(r => obj[r.key] = r.value);
  res.json({ data: obj });
});

router.post('/', auth, adminOnly, auditLog('settings.update'), (req, res) => {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      stmt.run(key, String(value));
    }
  });
  tx();
  res.json({ success: true });
});

router.put('/', auth, adminOnly, auditLog('settings.update'), (req, res) => {
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      stmt.run(key, String(value));
    }
  });
  tx();
  res.json({ success: true });
});

// === Number Groups ===
router.get('/number-groups', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM phone_groups ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

router.post('/number-groups', auth, auditLog('number_groups.create'), (req, res) => {
  const db = getDb();
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO phone_groups (name, description) VALUES (?, ?)').run(name, description || null);
  res.status(201).json(db.prepare('SELECT * FROM phone_groups WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/number-groups/:id', auth, auditLog('number_groups.update'), (req, res) => {
  const db = getDb();
  const { name, description } = req.body;
  const fields = []; const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE phone_groups SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM phone_groups WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.delete('/number-groups/:id', auth, auditLog('number_groups.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM phone_groups WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// === Anti-ban Profiles ===
router.get('/antiban', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM antiban_profiles ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

router.post('/antiban', auth, auditLog('antiban.create'), (req, res) => {
  const db = getDb();
  const { name, min_delay, max_delay, typing_simulation, online_status } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO antiban_profiles (name, min_delay, max_delay, typing_simulation, online_status) VALUES (?, ?, ?, ?, ?)').run(
    name, min_delay || 5, max_delay || 15, typing_simulation ? 1 : 0, online_status ? 1 : 0
  );
  res.status(201).json(db.prepare('SELECT * FROM antiban_profiles WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/antiban/:id', auth, auditLog('antiban.update'), (req, res) => {
  const db = getDb();
  const allowed = ['name', 'min_delay', 'max_delay', 'typing_simulation', 'online_status'];
  const fields = []; const vals = [];
  for (const f of allowed) {
    if (req.body[f] !== undefined) {
      fields.push(`${f} = ?`);
      vals.push(f === 'typing_simulation' || f === 'online_status' ? (req.body[f] ? 1 : 0) : req.body[f]);
    }
  }
  if (!fields.length) return res.status(400).json({ error: 'No fields to update' });
  vals.push(req.params.id);
  db.prepare(`UPDATE antiban_profiles SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const row = db.prepare('SELECT * FROM antiban_profiles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

router.delete('/antiban/:id', auth, auditLog('antiban.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM antiban_profiles WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// === API Keys ===
router.get('/api-keys', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM api_keys ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

router.post('/api-keys', auth, auditLog('api_keys.create'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const key = 'wab_' + crypto.randomBytes(24).toString('hex');
  const result = db.prepare('INSERT INTO api_keys (name, key, user_id) VALUES (?, ?, ?)').run(name, key, req.user?.id || null);
  res.status(201).json(db.prepare('SELECT * FROM api_keys WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/api-keys/:id', auth, auditLog('api_keys.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});


// === Cooldown Management ===
router.post('/cooldown/clear-all', auth, adminOnly, auditLog('cooldown.clear_all'), (req, res) => {
  const db = getDb();
  const result = db.prepare("UPDATE phone_numbers SET cooldown_until = NULL WHERE cooldown_until IS NOT NULL").run();
  res.json({ success: true, cleared: result.changes });
});

router.post('/cooldown/toggle', auth, adminOnly, auditLog('cooldown.toggle'), (req, res) => {
  const db = getDb();
  const { enabled } = req.body;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_cooldown_enabled', ?)").run(enabled ? 'true' : 'false');
  // If disabling, also clear all existing cooldowns
  if (!enabled) {
    db.prepare("UPDATE phone_numbers SET cooldown_until = NULL WHERE cooldown_until IS NOT NULL").run();
  }
  res.json({ success: true, auto_cooldown_enabled: !!enabled });
});

// === Individual setting get/put ===
router.get('/:key', auth, (req, res) => {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(req.params.key);
  res.json({ key: req.params.key, value: row ? row.value : '1' });
});

router.put('/:key', auth, (req, res) => {
  const { value } = req.body;
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(req.params.key, String(value));
  res.json({ success: true, key: req.params.key, value: String(value) });
});

module.exports = router;

// POST /api/settings/backup — create backup
router.post("/backup", auth, (req, res) => {
  try {
    const { execSync } = require("child_process");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = `/root/backups/wa-backup-${ts}.tar.gz`;
    execSync(`mkdir -p /root/backups && tar -czf ${file} -C /opt/app --exclude=node_modules --exclude=auth_store --exclude="*.log" backend/ frontend/dist/`, { timeout: 30000 });
    const { statSync } = require("fs");
    const size = (statSync(file).size / 1024 / 1024).toFixed(1);
    res.json({ message: `Backup created: ${file} (${size}MB)`, file, size: size + "MB" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
