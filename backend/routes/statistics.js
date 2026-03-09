const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

// GET /api/statistics/numbers
router.get('/numbers', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT number, total_sent, total_failed, health_score, status, created_at FROM phone_numbers ORDER BY id DESC`).all();
  res.json({ data: rows, total: rows.length });
});

// GET /api/statistics/campaigns
router.get('/campaigns', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.name, c.status,
      (SELECT COUNT(*) FROM blast_queue bq WHERE bq.campaign_id = c.id) as total_queued,
      (SELECT COUNT(*) FROM blast_queue bq WHERE bq.campaign_id = c.id AND bq.status='sent') as sent,
      (SELECT COUNT(*) FROM blast_queue bq WHERE bq.campaign_id = c.id AND bq.status='failed') as failed
    FROM campaigns c ORDER BY c.id DESC
  `).all();
  res.json({ data: rows, total: rows.length });
});

// GET /api/statistics/age-distribution
router.get('/age-distribution', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT 
      CASE 
        WHEN julianday('now') - julianday(created_at) < 7 THEN '< 1 week'
        WHEN julianday('now') - julianday(created_at) < 30 THEN '1-4 weeks'
        WHEN julianday('now') - julianday(created_at) < 90 THEN '1-3 months'
        ELSE '3+ months'
      END as age_group,
      COUNT(*) as count
    FROM phone_numbers GROUP BY age_group
  `).all();
  res.json({ data: rows, total: rows.length });
});

// GET /api/statistics/daily-chart
router.get('/daily-chart', auth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT date(sent_at) as date,
      SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed
    FROM blast_queue WHERE sent_at IS NOT NULL AND sent_at >= date('now', '-30 days')
    GROUP BY date(sent_at) ORDER BY date
  `).all();
  res.json({ data: rows, total: rows.length });
});

