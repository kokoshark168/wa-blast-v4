const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

// Normalize: frontend may send "body" but DB column is "content"
function normalizeBody(req, res, next) {
  if (req.body.body && !req.body.content) {
    req.body.content = req.body.body;
    delete req.body.body;
  }
  // Stringify interactive_data if object
  if (req.body.interactive_data && typeof req.body.interactive_data === 'object') {
    req.body.interactive_data = JSON.stringify(req.body.interactive_data);
  }
  next();
}

const ALLOWED = ['name', 'content', 'variables', 'spin_variants', 'media_id', 'interactive_type', 'interactive_data'];

router.get('/', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM templates ORDER BY id DESC').all();
    res.json({ data: rows, total: rows.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', auth, (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, normalizeBody, auditLog('templates.create'), (req, res) => {
  try {
    const db = getDb();
    const fields = ALLOWED.filter(f => req.body[f] !== undefined);
    if (!fields.includes('name') || !fields.includes('content')) {
      return res.status(400).json({ error: 'Name and content required' });
    }
    const vals = fields.map(f => req.body[f]);
    const sql = `INSERT INTO templates (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`;
    const result = db.prepare(sql).run(...vals);
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e) {
    console.error('Template create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function updateTemplate(req, res) {
  try {
    const db = getDb();
    const fields = ALLOWED.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'No valid fields' });
    fields.push('updated_at');
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.slice(0, -1).map(f => req.body[f]);
    vals.push(new Date().toISOString());
    db.prepare(`UPDATE templates SET ${sets} WHERE id = ?`).run(...vals, req.params.id);
    const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error('Template update error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

router.patch('/:id', auth, normalizeBody, auditLog('templates.update'), updateTemplate);
router.put('/:id', auth, normalizeBody, auditLog('templates.update'), updateTemplate);

router.delete('/:id', auth, auditLog('templates.delete'), (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Preview template with variables
router.post('/:id/preview', auth, (req, res) => {
  try {
    const db = getDb();
    const template = db.prepare('SELECT * FROM templates WHERE id = ?').get(req.params.id);
    if (!template) return res.status(404).json({ error: 'Not found' });
    let text = template.content;
    const vars = req.body.variables || req.body || {};
    for (const [key, value] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    // Process spin syntax
    text = text.replace(/\{([^}]*\|[^}]*)\}/g, (_, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)];
    });
    res.json({ preview: text, content: text, original: template.content });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
