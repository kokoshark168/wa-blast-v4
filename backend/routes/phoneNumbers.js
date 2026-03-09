const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { isValidPhone, isValidCsv } = require('../utils/validate');
const router = Router();

const crud = buildCrud('phone_numbers', {
  allowedFields: ['number','status','health_score','proxy_id','group_id','cooldown_until','total_sent','total_failed','ban_count']
});

router.get('/', auth, crud.getAll);
router.get('/:id', auth, crud.getById);

// Create with validation & duplicate check
router.post('/', auth, auditLog('phone_numbers.create'), (req, res, next) => {
  if (!req.body.number) return res.status(400).json({ error: 'Number is required' });
  if (!isValidPhone(req.body.number)) return res.status(400).json({ error: 'Invalid phone number format' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM phone_numbers WHERE number = ?').get(req.body.number);
  if (existing) return res.status(409).json({ error: 'Phone number already exists' });
  next();
}, crud.create);

router.patch('/:id', auth, auditLog('phone_numbers.update'), crud.update);
router.delete('/:id', auth, auditLog('phone_numbers.delete'), crud.remove);

// Bulk upload CSV: number,status,proxy_id,group_id
router.post('/bulk-upload', auth, auditLog('phone_numbers.bulk_upload'), (req, res) => {
  const { parse } = require('csv-parse/sync');
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'csv field required (CSV string)' });
  if (!isValidCsv(csv)) return res.status(400).json({ error: 'Invalid CSV format' });

  try {
    const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    if (!records.length) return res.status(400).json({ error: 'CSV has no data rows' });

    // Validate all phone numbers first
    const invalid = records.filter(r => r.number && !isValidPhone(r.number));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid phone numbers found: ${invalid.slice(0, 5).map(r => r.number).join(', ')}${invalid.length > 5 ? '...' : ''}` });
    }

    const db = getDb();
    const stmt = db.prepare('INSERT OR IGNORE INTO phone_numbers (number, status, proxy_id, group_id) VALUES (?, ?, ?, ?)');
    let count = 0;
    const tx = db.transaction(() => {
      for (const r of records) {
        if (!r.number) continue;
        const result = stmt.run(r.number, r.status || 'inactive', r.proxy_id || null, r.group_id || null);
        if (result.changes) count++;
      }
    });
    tx();
    res.json({ imported: count, duplicates_skipped: records.length - count });
  } catch (e) {
    res.status(400).json({ error: 'Invalid CSV: ' + e.message });
  }
});

// Connect / Disconnect
router.post('/:id/connect', auth, auditLog('phone_numbers.connect'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE phone_numbers SET status = ?, connected_at = datetime('now', 'localtime') WHERE id = ?").run('active', req.params.id);
  res.json(db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id));
});

router.post('/:id/disconnect', auth, auditLog('phone_numbers.disconnect'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE phone_numbers SET status = ?, connected_at = NULL WHERE id = ?').run('inactive', req.params.id);
  res.json(db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id));
});

// Bulk add numbers from JSON array
router.post('/bulk', auth, auditLog('phone_numbers.bulk_add'), (req, res) => {
  const { numbers } = req.body;
  if (!Array.isArray(numbers) || !numbers.length) return res.status(400).json({ error: 'numbers array required' });
  const db = getDb();
  const stmt = db.prepare('INSERT OR IGNORE INTO phone_numbers (number) VALUES (?)');
  let count = 0;
  const tx = db.transaction(() => {
    for (const num of numbers) {
      const result = stmt.run(String(num));
      if (result.changes) count++;
    }
  });
  tx();
  res.json({ imported: count, duplicates_skipped: numbers.length - count });
});

// Recalculate health score
router.post('/:id/recalculate-health', auth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const total = row.total_sent + row.total_failed;
  const score = total === 0 ? 100 : Math.max(0, Math.round(100 * (1 - row.total_failed / total)));
  db.prepare('UPDATE phone_numbers SET health_score = ? WHERE id = ?').run(score, req.params.id);
  res.json(db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id));
});

module.exports = router;
