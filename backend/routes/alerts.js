const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

router.get('/', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM alerts ORDER BY id DESC').all();
  res.json({ data: rows, total: rows.length });
});

router.patch('/:id/read', auth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE alerts SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.put('/:id/read', auth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE alerts SET read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

router.post('/mark-all-read', auth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE alerts SET read = 1 WHERE read = 0').run();
  res.json({ success: true });
});

router.delete('/:id', auth, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM alerts WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

module.exports = router;
