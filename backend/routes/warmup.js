const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');

router.use(auth);

const PLANS = {
  conservative: {
    totalDays: 14,
    schedule: [
      { from: 1, to: 3, target: 5 },
      { from: 4, to: 7, target: 15 },
      { from: 8, to: 10, target: 30 },
      { from: 11, to: 14, target: 50 },
    ]
  },
  moderate: {
    totalDays: 7,
    schedule: [
      { from: 1, to: 2, target: 10 },
      { from: 3, to: 4, target: 25 },
      { from: 5, to: 7, target: 50 },
    ]
  },
  aggressive: {
    totalDays: 3,
    schedule: [
      { from: 1, to: 1, target: 20 },
      { from: 2, to: 2, target: 40 },
      { from: 3, to: 3, target: 60 },
    ]
  }
};

function getDailyTarget(planType, day) {
  const plan = PLANS[planType];
  if (!plan) return 0;
  for (const s of plan.schedule) {
    if (day >= s.from && day <= s.to) return s.target;
  }
  return 0;
}

// GET /api/warmup - list all warmup plans
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT wp.*, pn.number 
      FROM warmup_plans wp 
      LEFT JOIN phone_numbers pn ON pn.id = wp.phone_number_id 
      ORDER BY wp.created_at DESC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/warmup/plans - get plan definitions
router.get('/plans', (req, res) => {
  res.json({ plans: PLANS });
});

// POST /api/warmup - create warmup plan
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { phone_number_id, plan_type } = req.body;
    if (!phone_number_id || !plan_type) return res.status(400).json({ error: 'phone_number_id and plan_type required' });
    if (!PLANS[plan_type]) return res.status(400).json({ error: 'Invalid plan_type' });

    // Check if number already has active warmup
    const existing = db.prepare('SELECT id FROM warmup_plans WHERE phone_number_id = ? AND is_active = 1').get(phone_number_id);
    if (existing) return res.status(400).json({ error: 'Number already has an active warmup plan' });

    const plan = PLANS[plan_type];
    const dailyTarget = getDailyTarget(plan_type, 1);
    
    const result = db.prepare(
      'INSERT INTO warmup_plans (phone_number_id, plan_type, current_day, total_days, daily_target, is_active) VALUES (?, ?, 1, ?, ?, 1)'
    ).run(phone_number_id, plan_type, plan.totalDays, dailyTarget);

    res.json({ id: result.lastInsertRowid, message: 'Warmup plan created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/warmup/:id - cancel warmup
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE warmup_plans SET is_active = 0 WHERE id = ?').run(req.params.id);
    res.json({ message: 'Warmup plan cancelled' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/warmup/:id/advance - manually advance day (for testing)
router.post('/:id/advance', (req, res) => {
  try {
    const db = getDb();
    const plan = db.prepare('SELECT * FROM warmup_plans WHERE id = ?').get(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Not found' });
    
    const nextDay = plan.current_day + 1;
    if (nextDay > plan.total_days) {
      db.prepare('UPDATE warmup_plans SET is_active = 0, current_day = ? WHERE id = ?').run(nextDay, plan.id);
      return res.json({ message: 'Warmup complete', completed: true });
    }
    
    const newTarget = getDailyTarget(plan.plan_type, nextDay);
    db.prepare('UPDATE warmup_plans SET current_day = ?, daily_target = ?, daily_sent = 0 WHERE id = ?').run(nextDay, newTarget, plan.id);
    res.json({ message: 'Advanced to day ' + nextDay, day: nextDay, target: newTarget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.getDailyTarget = getDailyTarget;
module.exports.PLANS = PLANS;
