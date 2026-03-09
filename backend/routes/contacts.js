const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

// GET /lists
router.get('/lists', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM contact_lists ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

// POST /lists
router.post('/lists', auth, auditLog('contacts.create_list'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const result = db.prepare('INSERT INTO contact_lists (name) VALUES (?)').run(name);
  const row = db.prepare('SELECT * FROM contact_lists WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// DELETE /lists/:id
router.delete('/lists/:id', auth, auditLog('contacts.delete_list'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM contact_lists WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// GET /lists/:id/contacts
router.get('/lists/:id/contacts', auth, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 100;
  const rows = db.prepare('SELECT * FROM contacts WHERE list_id = ? ORDER BY id DESC LIMIT ?').all(req.params.id, limit);
  const total = db.prepare('SELECT COUNT(*) as c FROM contacts WHERE list_id = ?').get(req.params.id).c;
  res.json({ data: rows, total });
});

// POST /lists/:id/bulk
router.post('/lists/:id/bulk', auth, auditLog('contacts.bulk_add'), (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT id FROM contact_lists WHERE id = ?').get(req.params.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const { contacts } = req.body;
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts array required' });
  const stmt = db.prepare('INSERT INTO contacts (list_id, phone, name, vars) VALUES (?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const c of contacts) {
      stmt.run(req.params.id, c.phone, c.name || null, JSON.stringify(c.vars || {}));
    }
  });
  tx();
  db.prepare('UPDATE contact_lists SET count = (SELECT COUNT(*) FROM contacts WHERE list_id = ?) WHERE id = ?').run(req.params.id, req.params.id);
  res.json({ imported: contacts.length });
});

// DELETE /contacts/:id (single contact)
router.delete('/contacts/:id', auth, (req, res) => {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM contacts WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE contact_lists SET count = (SELECT COUNT(*) FROM contacts WHERE list_id = ?) WHERE id = ?').run(contact.list_id, contact.list_id);
  res.json({ success: true });
});

// GET /invalid - list flagged invalid contacts
router.get('/invalid', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT c.*, cl.name as list_name FROM contacts c LEFT JOIN contact_lists cl ON c.list_id = cl.id WHERE c.is_valid = 0 ORDER BY c.id DESC').all();
  res.json({ data: rows, total: rows.length });
});

// PATCH /contacts/:id/revalidate - mark contact as valid again
router.patch('/contacts/:id/revalidate', auth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE contacts SET is_valid = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
