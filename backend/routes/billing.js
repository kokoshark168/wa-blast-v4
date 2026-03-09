const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const router = Router();

// Get billing plans
router.get('/plans', auth, (req, res) => {
  const plans = getDb().prepare('SELECT * FROM billing_plans ORDER BY monthly_price ASC').all();
  res.json(plans.map(p => ({ ...p, features: JSON.parse(p.features_json || '[]') })));
});

// Get tenant's own usage
router.get('/usage', auth, (req, res) => {
  const db = getDb();
  const tenantId = req.user.tenant_id;
  if (!tenantId) return res.json({ usage: [], subscription: null });

  // Current month usage
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const usage = db.prepare(`
    SELECT action, SUM(count) as total FROM usage_logs
    WHERE tenant_id = ? AND date >= ? GROUP BY action
  `).all(tenantId, monthStart);

  // Daily breakdown this month
  const daily = db.prepare(`
    SELECT date, action, SUM(count) as total FROM usage_logs
    WHERE tenant_id = ? AND date >= ? GROUP BY date, action ORDER BY date
  `).all(tenantId, monthStart);

  // Subscription
  const subscription = db.prepare(`
    SELECT ts.*, bp.name as plan_name, bp.monthly_price, bp.message_limit, bp.number_limit
    FROM tenant_subscriptions ts
    JOIN billing_plans bp ON bp.id = ts.plan_id
    WHERE ts.tenant_id = ? AND ts.status = 'active'
    ORDER BY ts.id DESC LIMIT 1
  `).get(tenantId);

  // Tenant limits
  const tenant = db.prepare('SELECT max_numbers, max_messages_per_day FROM tenants WHERE id = ?').get(tenantId);

  res.json({ usage, daily, subscription, tenant });
});

// Admin: billing overview
router.get('/admin', auth, adminOnly, (req, res) => {
  const db = getDb();
  const monthStart = new Date().toISOString().slice(0, 7) + '-01';

  const tenantUsage = db.prepare(`
    SELECT t.id, t.name, t.email,
      COALESCE(SUM(CASE WHEN ul.action = 'message_sent' THEN ul.count ELSE 0 END), 0) as messages_sent,
      COALESCE(SUM(CASE WHEN ul.action = 'message_delivered' THEN ul.count ELSE 0 END), 0) as messages_delivered,
      COALESCE(SUM(CASE WHEN ul.action = 'api_call' THEN ul.count ELSE 0 END), 0) as api_calls
    FROM tenants t
    LEFT JOIN usage_logs ul ON ul.tenant_id = t.id AND ul.date >= ?
    GROUP BY t.id ORDER BY messages_sent DESC
  `).all(monthStart);

  const subscriptions = db.prepare(`
    SELECT ts.tenant_id, bp.name as plan_name, bp.monthly_price, ts.status
    FROM tenant_subscriptions ts
    JOIN billing_plans bp ON bp.id = ts.plan_id
    WHERE ts.status = 'active'
  `).all();

  const totalRevenue = subscriptions.reduce((sum, s) => sum + (s.monthly_price || 0), 0);

  res.json({ tenantUsage, subscriptions, totalRevenue });
});

// Subscribe tenant to plan
router.post('/subscribe', auth, (req, res) => {
  const { plan_id } = req.body;
  const tenantId = req.user.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'No tenant associated' });
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });

  const db = getDb();
  const plan = db.prepare('SELECT * FROM billing_plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Deactivate old subscription
  db.prepare("UPDATE tenant_subscriptions SET status = 'cancelled' WHERE tenant_id = ? AND status = 'active'").run(tenantId);

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  db.prepare(`INSERT INTO tenant_subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
    VALUES (?, ?, 'active', ?, ?)`).run(tenantId, plan_id, now.toISOString().slice(0, 10), periodEnd.toISOString().slice(0, 10));

  // Update tenant limits from plan
  db.prepare('UPDATE tenants SET max_numbers = ?, max_messages_per_day = ? WHERE id = ?').run(plan.number_limit, plan.message_limit, tenantId);

  res.json({ success: true, plan: plan.name });
});

module.exports = router;
