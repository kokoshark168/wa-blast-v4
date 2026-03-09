const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const router = Router();

router.get('/', auth, (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const rows = getDb().prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?').all(Number(limit), Number(offset));
  const total = getDb().prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  res.json({ data: rows, total });
});

module.exports = router;
