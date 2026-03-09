const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

// Evaluate segment criteria and return matching contacts
function evaluateSegment(db, criteria) {
  // criteria is array of { type, operator, value }
  // types: replied, clicked, ignored, blacklisted, never_contacted, status
  if (!Array.isArray(criteria) || !criteria.length) return [];

  let conditions = [];
  let joins = new Set();
  
  for (const c of criteria) {
    switch (c.type) {
      case 'replied':
        joins.add('LEFT JOIN replies r ON r.from_number = ct.phone');
        conditions.push('r.id IS NOT NULL');
        break;
      case 'clicked':
        joins.add('LEFT JOIN tracked_links tl ON tl.contact_number = ct.phone');
        joins.add('LEFT JOIN link_clicks lc ON lc.tracked_link_id = tl.id');
        conditions.push('lc.id IS NOT NULL');
        break;
      case 'ignored':
        // Sent but no reply and no click
        joins.add('LEFT JOIN blast_queue bq_ign ON bq_ign.target_phone = ct.phone AND bq_ign.status IN (\'sent\',\'delivered\',\'read\')');
        joins.add('LEFT JOIN replies r_ign ON r_ign.from_number = ct.phone');
        conditions.push('bq_ign.id IS NOT NULL AND r_ign.id IS NULL');
        break;
      case 'blacklisted':
        joins.add('LEFT JOIN blacklist bl ON bl.phone = ct.phone');
        conditions.push('bl.id IS NOT NULL');
        break;
      case 'never_contacted':
        joins.add('LEFT JOIN blast_queue bq_nc ON bq_nc.target_phone = ct.phone');
        conditions.push('bq_nc.id IS NULL');
        break;
      case 'status':
        // blast_queue status filter
        if (c.value) {
          joins.add('LEFT JOIN blast_queue bq_st ON bq_st.target_phone = ct.phone');
          conditions.push(`bq_st.status = '${c.value.replace(/'/g, "''")}'`);
        }
        break;
    }
  }

  if (!conditions.length) return [];

  const sql = `SELECT DISTINCT ct.id, ct.phone, ct.name, ct.list_id, ct.vars 
    FROM contacts ct 
    ${[...joins].join(' ')} 
    WHERE COALESCE(ct.is_valid, 1) = 1 AND (${conditions.join(' AND ')})
    ORDER BY ct.id DESC LIMIT 10000`;

  try {
    return db.prepare(sql).all();
  } catch (e) {
    console.error('Segment evaluation error:', e.message, sql);
    return [];
  }
}

// List all segments with contact count
router.get('/', auth, (req, res) => {
  const db = getDb();
  const segments = db.prepare('SELECT * FROM contact_segments ORDER BY id DESC').all();
  // Calculate contact counts
  const result = segments.map(s => {
    const criteria = JSON.parse(s.criteria_json || '[]');
    const contacts = evaluateSegment(db, criteria);
    return { ...s, contact_count: contacts.length };
  });
  res.json({ data: result });
});

// Get segment with contacts
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const seg = db.prepare('SELECT * FROM contact_segments WHERE id = ?').get(req.params.id);
  if (!seg) return res.status(404).json({ error: 'Not found' });
  const criteria = JSON.parse(seg.criteria_json || '[]');
  seg.contacts = evaluateSegment(db, criteria);
  seg.contact_count = seg.contacts.length;
  res.json(seg);
});

// Get segment contacts only
router.get('/:id/contacts', auth, (req, res) => {
  const db = getDb();
  const seg = db.prepare('SELECT * FROM contact_segments WHERE id = ?').get(req.params.id);
  if (!seg) return res.status(404).json({ error: 'Not found' });
  const criteria = JSON.parse(seg.criteria_json || '[]');
  const contacts = evaluateSegment(db, criteria);
  res.json({ data: contacts, total: contacts.length });
});

// Create segment
router.post('/', auth, auditLog('segment.create'), (req, res) => {
  const { name, criteria_json, auto_update } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const criteria = criteria_json || '[]';
  const result = db.prepare('INSERT INTO contact_segments (name, criteria_json, auto_update) VALUES (?, ?, ?)').run(name, typeof criteria === 'string' ? criteria : JSON.stringify(criteria), auto_update !== undefined ? auto_update : 1);
  res.status(201).json(db.prepare('SELECT * FROM contact_segments WHERE id = ?').get(result.lastInsertRowid));
});

// Update segment
router.patch('/:id', auth, auditLog('segment.update'), (req, res) => {
  const db = getDb();
  const { name, criteria_json, auto_update } = req.body;
  const fields = []; const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (criteria_json !== undefined) { fields.push('criteria_json = ?'); vals.push(typeof criteria_json === 'string' ? criteria_json : JSON.stringify(criteria_json)); }
  if (auto_update !== undefined) { fields.push('auto_update = ?'); vals.push(auto_update); }
  if (!fields.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  db.prepare(`UPDATE contact_segments SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const seg = db.prepare('SELECT * FROM contact_segments WHERE id = ?').get(req.params.id);
  if (!seg) return res.status(404).json({ error: 'Not found' });
  res.json(seg);
});

// Delete segment
router.delete('/:id', auth, auditLog('segment.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM contact_segments WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Seed predefined segments
router.post('/seed-defaults', auth, (req, res) => {
  const db = getDb();
  const defaults = [
    { name: 'Active Responders', criteria: [{ type: 'replied' }] },
    { name: 'Clickers', criteria: [{ type: 'clicked' }] },
    { name: 'Cold', criteria: [{ type: 'ignored' }] },
    { name: 'New (Never Contacted)', criteria: [{ type: 'never_contacted' }] },
    { name: 'Blacklisted', criteria: [{ type: 'blacklisted' }] },
  ];
  const stmt = db.prepare('INSERT INTO contact_segments (name, criteria_json, auto_update) VALUES (?, ?, 1)');
  let created = 0;
  for (const d of defaults) {
    const exists = db.prepare('SELECT id FROM contact_segments WHERE name = ?').get(d.name);
    if (!exists) { stmt.run(d.name, JSON.stringify(d.criteria)); created++; }
  }
  res.json({ message: `Created ${created} default segments` });
});

module.exports = router;
