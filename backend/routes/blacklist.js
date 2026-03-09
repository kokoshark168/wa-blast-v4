const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { isValidPhone } = require('../utils/validate');
const router = Router();

const crud = buildCrud('blacklist', { allowedFields: ['phone','reason'] });

router.get('/', auth, crud.getAll);

// Create with validation & duplicate check
router.post('/', auth, auditLog('blacklist.create'), (req, res, next) => {
  if (!req.body.phone) return res.status(400).json({ error: 'Phone is required' });
  if (!isValidPhone(req.body.phone)) return res.status(400).json({ error: 'Invalid phone number format' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM blacklist WHERE phone = ?').get(req.body.phone);
  if (existing) return res.status(409).json({ error: 'Phone number already blacklisted' });
  next();
}, crud.create);

router.delete('/:id', auth, auditLog('blacklist.delete'), crud.remove);

// Bulk add
router.post('/bulk', auth, auditLog('blacklist.bulk_add'), (req, res) => {
  const { phones } = req.body;
  if (!Array.isArray(phones) || !phones.length) return res.status(400).json({ error: 'phones array required' });
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO blacklist (phone) VALUES (?)');
  let count = 0;
  const tx = db.transaction(() => {
    for (const phone of phones) {
      const result = stmt.run(String(phone));
      if (result.changes) count++;
    }
  });
  tx();
  res.json({ imported: count, duplicates_skipped: phones.length - count });
});

module.exports = router;
