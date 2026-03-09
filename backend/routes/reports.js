const express = require('express');
const router = express.Router();
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');

router.use(auth);

// GET /api/reports/summary?from=DATE&to=DATE
router.get('/summary', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const fromDate = from + ' 00:00:00';
    const toDate = to + ' 23:59:59';

    const q = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM blast_queue
      WHERE COALESCE(created_at, sent_at) BETWEEN ? AND ?
    `).get(fromDate, toDate);

    const replies = db.prepare(`
      SELECT COUNT(*) as count FROM replies WHERE received_at BETWEEN ? AND ?
    `).get(fromDate, toDate);

    const clicks = db.prepare(`
      SELECT COUNT(*) as count FROM link_clicks WHERE clicked_at BETWEEN ? AND ?
    `).get(fromDate, toDate);

    const sent = q.sent || 0;
    const delivered = q.delivered || 0;
    const readCount = q.read_count || 0;

    res.json({
      total: q.total || 0,
      sent,
      delivered,
      read: readCount,
      failed: q.failed || 0,
      skipped: q.skipped || 0,
      replies: replies.count || 0,
      clicks: clicks.count || 0,
      deliveryRate: sent > 0 ? Math.round((delivered / sent) * 10000) / 100 : 0,
      readRate: sent > 0 ? Math.round((readCount / sent) * 10000) / 100 : 0,
      ctr: sent > 0 ? Math.round((clicks.count / sent) * 10000) / 100 : 0,
    });
  } catch (err) {
    console.error('Reports summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/campaigns?from=DATE&to=DATE
router.get('/campaigns', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const fromDate = from + ' 00:00:00';
    const toDate = to + ' 23:59:59';

    const rows = db.prepare(`
      SELECT
        c.id,
        c.name,
        c.status as campaign_status,
        COUNT(bq.id) as total,
        SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN bq.status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN bq.status = 'read' THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN bq.status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM blast_queue bq
      LEFT JOIN campaigns c ON c.id = bq.campaign_id
      WHERE COALESCE(bq.created_at, bq.sent_at) BETWEEN ? AND ?
      GROUP BY bq.campaign_id
      ORDER BY sent DESC
    `).all(fromDate, toDate);

    // Get click counts per campaign
    const clickRows = db.prepare(`
      SELECT tl.campaign_id, COUNT(lc.id) as clicks
      FROM link_clicks lc
      JOIN tracked_links tl ON tl.id = lc.tracked_link_id
      WHERE lc.clicked_at BETWEEN ? AND ?
      GROUP BY tl.campaign_id
    `).all(fromDate, toDate);
    const clickMap = {};
    clickRows.forEach(r => clickMap[r.campaign_id] = r.clicks);

    const data = rows.map(r => ({
      id: r.id,
      name: r.name || `Campaign #${r.id}`,
      status: r.campaign_status,
      total: r.total,
      sent: r.sent,
      delivered: r.delivered,
      read: r.read_count,
      failed: r.failed,
      clicks: clickMap[r.id] || 0,
      deliveryRate: r.sent > 0 ? Math.round((r.delivered / r.sent) * 10000) / 100 : 0,
      readRate: r.sent > 0 ? Math.round((r.read_count / r.sent) * 10000) / 100 : 0,
      ctr: r.sent > 0 ? Math.round(((clickMap[r.id] || 0) / r.sent) * 10000) / 100 : 0,
    }));

    res.json(data);
  } catch (err) {
    console.error('Reports campaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/numbers?from=DATE&to=DATE
router.get('/numbers', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const fromDate = from + ' 00:00:00';
    const toDate = to + ' 23:59:59';

    const rows = db.prepare(`
      SELECT
        pn.id,
        pn.number,
        pn.status as phone_status,
        pn.ban_count,
        COUNT(bq.id) as total,
        SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN bq.status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN bq.status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM blast_queue bq
      LEFT JOIN phone_numbers pn ON pn.id = bq.sender_number_id
      WHERE COALESCE(bq.created_at, bq.sent_at) BETWEEN ? AND ?
      GROUP BY bq.sender_number_id
      ORDER BY sent DESC
    `).all(fromDate, toDate);

    const data = rows.map(r => ({
      id: r.id,
      number: r.number || 'Unknown',
      status: r.phone_status,
      banCount: r.ban_count || 0,
      total: r.total,
      sent: r.sent,
      delivered: r.delivered,
      failed: r.failed,
      deliveryRate: r.sent > 0 ? Math.round((r.delivered / r.sent) * 10000) / 100 : 0,
      health: r.sent > 0 ? (r.failed / r.sent < 0.05 ? 'good' : r.failed / r.sent < 0.15 ? 'warning' : 'critical') : 'unknown',
    }));

    res.json(data);
  } catch (err) {
    console.error('Reports numbers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/daily?from=DATE&to=DATE
router.get('/daily', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const rows = db.prepare(`
      SELECT
        DATE(COALESCE(created_at, sent_at)) as date,
        SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status IN ('delivered','read') THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM blast_queue
      WHERE COALESCE(created_at, sent_at) BETWEEN ? AND ?
      GROUP BY DATE(COALESCE(created_at, sent_at))
      ORDER BY date
    `).all(from + ' 00:00:00', to + ' 23:59:59');

    res.json(rows.map(r => ({ ...r, read: r.read_count })));
  } catch (err) {
    console.error('Reports daily error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/hours?from=DATE&to=DATE
router.get('/hours', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const rows = db.prepare(`
      SELECT
        CAST(strftime('%H', sent_at) AS INTEGER) as hour,
        SUM(CASE WHEN status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count
      FROM blast_queue
      WHERE sent_at IS NOT NULL AND COALESCE(created_at, sent_at) BETWEEN ? AND ?
      GROUP BY hour
      ORDER BY hour
    `).all(from + ' 00:00:00', to + ' 23:59:59');

    res.json(rows.map(r => ({
      hour: r.hour,
      sent: r.sent,
      read: r.read_count,
      readRate: r.sent > 0 ? Math.round((r.read_count / r.sent) * 10000) / 100 : 0,
    })));
  } catch (err) {
    console.error('Reports hours error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/errors?from=DATE&to=DATE
router.get('/errors', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const rows = db.prepare(`
      SELECT
        COALESCE(error, 'Unknown error') as reason,
        COUNT(*) as count
      FROM blast_queue
      WHERE status = 'failed' AND COALESCE(created_at, sent_at) BETWEEN ? AND ?
      GROUP BY error
      ORDER BY count DESC
      LIMIT 20
    `).all(from + ' 00:00:00', to + ' 23:59:59');

    res.json(rows);
  } catch (err) {
    console.error('Reports errors error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/export?from=DATE&to=DATE&format=csv
router.get('/export', (req, res) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to required' });

    const fromDate = from + ' 00:00:00';
    const toDate = to + ' 23:59:59';

    const rows = db.prepare(`
      SELECT
        bq.id,
        c.name as campaign_name,
        pn.number as sender_number,
        bq.target_phone,
        bq.status,
        bq.sent_at,
        bq.delivered_at,
        bq.read_at,
        bq.error,
        bq.created_at
      FROM blast_queue bq
      LEFT JOIN campaigns c ON c.id = bq.campaign_id
      LEFT JOIN phone_numbers pn ON pn.id = bq.sender_number_id
      WHERE COALESCE(bq.created_at, bq.sent_at) BETWEEN ? AND ?
      ORDER BY COALESCE(bq.created_at, bq.sent_at) DESC
    `).all(fromDate, toDate);

    const headers = ['ID', 'Campaign', 'Sender', 'Target', 'Status', 'Sent At', 'Delivered At', 'Read At', 'Error', 'Created At'];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
      csvRows.push([
        r.id,
        `"${(r.campaign_name || '').replace(/"/g, '""')}"`,
        r.sender_number || '',
        r.target_phone || '',
        r.status,
        r.sent_at || '',
        r.delivered_at || '',
        r.read_at || '',
        `"${(r.error || '').replace(/"/g, '""')}"`,
        r.created_at || ''
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=report_${from}_${to}.csv`);
    res.send(csvRows.join('\n'));
  } catch (err) {
    console.error('Reports export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/funnel?campaign_id=X
router.get('/funnel', (req, res) => {
  try {
    const db = getDb();
    const { campaign_id } = req.query;
    
    let whereClause = '';
    let params = [];
    if (campaign_id) {
      whereClause = 'WHERE bq.campaign_id = ?';
      params = [campaign_id];
    }

    const cond = campaign_id ? 'AND campaign_id = ?' : '';
    const cp = campaign_id ? [campaign_id] : [];

    const sentCount = db.prepare(`SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('sent','delivered','read') ${cond}`).get(...cp).c;
    const deliveredCount = db.prepare(`SELECT COUNT(*) as c FROM blast_queue WHERE status IN ('delivered','read') ${cond}`).get(...cp).c;
    const readCount = db.prepare(`SELECT COUNT(*) as c FROM blast_queue WHERE status = 'read' ${cond}`).get(...cp).c;
    
    // Clicks
    let clickCount = 0;
    if (campaign_id) {
      clickCount = db.prepare(`SELECT COUNT(DISTINCT lc.id) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?`).get(campaign_id).c;
    } else {
      clickCount = db.prepare(`SELECT COUNT(*) as c FROM link_clicks`).get().c;
    }

    // Replies
    let replyCount = 0;
    if (campaign_id) {
      replyCount = db.prepare(`SELECT COUNT(DISTINCT r.from_number) as c FROM replies r WHERE r.from_number IN (SELECT target_phone FROM blast_queue WHERE campaign_id = ?)`).get(campaign_id).c;
    } else {
      replyCount = db.prepare(`SELECT COUNT(DISTINCT from_number) as c FROM replies`).get().c;
    }

    const steps = [
      { name: 'Sent', count: sentCount },
      { name: 'Delivered', count: deliveredCount },
      { name: 'Read', count: readCount },
      { name: 'Clicked', count: clickCount },
      { name: 'Replied', count: replyCount },
    ];

    // Add conversion rates
    const funnel = steps.map((step, i) => {
      const prev = i === 0 ? step.count : steps[i - 1].count;
      const conversionRate = prev > 0 ? Math.round((step.count / prev) * 10000) / 100 : 0;
      const dropOff = prev > 0 ? Math.round(((prev - step.count) / prev) * 10000) / 100 : 0;
      const overallRate = sentCount > 0 ? Math.round((step.count / sentCount) * 10000) / 100 : 0;
      return { ...step, conversionRate, dropOff, overallRate };
    });

    // Get campaigns list for selector
    const campaigns = db.prepare(`SELECT id, name FROM campaigns ORDER BY id DESC`).all();

    res.json({ funnel, campaigns });
  } catch (err) {
    console.error('Reports funnel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
