const { Router } = require('express');
const auth = require('../middleware/auth');
const { getDb } = require('../db/init');
const router = Router();

// GET /api/auto-replies — list all rules
router.get('/', auth, (req, res) => {
  const db = getDb();
  const rules = db.prepare('SELECT * FROM auto_reply_rules ORDER BY priority DESC, id ASC').all();
  res.json(rules);
});

// GET /api/auto-replies/active — list active rules (used by N8N)
router.get('/active', (req, res) => {
  // Allow without auth for N8N webhook (or with API key)
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  if (!apiKey && !authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();
  const rules = db.prepare('SELECT * FROM auto_reply_rules WHERE is_active = 1 ORDER BY priority DESC, id ASC').all();
  res.json(rules);
});

// POST /api/auto-replies — create rule
router.post('/', auth, (req, res) => {
  const { keyword, match_type, action, response_text, is_active, priority } = req.body;
  if (!keyword) return res.status(400).json({ error: 'Keyword is required' });

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO auto_reply_rules (keyword, match_type, action, response_text, is_active, priority) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(keyword, match_type || 'contains', action || 'reply', response_text || '', is_active !== undefined ? (is_active ? 1 : 0) : 1, priority || 0);

  const rule = db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rule);
});

// PATCH /api/auto-replies/:id — update rule
router.patch('/:id', auth, (req, res) => {
  const { keyword, match_type, action, response_text, is_active, priority } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });

  db.prepare(
    'UPDATE auto_reply_rules SET keyword = ?, match_type = ?, action = ?, response_text = ?, is_active = ?, priority = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(
    keyword ?? existing.keyword,
    match_type ?? existing.match_type,
    action ?? existing.action,
    response_text ?? existing.response_text,
    is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
    priority ?? existing.priority,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/auto-replies/:id — delete rule
router.delete('/:id', auth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM auto_reply_rules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Rule not found' });
  db.prepare('DELETE FROM auto_reply_rules WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/auto-replies/:id/hit — increment hit count (called by N8N)
router.post('/:id/hit', (req, res) => {
  const db = getDb();
  db.prepare('UPDATE auto_reply_rules SET hit_count = hit_count + 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/auto-replies/match — find matching rule for a message (used by N8N)
router.post('/match', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const db = getDb();
  const rules = db.prepare('SELECT * FROM auto_reply_rules WHERE is_active = 1 ORDER BY priority DESC, id ASC').all();
  const msgLower = message.toLowerCase().trim();

  for (const rule of rules) {
    const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase());
    let matched = false;

    for (const kw of keywords) {
      switch (rule.match_type) {
        case 'exact':
          matched = msgLower === kw;
          break;
        case 'startswith':
          matched = msgLower.startsWith(kw);
          break;
        case 'regex':
          try { matched = new RegExp(kw, 'i').test(message); } catch (e) { matched = false; }
          break;
        case 'contains':
        default:
          matched = msgLower.includes(kw);
          break;
      }
      if (matched) break;
    }

    if (matched) {
      // Increment hit count
      db.prepare('UPDATE auto_reply_rules SET hit_count = hit_count + 1 WHERE id = ?').run(rule.id);
      return res.json({ matched: true, rule });
    }
  }

  res.json({ matched: false, rule: null });
});

module.exports = router;