// GET /api/statistics/advanced
router.get('/advanced', auth, (req, res) => {
  try {
    const db = getDb();

    // Overall stats
    const totalSentAll = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('sent','delivered','read')").get().c;
    const totalDelivered = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('delivered','read')").get().c;
    const totalRead = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE status = 'read'").get().c;
    const totalClicks = db.prepare("SELECT COUNT(DISTINCT tl.contact_number) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id").get().c;
    const totalRepliers = db.prepare("SELECT COUNT(DISTINCT from_number) as c FROM replies").get().c;
    const deliveryRate = totalSentAll > 0 ? Math.round(totalDelivered / totalSentAll * 10000) / 100 : 0;
    const readRate = totalSentAll > 0 ? Math.round(totalRead / totalSentAll * 10000) / 100 : 0;
    const ctr = totalSentAll > 0 ? Math.round(totalClicks / totalSentAll * 10000) / 100 : 0;
    const replyRate = totalSentAll > 0 ? Math.round(totalRepliers / totalSentAll * 10000) / 100 : 0;

    // Campaign performance table
    const campaignPerf = db.prepare(`
      SELECT c.id, c.name, c.status,
        SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN bq.status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN bq.status = 'read' THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN bq.status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM campaigns c LEFT JOIN blast_queue bq ON bq.campaign_id = c.id
      GROUP BY c.id ORDER BY c.id DESC
    `).all();

    // Add CTR and reply count per campaign
    const campaignTable = campaignPerf.map(c => {
      const clicks = db.prepare("SELECT COUNT(DISTINCT tl.contact_number) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?").get(c.id).c;
      // Reply count: count replies from numbers that were in this campaign's blast queue
      const replies = db.prepare(`
        SELECT COUNT(DISTINCT r.from_number) as c FROM replies r
        WHERE r.from_number IN (SELECT target_phone FROM blast_queue WHERE campaign_id = ?)
      `).get(c.id).c;
      return {
        ...c,
        deliveredPct: c.sent > 0 ? Math.round(c.delivered / c.sent * 10000) / 100 : 0,
        readPct: c.sent > 0 ? Math.round(c.read_count / c.sent * 10000) / 100 : 0,
        ctrPct: c.sent > 0 ? Math.round(clicks / c.sent * 10000) / 100 : 0,
        replyPct: c.sent > 0 ? Math.round(replies / c.sent * 10000) / 100 : 0,
      };
    });

    // Best sending hours
    const bestHours = db.prepare(`
      SELECT CAST(strftime('%H', sent_at) AS INTEGER) as hour,
        SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count
      FROM blast_queue WHERE sent_at IS NOT NULL
      GROUP BY hour ORDER BY hour
    `).all().map(h => ({
      hour: h.hour,
      sent: h.sent,
      readRate: h.sent > 0 ? Math.round(h.read_count / h.sent * 10000) / 100 : 0
    }));

    // Number performance
    const numberPerf = db.prepare(`
      SELECT pn.id, pn.number, pn.status, pn.health_score,
        SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN bq.status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN bq.status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM phone_numbers pn LEFT JOIN blast_queue bq ON bq.sender_number_id = pn.id
      GROUP BY pn.id ORDER BY sent DESC
    `).all().map(n => ({
      ...n,
      deliveryRate: n.sent > 0 ? Math.round(n.delivered / n.sent * 10000) / 100 : 0,
    }));

    // Top contacts by engagement
    const topContacts = db.prepare(`
      SELECT bq.target_phone,
        COUNT(DISTINCT lc.id) as clicks,
        (SELECT COUNT(*) FROM replies r WHERE r.from_number = bq.target_phone) as replies
      FROM blast_queue bq
      LEFT JOIN tracked_links tl ON tl.blast_queue_id = bq.id
      LEFT JOIN link_clicks lc ON lc.tracked_link_id = tl.id
      GROUP BY bq.target_phone
      HAVING clicks > 0 OR replies > 0
      ORDER BY (clicks + replies) DESC LIMIT 20
    `).all();

    res.json({
      overall: { totalSent: totalSentAll, deliveryRate, readRate, ctr, replyRate },
      campaignTable,
      bestHours,
      numberPerf,
      topContacts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/statistics/best-time
router.get('/best-time', auth, (req, res) => {
  try {
    const db = getDb();
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const rows = db.prepare(`
      SELECT 
        CAST(strftime('%w', sent_at) AS INTEGER) as day,
        CAST(strftime('%H', sent_at) AS INTEGER) as hour,
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count
      FROM blast_queue 
      WHERE sent_at IS NOT NULL AND status != 'pending'
      GROUP BY day, hour
    `).all();

    // Get reply counts per hour/day
    const replyRows = db.prepare(`
      SELECT 
        CAST(strftime('%w', received_at) AS INTEGER) as day,
        CAST(strftime('%H', received_at) AS INTEGER) as hour,
        COUNT(*) as replies
      FROM replies
      GROUP BY day, hour
    `).all();
    const replyMap = {};
    replyRows.forEach(r => { replyMap[`${r.day}-${r.hour}`] = r.replies; });

    // Build heatmap: total sent per slot for rate calc
    const sentPerSlot = {};
    rows.forEach(r => { sentPerSlot[`${r.day}-${r.hour}`] = r.total; });

    const heatmap = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        const row = rows.find(r => r.day === day && r.hour === hour);
        const total = row ? row.total : 0;
        const delivered = row ? row.delivered : 0;
        const readCount = row ? row.read_count : 0;
        const replies = replyMap[key] || 0;
        
        const deliveryRate = total > 0 ? Math.round((delivered / total) * 10000) / 100 : 0;
        const readRate = total > 0 ? Math.round((readCount / total) * 10000) / 100 : 0;
        const replyRate = total > 0 ? Math.round((replies / total) * 10000) / 100 : 0;
        const score = total > 0 ? Math.round((deliveryRate * 0.3 + readRate * 0.4 + replyRate * 0.3) * 100) / 100 : 0;

        heatmap.push({ day, hour, deliveryRate, readRate, replyRate, score, total });
      }
    }

    // Top 5 best slots
    const top5 = [...heatmap].filter(h => h.total > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    // Best recommendation
    const best = top5[0];
    const recommendation = best && best.total > 0
      ? `Best time to send: ${dayNames[best.day]} ${String(best.hour).padStart(2,'0')}:00-${String(best.hour + 1).padStart(2,'0')}:00 WIB`
      : 'Not enough data for recommendation';

    res.json({ heatmap, top5, recommendation, dayNames });
  } catch (err) {
    console.error('Best time error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
