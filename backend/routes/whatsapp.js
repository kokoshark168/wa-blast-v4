const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const engine = require('../engine/index');
const router = Router();

// GET /sessions
router.get('/sessions', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM phone_numbers ORDER BY id DESC').all();
  // Enrich with live engine status
  const data = rows.map(r => ({
    ...r,
    wa_status: engine.getStatus(r.id),
    has_session: engine.sessions.has(r.id),
  }));
  res.json({ data, total: data.length });
});

// POST /connect/:id — start Baileys session, return QR
router.post('/connect/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Check if already active
    const currentStatus = engine.getStatus(Number(req.params.id));
    if (currentStatus === 'active') {
      return res.json({ status: 'active', qr: null, message: 'Already connected' });
    }

    // Start connect in background, respond immediately
    engine.connect(Number(req.params.id), true).catch(err => {
      console.log('WAEngine connect error #' + req.params.id + ': ' + err.message);
    });

    // Wait briefly for QR (max 3s)
    let qr = null;
    for (let i = 0; i < 6; i++) {
      qr = engine.getQR(Number(req.params.id));
      if (qr) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const status = engine.getStatus(Number(req.params.id));
    res.json({ status, qr, message: qr ? 'Scan QR code' : 'Connecting...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /qr/:id — return current QR string for frontend
router.get('/qr/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const qr = engine.getQR(id);
  const status = engine.getStatus(id);
  res.json({ qr, status });
});

// POST /disconnect/:id
router.post('/disconnect/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    await engine.disconnect(Number(req.params.id));
    res.json({ message: 'Disconnected', status: 'inactive' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /reconnect/:id
router.post('/reconnect/:id', auth, async (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });

    await engine.reconnect(Number(req.params.id));

    let qr = null;
    for (let i = 0; i < 10; i++) {
      qr = engine.getQR(Number(req.params.id));
      if (qr) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const status = engine.getStatus(Number(req.params.id));
    res.json({ status, qr, message: 'Reconnecting' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /report-ban/:id
router.post('/report-ban/:id', auth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  engine.disconnect(Number(req.params.id)).catch(() => {});
  db.prepare("UPDATE phone_numbers SET status = 'banned', ban_count = ban_count + 1 WHERE id = ?").run(req.params.id);
  res.json(db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(req.params.id));
});

// POST /send — send a single message (utility endpoint)
router.post('/send', auth, async (req, res) => {
  const { phoneNumberId, targetPhone, message, media } = req.body;
  if (!phoneNumberId || !targetPhone || !message) {
    return res.status(400).json({ error: 'phoneNumberId, targetPhone, and message are required' });
  }
  const result = await engine.sendMessage(phoneNumberId, targetPhone, message, media);
  res.json(result);
});


// POST /force-connect-all — force reconnect all non-banned numbers
router.post('/force-connect-all', auth, async (req, res) => {
  try {
    const db = require('better-sqlite3')('/opt/app/backend/db/database.sqlite');
    const numbers = db.prepare("SELECT id, number, status FROM phone_numbers WHERE status != 'banned'").all();
    const results = [];
    
    for (const num of numbers) {
      try {
        // Disconnect first if exists
        try { await engine.disconnect(num.id); } catch(e) {}
        // Small delay between connects
        await new Promise(r => setTimeout(r, 2000));
        // Connect
        await engine.connect(num.id);
        results.push({ id: num.id, number: num.number, action: 'connecting' });
      } catch (e) {
        results.push({ id: num.id, number: num.number, action: 'error', error: e.message });
      }
    }
    
    res.json({ message: `Force connecting ${results.length} numbers`, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
