const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const auditLog = require('../middleware/auditLog');
const crypto = require('crypto');
const router = Router();

// List all tenants (admin only)
router.get('/', auth, adminOnly, (req, res) => {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM phone_numbers WHERE tenant_id = t.id) as number_count,
      (SELECT COUNT(*) FROM campaigns WHERE tenant_id = t.id) as campaign_count,
      (SELECT COALESCE(SUM(count),0) FROM usage_logs WHERE tenant_id = t.id AND date = date('now')) as today_messages
    FROM tenants t ORDER BY t.id DESC
  `).all();
  res.json(tenants);
});

// Get single tenant
router.get('/:id', auth, adminOnly, (req, res) => {
  const db = getDb();
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json(tenant);
});

// Create tenant
router.post('/', auth, adminOnly, auditLog('tenants.create'), (req, res) => {
  const { name, email, role, max_numbers, max_messages_per_day } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

  const db = getDb();
  try {
    const result = db.prepare(
      'INSERT INTO tenants (name, email, role, max_numbers, max_messages_per_day) VALUES (?, ?, ?, ?, ?)'
    ).run(name, email.toLowerCase(), role || 'reseller', max_numbers || 5, max_messages_per_day || 1000);

    // Also create a user account for the tenant
    try {
      db.prepare('INSERT INTO users (email, name, role, tenant_id) VALUES (?, ?, ?, ?)').run(
        email.toLowerCase(), name, 'operator', result.lastInsertRowid
      );
    } catch (e) { /* user may already exist */ }

    res.status(201).json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(result.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Update tenant
router.patch('/:id', auth, adminOnly, auditLog('tenants.update'), (req, res) => {
  const { name, email, role, max_numbers, max_messages_per_day, is_active } = req.body;
  const db = getDb();
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  db.prepare(`UPDATE tenants SET
    name = COALESCE(?, name),
    email = COALESCE(?, email),
    role = COALESCE(?, role),
    max_numbers = COALESCE(?, max_numbers),
    max_messages_per_day = COALESCE(?, max_messages_per_day),
    is_active = COALESCE(?, is_active)
    WHERE id = ?`).run(name, email, role, max_numbers, max_messages_per_day, is_active, req.params.id);

  res.json(db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.id));
});

// Delete tenant
router.delete('/:id', auth, adminOnly, auditLog('tenants.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM tenants WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
