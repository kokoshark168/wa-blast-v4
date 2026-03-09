require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { getDb, cleanupExpiredRecords } = require('./db/init');
const rateLimit = require('express-rate-limit');

const { initWebSocket, shutdown: shutdownWs } = require('./utils/wsServer');

const app = express();
const PORT = process.env.PORT || 3001;
const PID_FILE = path.join(__dirname, 'server.pid');

// === Double Instance Prevention ===
function checkPidFile() {
  if (fs.existsSync(PID_FILE)) {
    const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    try {
      process.kill(oldPid, 0); // Check if process exists
      console.error(`❌ Another instance is already running (PID ${oldPid}). Exiting.`);
      process.exit(1);
    } catch (e) {
      // Process doesn't exist, stale PID file
      console.log(`⚠️ Removing stale PID file (PID ${oldPid})`);
    }
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`❌ Port ${port} is already in use. Exiting.`));
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close();
      resolve();
    });
    server.listen(port);
  });
}

function writePidFile() {
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function removePidFile() {
  try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
}

// === Graceful Shutdown ===
let server;
function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  removePidFile();
  try {
    const db = getDb();
    db.close();
    console.log('✅ Database connection closed');
  } catch (e) { /* ignore */ }
  try {
    waEngine.shutdown();
    breedingWorker.shutdown();
    stopScheduler();
    stopDripWorker();
    shutdownWs();
    console.log('✅ WA Engine shut down');
  } catch (e) { /* ignore */ }
  if (server) {
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
    // Force exit after 5s
    setTimeout(() => process.exit(1), 5000);
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  shutdown('uncaughtException');
});

// === Rate Limiting ===
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many OTP requests, please try again later' }
});

// === Trust Proxy (behind Nginx) ===
app.set('trust proxy', 1);

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/', generalLimiter);
app.use('/api/auth/request-otp', otpLimiter);

// Init DB on start
getDb();
console.log('✅ Database initialized');

// Init WA Engine
const waEngine = require('./engine/index');
const breedingWorker = require('./engine/breeding');
const { startScheduler, stopScheduler } = require('./engine/scheduler');
const { startDripWorker, stopDripWorker } = require('./engine/dripWorker');

