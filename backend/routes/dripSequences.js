const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

// List all sequences with step count and enrollment count
router.get('/', auth, (req, res) => {
  const db = getDb();
  const sequences = db.prepare(`
    SELECT ds.*, 
      (SELECT COUNT(*) FROM drip_steps WHERE sequence_id = ds.id) as step_count,
      (SELECT COUNT(*) FROM drip_enrollments WHERE sequence_id = ds.id) as enrollment_count,
      (SELECT COUNT(*) FROM drip_enrollments WHERE sequence_id = ds.id AND status = 'active') as active_count,
      (SELECT COUNT(*) FROM drip_enrollments WHERE sequence_id = ds.id AND status = 'completed') as completed_count
    FROM drip_sequences ds ORDER BY ds.id DESC
  `).all();
  res.json({ data: sequences });
});

// Get single sequence with steps
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const seq = db.prepare('SELECT * FROM drip_sequences WHERE id = ?').get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });
  seq.steps = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? ORDER BY step_order ASC').all(req.params.id);
  seq.enrollments = db.prepare('SELECT * FROM drip_enrollments WHERE sequence_id = ? ORDER BY id DESC LIMIT 100').all(req.params.id);
  res.json(seq);
});

// Create sequence
router.post('/', auth, auditLog('drip.create'), (req, res) => {
  const { name, description, is_active } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const result = db.prepare('INSERT INTO drip_sequences (name, description, is_active) VALUES (?, ?, ?)').run(name, description || null, is_active !== undefined ? is_active : 1);
  res.status(201).json(db.prepare('SELECT * FROM drip_sequences WHERE id = ?').get(result.lastInsertRowid));
});

// Update sequence
router.patch('/:id', auth, auditLog('drip.update'), (req, res) => {
  const db = getDb();
  const { name, description, is_active } = req.body;
  const fields = []; const vals = [];
  if (name !== undefined) { fields.push('name = ?'); vals.push(name); }
  if (description !== undefined) { fields.push('description = ?'); vals.push(description); }
  if (is_active !== undefined) { fields.push('is_active = ?'); vals.push(is_active); }
  if (!fields.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  db.prepare(`UPDATE drip_sequences SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  const seq = db.prepare('SELECT * FROM drip_sequences WHERE id = ?').get(req.params.id);
  if (!seq) return res.status(404).json({ error: 'Not found' });
  res.json(seq);
});

// Delete sequence
router.delete('/:id', auth, auditLog('drip.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM drip_sequences WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// --- Steps CRUD ---
router.get('/:id/steps', auth, (req, res) => {
  const db = getDb();
  const steps = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? ORDER BY step_order ASC').all(req.params.id);
  res.json({ data: steps });
});

router.post('/:id/steps', auth, auditLog('drip.step.create'), (req, res) => {
  const db = getDb();
  const { step_order, delay_hours, message_text, template_id } = req.body;
  // Auto step_order if not provided
  const maxOrder = db.prepare('SELECT MAX(step_order) as m FROM drip_steps WHERE sequence_id = ?').get(req.params.id);
  const order = step_order || (maxOrder?.m || 0) + 1;
  const result = db.prepare('INSERT INTO drip_steps (sequence_id, step_order, delay_hours, message_text, template_id) VALUES (?, ?, ?, ?, ?)').run(
    req.params.id, order, delay_hours || 1, message_text || null, template_id || null
  );
  res.status(201).json(db.prepare('SELECT * FROM drip_steps WHERE id = ?').get(result.lastInsertRowid));
});

router.patch('/:id/steps/:stepId', auth, auditLog('drip.step.update'), (req, res) => {
  const db = getDb();
  const { step_order, delay_hours, message_text, template_id } = req.body;
  const fields = []; const vals = [];
  if (step_order !== undefined) { fields.push('step_order = ?'); vals.push(step_order); }
  if (delay_hours !== undefined) { fields.push('delay_hours = ?'); vals.push(delay_hours); }
  if (message_text !== undefined) { fields.push('message_text = ?'); vals.push(message_text); }
  if (template_id !== undefined) { fields.push('template_id = ?'); vals.push(template_id); }
  if (!fields.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.stepId);
  db.prepare(`UPDATE drip_steps SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json(db.prepare('SELECT * FROM drip_steps WHERE id = ?').get(req.params.stepId));
});

router.delete('/:id/steps/:stepId', auth, auditLog('drip.step.delete'), (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM drip_steps WHERE id = ? AND sequence_id = ?').run(req.params.stepId, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Reorder steps
router.post('/:id/steps/reorder', auth, auditLog('drip.step.reorder'), (req, res) => {
  const db = getDb();
  const { order } = req.body; // array of step IDs in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order array required' });
  const update = db.prepare('UPDATE drip_steps SET step_order = ? WHERE id = ? AND sequence_id = ?');
  const reorder = db.transaction(() => {
    order.forEach((stepId, idx) => update.run(idx + 1, stepId, req.params.id));
  });
  reorder();
  const steps = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? ORDER BY step_order ASC').all(req.params.id);
  res.json({ data: steps });
});

// --- Enrollment ---
router.post('/:id/enroll', auth, auditLog('drip.enroll'), (req, res) => {
  const db = getDb();
  const { contact_list_id, phones } = req.body;
  let contactPhones = phones || [];
  
  if (contact_list_id) {
    const contacts = db.prepare('SELECT phone FROM contacts WHERE list_id = ? AND COALESCE(is_valid, 1) = 1').all(contact_list_id);
    contactPhones = contacts.map(c => c.phone);
  }
  if (!contactPhones.length) return res.status(400).json({ error: 'No contacts to enroll' });

  // Get first step
  const firstStep = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? ORDER BY step_order ASC LIMIT 1').get(req.params.id);
  if (!firstStep) return res.status(400).json({ error: 'Sequence has no steps' });

  const nextSendAt = new Date(Date.now() + firstStep.delay_hours * 3600000).toISOString();
  const stmt = db.prepare('INSERT OR IGNORE INTO drip_enrollments (sequence_id, contact_phone, current_step, status, next_send_at) VALUES (?, ?, ?, ?, ?)');
  
  let enrolled = 0;
  const enroll = db.transaction(() => {
    for (const phone of contactPhones) {
      // Skip already enrolled active
      const existing = db.prepare('SELECT id FROM drip_enrollments WHERE sequence_id = ? AND contact_phone = ? AND status = ?').get(req.params.id, phone, 'active');
      if (!existing) {
        stmt.run(req.params.id, phone, 0, 'active', nextSendAt);
        enrolled++;
      }
    }
  });
  enroll();
  res.json({ message: `Enrolled ${enrolled} contacts`, enrolled });
});

// Get enrollments for a sequence
router.get('/:id/enrollments', auth, (req, res) => {
  const db = getDb();
  const enrollments = db.prepare('SELECT * FROM drip_enrollments WHERE sequence_id = ? ORDER BY id DESC').all(req.params.id);
  res.json({ data: enrollments });
});

// Cancel enrollment
router.post('/:id/enrollments/:enrollId/cancel', auth, auditLog('drip.enrollment.cancel'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE drip_enrollments SET status = 'cancelled' WHERE id = ? AND sequence_id = ?").run(req.params.enrollId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
