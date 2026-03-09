const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

// Dashboard stats
router.get('/dashboard', auth, (req, res) => {
  const db = getDb();
  const totalSent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='sent'").get().c;
  const totalFailed = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='failed'").get().c;
  const successRate = (totalSent + totalFailed) > 0 ? Math.round(100 * totalSent / (totalSent + totalFailed)) : 0;
  let unreadReplies = 0;
  try { unreadReplies = db.prepare("SELECT COUNT(*) as c FROM replies WHERE read=0").get().c; } catch(e) { /* column may not exist */ }
  res.json({
    totalNumbers: db.prepare('SELECT COUNT(*) as c FROM phone_numbers').get().c,
    activeNumbers: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status='active'").get().c,
    bannedNumbers: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status='banned'").get().c,
    totalCampaigns: db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c,
    activeCampaigns: db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status='running'").get().c,
    totalSent,
    totalFailed,
    successRate,
    totalPending: db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status='pending'").get().c,
    totalContacts: db.prepare('SELECT COUNT(*) as c FROM contacts').get().c,
    totalReplies: db.prepare('SELECT COUNT(*) as c FROM replies').get().c,
    unreadReplies,
    unreadAlerts: db.prepare('SELECT COUNT(*) as c FROM alerts WHERE read=0').get().c,
  });
});

// Per-number stats
router.get('/per-number', auth, (req, res) => {
  const db = getDb();
  const numbers = db.prepare(`
    SELECT pn.*, 
      (SELECT COUNT(*) FROM blast_queue bq WHERE bq.sender_number_id = pn.id AND bq.status='sent') as queue_sent,
      (SELECT COUNT(*) FROM blast_queue bq WHERE bq.sender_number_id = pn.id AND bq.status='failed') as queue_failed
    FROM phone_numbers pn ORDER BY pn.id
  `).all();
  res.json(numbers);
});

// Export CSV
router.get('/export', auth, (req, res) => {
  const db = getDb();
  const data = db.prepare(`
    SELECT bq.id, bq.campaign_id, bq.sender_number_id, bq.target_phone, bq.status, bq.sent_at, bq.error,
      c.name as campaign_name
    FROM blast_queue bq
    LEFT JOIN campaigns c ON c.id = bq.campaign_id
    ORDER BY bq.id
  `).all();

  if (req.query.format === 'csv' || req.query.type === 'numbers') {
    if (req.query.type === 'numbers') {
      const numbers = db.prepare(`
        SELECT number, total_sent, total_failed, health_score, status FROM phone_numbers ORDER BY id
      `).all();
      const header = 'number,total_sent,total_failed,health_score,status\n';
      const rows = numbers.map(r => `${r.number},${r.total_sent},${r.total_failed},${r.health_score},${r.status}`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=numbers-export.csv');
      return res.send(header + rows);
    }
    const header = 'id,campaign_id,campaign_name,sender_number_id,target_phone,status,sent_at,error\n';
    const rows = data.map(r => `${r.id},${r.campaign_id},${r.campaign_name||''},${r.sender_number_id},${r.target_phone},${r.status},${r.sent_at||''},${(r.error||'').replace(/,/g, ';')}`).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=export.csv');
    return res.send(header + rows);
  }
  res.json(data);
});

// Dashboard advanced stats
router.get('/dashboard/advanced', auth, (req, res) => {
  try {
    const db = getDb();
    const totalSent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('sent','delivered','read')").get().c;
    const totalDelivered = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('delivered','read')").get().c;
    const totalRead = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status = 'read'").get().c;
    const deliveredRate = totalSent > 0 ? Math.round(totalDelivered / totalSent * 10000) / 100 : 0;
    const readRate = totalSent > 0 ? Math.round(totalRead / totalSent * 10000) / 100 : 0;

    // Today vs yesterday
    const todaySent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE date(sent_at) = date('now') AND status IN ('sent','delivered','read')").get().c;
    const yesterdaySent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE date(sent_at) = date('now', '-1 day') AND status IN ('sent','delivered','read')").get().c;

    // Top performing campaign (highest read rate)
    const topCampaign = db.prepare(`
      SELECT c.name,
        SUM(CASE WHEN bq.status = 'read' THEN 1 ELSE 0 END) as reads,
        SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent
      FROM campaigns c JOIN blast_queue bq ON bq.campaign_id = c.id
      GROUP BY c.id HAVING sent > 0 ORDER BY (1.0 * reads / sent) DESC LIMIT 1
    `).get();
    const topCampaignData = topCampaign ? {
      name: topCampaign.name,
      readRate: Math.round(topCampaign.reads / topCampaign.sent * 10000) / 100
    } : null;

    // Number health
    const numberHealth = {
      healthy: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'active' AND health_score >= 70").get().c,
      warming: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'active' AND health_score < 70 AND health_score >= 40").get().c,
      cooldown: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE cooldown_until > datetime('now', 'localtime')").get().c,
      banned: db.prepare("SELECT COUNT(*) as c FROM phone_numbers WHERE status = 'banned'").get().c,
    };

    // Reply rate
    const totalReplies = db.prepare("SELECT COUNT(DISTINCT from_number) as c FROM replies").get().c;
    const replyRate = totalSent > 0 ? Math.round(totalReplies / totalSent * 10000) / 100 : 0;

    res.json({
      deliveredRate, readRate, todaySent, yesterdaySent,
      topCampaign: topCampaignData, numberHealth, replyRate, totalReplies
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