// Public redirect route (no auth) — must be before API routes
app.get('/go/:shortCode', (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM tracked_links WHERE short_code = ?').get(req.params.shortCode);
    if (!link) return res.status(404).send('Link not found');
    db.prepare("INSERT INTO link_clicks (tracked_link_id, clicked_at, user_agent, ip_address, referer) VALUES (?, datetime('now', 'localtime'), ?, ?, ?)").run(
      link.id,
      req.headers['user-agent'] || null,
      req.ip || req.headers['x-forwarded-for'] || null,
      req.headers['referer'] || null
    );
    // Update domain click stats
    if (link.domain_id) {
      db.prepare('UPDATE shortlink_domains SET total_clicks = total_clicks + 1 WHERE id = ?').run(link.domain_id);
    }
    res.redirect(302, link.original_url);
  } catch (err) {
    console.error('Redirect error:', err.message);
    res.status(500).send('Server error');
  }
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/phone-numbers', require('./routes/phoneNumbers'));
app.use('/api/phone-groups', require('./routes/phoneGroups'));
app.use('/api/proxies', require('./routes/proxies'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/campaigns', require('./routes/campaigns'));
app.use('/api/contact-lists', require('./routes/contactLists'));
app.use('/api/breeding', require('./routes/breeding'));
app.use('/api/blast-queue', require('./routes/blastQueue'));
app.use('/api/replies', require('./routes/replies'));
app.use('/api/blacklist', require('./routes/blacklist'));
app.use('/api/media', require('./routes/media'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/audit-log', require('./routes/auditLog'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/api-keys', require('./routes/apiKeys'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/statistics', require('./routes/statistics'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/links', require('./routes/links'));
app.use('/api/tracked-links', require('./routes/trackedLinks'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/auto-replies', require('./routes/autoReplies'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ab-tests', require('./routes/abTests'));
app.use('/api/drip-sequences', require('./routes/dripSequences'));
app.use('/api/segments', require('./routes/segments'));
app.use('/api/warmup', require('./routes/warmup'));
app.use('/api/tenants', require('./routes/tenants'));
app.use('/api/billing', require('./routes/billing'));

// Public API with API Key auth
const apiKeyAuth = require('./middleware/apiKeyAuth');
app.post('/api/public/send-message', apiKeyAuth('send_message'), (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
  res.json({ success: true, message: 'Message queued (API endpoint - connect to WA engine for actual sending)' });
});

// API Docs
app.get('/api/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>WA Blast API Docs</title>
<style>body{font-family:system-ui;max-width:900px;margin:40px auto;padding:0 20px;background:#0a0a0a;color:#e5e5e5}
h1{color:#3b82f6}h2{color:#60a5fa;border-bottom:1px solid #333;padding-bottom:8px}
.endpoint{background:#111;border:1px solid #333;border-radius:8px;padding:16px;margin:12px 0}
.method{display:inline-block;padding:2px 8px;border-radius:4px;font-weight:bold;font-size:13px;margin-right:8px}
.get{background:#22c55e20;color:#22c55e}.post{background:#3b82f620;color:#3b82f6}.delete{background:#ef444420;color:#ef4444}.patch{background:#f59e0b20;color:#f59e0b}
code{background:#1a1a2e;padding:2px 6px;border-radius:4px;font-size:13px}
pre{background:#1a1a2e;padding:12px;border-radius:6px;overflow-x:auto}</style></head>
<body><h1>🚀 WA Blast Backoffice API</h1>
<p>Authenticate with <code>X-API-Key: wab_your_key_here</code> header for public endpoints, or <code>Authorization: Bearer &lt;jwt&gt;</code> for authenticated endpoints.</p>
<h2>Public API (API Key)</h2>
<div class="endpoint"><span class="method post">POST</span><code>/api/public/send-message</code><br>Send a message. Body: <code>{"phone": "+62xxx", "message": "Hello"}</code></div>
<h2>Authentication</h2>
<div class="endpoint"><span class="method post">POST</span><code>/api/auth/request-otp</code><br>Request OTP. Body: <code>{"email": "user@example.com"}</code></div>
<div class="endpoint"><span class="method post">POST</span><code>/api/auth/verify-otp</code><br>Verify OTP. Body: <code>{"email": "user@example.com", "code": "123456"}</code></div>
<h2>Campaigns</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns</code> — List campaigns</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/campaigns</code> — Create campaign</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/campaigns/:id/launch</code> — Launch campaign</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns/:id/report</code> — Campaign report</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns/:id/timeline</code> — Delivery timeline (hourly)</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns/:id/responses-analysis</code> — Response word analysis</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns/:id/geo</code> — Geographic/carrier distribution</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/campaigns/compare?ids=1,2,3</code> — Compare campaigns</div>
<h2>Contacts</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/contact-lists</code> — List contact lists</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/contact-lists</code> — Create contact list</div>
<h2>Templates</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/templates</code> — List templates</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/templates</code> — Create template</div>
<h2>Phone Numbers</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/phone-numbers</code> — List phone numbers</div>
<h2>Webhooks</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/webhooks/endpoints</code> — List webhook endpoints</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/webhooks/endpoints</code> — Create webhook</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/webhooks/endpoints/:id/test</code> — Test webhook</div>
<h2>Billing</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/billing/plans</code> — List billing plans</div>
<div class="endpoint"><span class="method get">GET</span><code>/api/billing/usage</code> — Current usage</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/billing/subscribe</code> — Subscribe to plan</div>
<h2>Tenants (Admin)</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/tenants</code> — List tenants</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/tenants</code> — Create tenant</div>
<div class="endpoint"><span class="method patch">PATCH</span><code>/api/tenants/:id</code> — Update tenant</div>
<div class="endpoint"><span class="method delete">DELETE</span><code>/api/tenants/:id</code> — Delete tenant</div>
<h2>API Keys</h2>
<div class="endpoint"><span class="method get">GET</span><code>/api/api-keys</code> — List API keys</div>
<div class="endpoint"><span class="method post">POST</span><code>/api/api-keys</code> — Generate new key</div>
<div class="endpoint"><span class="method delete">DELETE</span><code>/api/api-keys/:id</code> — Revoke key</div>
</body></html>`);
});

// Health check
app.get('/api/health', async (req, res) => {
  const timestamp = new Date().toISOString();
  try {
    const mem = process.memoryUsage();
    const dbPath = process.env.DB_PATH || './data/wa-blast.db';
    const dbStats = fs.statSync(dbPath);
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) AS cnt FROM phone_numbers WHERE status = 'active'").get();
    const pkg = require('../package.json');

    res.json({
      status: 'ok',
      timestamp,
      uptime: Math.round(process.uptime()),
      memory: {
        rssMB: +(mem.rss / 1024 / 1024).toFixed(1),
        heapUsedMB: +(mem.heapUsed / 1024 / 1024).toFixed(1),
      },
      connectedNumbers: row.cnt,
      dbSizeMB: +(dbStats.size / 1024 / 1024).toFixed(1),
      version: pkg.version,
      nodeVersion: process.version,
    });
  } catch (e) {
    res.json({ status: 'ok', timestamp, error: e.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err.stack || err.message || err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error'
  });
});

// === Startup ===
async function start() {
  checkPidFile();
  try {
    await checkPortAvailable(PORT);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  writePidFile();
  server = app.listen(PORT, () => {
    console.log(`🚀 WA Backoffice Backend running on port ${PORT} (PID ${process.pid})`);
    // Init WebSocket
    initWebSocket(server);
    // Init WA Engine — reconnect previously active sessions
    waEngine.init().catch(err => console.error('❌ WAEngine init error:', err.message));
    // Start campaign scheduler
    startScheduler();
    // Start drip campaign worker
    startDripWorker();
    // Auto-resume active breeding sessions
    setTimeout(() => {
      try {
        const db = getDb();
        const activeSessions = db.prepare("SELECT id, name FROM breeding_sessions WHERE status = 'active'").all();
        for (const s of activeSessions) {
          console.log(`🐣 Auto-resuming breeding session #${s.id} "${s.name}"`);
          breedingWorker.startBreeding(s.id).catch(err => console.error(`❌ Breeding #${s.id} resume error:`, err.message));
        }
      } catch (e) { console.error("❌ Breeding auto-resume error:", e.message); }
    }, 15000); // Wait 15s for WA connections to establish
    // Auto-resume running campaigns with pending items
    setTimeout(() => {
      try {
        const db = getDb();
        const running = db.prepare("SELECT DISTINCT c.id, c.name FROM campaigns c JOIN blast_queue bq ON bq.campaign_id = c.id WHERE c.status = 'running' AND bq.status = 'pending'").all();
        for (const c of running) {
          console.log('🔄 Auto-resuming campaign #' + c.id + ' "' + c.name + '"');
          waEngine.sendBulk(c.id).then(stats => {
            console.log('✅ Campaign #' + c.id + ' auto-resume complete:', stats);
          }).catch(err => {
            console.error('❌ Campaign #' + c.id + ' auto-resume error:', err.message);
          });
        }
      } catch (e) { console.error('❌ Campaign auto-resume error:', e.message); }
    }, 20000); // Wait 20s for WA connections

    // Start warmup worker
    try { require('./engine/warmupWorker').startWarmupWorker(); } catch(e) { console.error('Warmup worker error:', e.message); }
    // Cleanup expired OTPs and sessions on startup, then every 6 hours
    cleanupExpiredRecords();
    setInterval(cleanupExpiredRecords, 6 * 60 * 60 * 1000);
  });
}

start();
