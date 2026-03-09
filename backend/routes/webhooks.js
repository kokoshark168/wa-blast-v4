const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const crypto = require('crypto');
const router = Router();

// Webhook for incoming replies (legacy, from n8n)
const { isValidPhone } = require('../utils/validate');
router.post('/reply', (req, res) => {
  const from_number = req.body.from_number || req.body.from;
  const to_number = req.body.to_number || req.body.to;
  const message = req.body.message;
  if (!from_number || !to_number) return res.status(400).json({ error: 'from/from_number and to/to_number required' });
  if (!isValidPhone(from_number) || !isValidPhone(to_number)) return res.status(400).json({ error: 'Invalid phone number format' });
  const db = getDb();
  db.prepare('INSERT INTO replies (from_number, to_number, message) VALUES (?, ?, ?)').run(from_number, to_number, message || '');
  db.prepare('INSERT INTO alerts (type, message) VALUES (?, ?)').run('reply', `New reply from ${from_number}`);
  res.json({ success: true });
});

// === Webhook Endpoints CRUD ===

// List webhook endpoints
router.get('/endpoints', auth, (req, res) => {
  const db = getDb();
  const endpoints = db.prepare('SELECT * FROM webhook_endpoints ORDER BY id DESC').all();
  res.json(endpoints.map(e => ({ ...e, events: JSON.parse(e.events_json || '[]') })));
});

// Create webhook endpoint
router.post('/endpoints', auth, auditLog('webhooks.create'), (req, res) => {
  const { url, events, is_active } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  const db = getDb();
  const secret = crypto.randomBytes(32).toString('hex');
  const result = db.prepare(
    'INSERT INTO webhook_endpoints (tenant_id, url, events_json, secret, is_active) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.tenant_id || null, url, JSON.stringify(events || []), secret, is_active !== undefined ? is_active : 1);
  const wh = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ...wh, events: JSON.parse(wh.events_json || '[]'), secret });
});

// Update webhook endpoint
router.patch('/endpoints/:id', auth, auditLog('webhooks.update'), (req, res) => {
  const { url, events, is_active } = req.body;
  const db = getDb();
  const wh = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Not found' });
  db.prepare(`UPDATE webhook_endpoints SET
    url = COALESCE(?, url),
    events_json = COALESCE(?, events_json),
    is_active = COALESCE(?, is_active)
    WHERE id = ?`).run(url, events ? JSON.stringify(events) : null, is_active, req.params.id);
  res.json({ success: true });
});

// Delete webhook endpoint
router.delete('/endpoints/:id', auth, auditLog('webhooks.delete'), (req, res) => {
  const result = getDb().prepare('DELETE FROM webhook_endpoints WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// Test webhook
router.post('/endpoints/:id/test', auth, (req, res) => {
  const db = getDb();
  const wh = db.prepare('SELECT * FROM webhook_endpoints WHERE id = ?').get(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Not found' });

  const testPayload = {
    event: 'test',
    timestamp: new Date().toISOString(),
    data: { message: 'This is a test webhook delivery' }
  };

  deliverWebhook(wh, 'test', testPayload).then(result => {
    res.json(result);
  }).catch(err => {
    res.json({ success: false, error: err.message });
  });
});

// Get delivery log
router.get('/endpoints/:id/deliveries', auth, (req, res) => {
  const deliveries = getDb().prepare(
    'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY id DESC LIMIT 50'
  ).all(req.params.id);
  res.json(deliveries);
});

// === Webhook Delivery Engine ===
async function deliverWebhook(webhook, event, payload) {
  const db = getDb();
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhook.secret || '').update(body).digest('hex');

  let lastError = null;
  let responseStatus = null;
  let responseBody = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const resp = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      responseStatus = resp.status;
      responseBody = await resp.text().catch(() => '');

      if (resp.ok) {
        db.prepare('INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, attempts, success) VALUES (?,?,?,?,?,?,1)')
          .run(webhook.id, event, body, responseStatus, responseBody.slice(0, 1000), attempt);
        return { success: true, status: responseStatus, attempts: attempt };
      }
      lastError = `HTTP ${responseStatus}`;
    } catch (err) {
      lastError = err.message;
    }

    // Exponential backoff
    if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000));
  }

  db.prepare('INSERT INTO webhook_deliveries (webhook_id, event, payload, response_status, response_body, attempts, success) VALUES (?,?,?,?,?,?,0)')
    .run(webhook.id, event, body, responseStatus, (responseBody || lastError || '').slice(0, 1000), 3);
  return { success: false, error: lastError, attempts: 3 };
}

// Export the delivery function for use by other modules
router.deliverWebhook = deliverWebhook;

// Fire webhooks for an event
async function fireWebhooks(event, payload, tenantId) {
  const db = getDb();
  let webhooks;
  if (tenantId) {
    webhooks = db.prepare("SELECT * FROM webhook_endpoints WHERE is_active = 1 AND tenant_id = ?").all(tenantId);
  } else {
    webhooks = db.prepare("SELECT * FROM webhook_endpoints WHERE is_active = 1").all();
  }

  for (const wh of webhooks) {
    const events = JSON.parse(wh.events_json || '[]');
    if (events.length === 0 || events.includes(event)) {
      deliverWebhook(wh, event, { event, timestamp: new Date().toISOString(), data: payload }).catch(() => {});
    }
  }
}

router.fireWebhooks = fireWebhooks;

module.exports = router;
