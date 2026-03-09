const { Router } = require('express');
const { getDb } = require('../db/init');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

function generateKey() {
  return 'wab_' + crypto.randomBytes(24).toString('hex');
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// List API keys (masked)
router.get('/', auth, (req, res) => {
  const db = getDb();
  const keys = db.prepare(`SELECT id, name, key, tenant_id, permissions_json, rate_limit, is_active, last_used, last_used_at, created_at
    FROM api_keys ORDER BY id DESC`).all();
  // Mask keys
  const masked = keys.map(k => ({
    ...k,
    key_preview: k.key ? k.key.slice(0, 12) + '...' + k.key.slice(-4) : null,
    permissions: k.permissions_json ? JSON.parse(k.permissions_json) : [],
  }));
  res.json(masked);
});

// Create API key
router.post('/', auth, auditLog('api_keys.create'), (req, res) => {
  const { name, permissions, rate_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const key = generateKey();
  const keyHash = hashKey(key);
  const perms = permissions || ['send_message', 'manage_campaigns', 'manage_contacts', 'view_reports'];

  const result = db.prepare(
    'INSERT INTO api_keys (name, key, key_hash, user_id, tenant_id, permissions_json, rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(name, key, keyHash, req.user.id, req.user.tenant_id || null, JSON.stringify(perms), rate_limit || 100);

  res.status(201).json({
    id: result.lastInsertRowid,
    name,
    key, // Only shown once
    permissions: perms,
    rate_limit: rate_limit || 100,
    message: 'Save this key - it won\'t be shown again'
  });
});

// Toggle active
router.patch('/:id', auth, auditLog('api_keys.update'), (req, res) => {
  const db = getDb();
  const { is_active, name, permissions, rate_limit } = req.body;
  const key = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(req.params.id);
  if (!key) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE api_keys SET
    is_active = COALESCE(?, is_active),
    name = COALESCE(?, name),
    permissions_json = COALESCE(?, permissions_json),
    rate_limit = COALESCE(?, rate_limit)
    WHERE id = ?`).run(
    is_active, name,
    permissions ? JSON.stringify(permissions) : null,
    rate_limit, req.params.id
  );
  res.json({ success: true });
});

// Delete
router.delete('/:id', auth, auditLog('api_keys.delete'), (req, res) => {
  const result = getDb().prepare('DELETE FROM api_keys WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
