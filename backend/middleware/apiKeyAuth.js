const crypto = require('crypto');
const { getDb } = require('../db/init');

// Rate limit tracking (in-memory)
const rateLimitMap = new Map();

function apiKeyAuth(requiredPermission) {
  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'X-API-Key header required' });

    const db = getDb();
    // Find key by exact match (we store plaintext in `key` column)
    const keyRow = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1').get(apiKey);
    if (!keyRow) return res.status(401).json({ error: 'Invalid or inactive API key' });

    // Check permission
    const permissions = JSON.parse(keyRow.permissions_json || '[]');
    if (requiredPermission && !permissions.includes(requiredPermission)) {
      return res.status(403).json({ error: `Permission '${requiredPermission}' required` });
    }

    // Rate limiting
    const now = Date.now();
    const windowMs = 60000;
    const key = `apikey_${keyRow.id}`;
    if (!rateLimitMap.has(key)) rateLimitMap.set(key, { count: 0, resetAt: now + windowMs });
    const rl = rateLimitMap.get(key);
    if (now > rl.resetAt) { rl.count = 0; rl.resetAt = now + windowMs; }
    rl.count++;
    if (rl.count > (keyRow.rate_limit || 100)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Update last used
    db.prepare(`UPDATE api_keys SET last_used = datetime(now, localtime), last_used_at = datetime(now, localtime) WHERE id = ?`).run(keyRow.id);

    // Log API call usage
    const today = new Date().toISOString().slice(0, 10);
    try {
      const existing = db.prepare("SELECT id, count FROM usage_logs WHERE tenant_id = ? AND action = 'api_call' AND date = ?").get(keyRow.tenant_id, today);
      if (existing) {
        db.prepare("UPDATE usage_logs SET count = count + 1 WHERE id = ?").run(existing.id);
      } else if (keyRow.tenant_id) {
        db.prepare("INSERT INTO usage_logs (tenant_id, action, count, date) VALUES (?, 'api_call', 1, ?)").run(keyRow.tenant_id, today);
      }
    } catch (e) {}

    // Set tenant context
    req.apiKey = keyRow;
    req.tenantId = keyRow.tenant_id;
    next();
  };
}

module.exports = apiKeyAuth;
