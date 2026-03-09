const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

router.get('/', auth, (req, res) => {
  const db = getDb();
  const { campaign_id, status } = req.query;
  let sql = 'SELECT * FROM blast_queue WHERE 1=1';
  const params = [];
  if (campaign_id) { sql += ' AND campaign_id = ?'; params.push(campaign_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, total: rows.length });
});

router.get('/stats', auth, (req, res) => {
  const db = getDb();
  const pending = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='pending'").get().c;
  const sent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='sent'").get().c;
  const failed = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='failed'").get().c;
  res.json({ pending, sent, failed, total: pending + sent + failed });
});

router.post('/process-batch', auth, (req, res) => {
  const db = getDb();
  const batchSize = req.body.batch_size || 10;
  const pending = db.prepare("SELECT * FROM blast_queue WHERE status='pending' ORDER BY id LIMIT ?").all(batchSize);
  if (!pending.length) return res.json({ processed: 0, message: 'No pending messages' });
  const stmt = db.prepare("UPDATE blast_queue SET status = 'sent', sent_at = datetime('now', 'localtime') WHERE id = ?");
  const tx = db.transaction(() => {
    for (const item of pending) {
      stmt.run(item.id);
    }
  });
  tx();
  res.json({ processed: pending.length });
});

module.exports = router;
