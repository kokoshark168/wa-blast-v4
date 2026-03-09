const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

// GET / — list tracked links with click counts
router.get('/', auth, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, search, campaign_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let where = '1=1';
    const params = [];
    if (campaign_id) { where += ' AND tl.campaign_id = ?'; params.push(campaign_id); }
    if (search) { where += ' AND (tl.short_code LIKE ? OR tl.original_url LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM tracked_links tl WHERE ${where}`).get(...params).c;
    const links = db.prepare(`
      SELECT tl.*, 
        c.name as campaign_name,
        (SELECT COUNT(*) FROM link_clicks lc WHERE lc.tracked_link_id = tl.id) as total_clicks,
        (SELECT COUNT(DISTINCT lc.ip_address) FROM link_clicks lc WHERE lc.tracked_link_id = tl.id) as unique_clicks
      FROM tracked_links tl
      LEFT JOIN campaigns c ON c.id = tl.campaign_id
      WHERE ${where}
      ORDER BY tl.id DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ data: links, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats/summary — overall stats
router.get('/stats/summary', auth, (req, res) => {
  try {
    const db = getDb();
    const total_links = db.prepare('SELECT COUNT(*) as c FROM tracked_links').get().c;
    const total_clicks = db.prepare('SELECT COUNT(*) as c FROM link_clicks').get().c;
    const unique_clicks = db.prepare('SELECT COUNT(DISTINCT ip_address) as c FROM link_clicks').get().c;
    const ctr = total_links > 0 ? (total_clicks / total_links * 100).toFixed(2) : '0.00';
    res.json({ total_links, total_clicks, unique_clicks, ctr });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats/timeline — clicks over time
router.get('/stats/timeline', auth, (req, res) => {
  try {
    const db = getDb();
    const days = parseInt(req.query.days || '30');
    const rows = db.prepare(`
      SELECT date(clicked_at) as period, COUNT(*) as clicks 
      FROM link_clicks 
      WHERE clicked_at >= datetime('now', 'localtime', '-${days} days')
      GROUP BY date ORDER BY date
    `).all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /stats/by-campaign — clicks grouped by campaign
router.get('/stats/by-campaign', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT c.id, c.name, 
        COUNT(DISTINCT tl.id) as total_links,
        (SELECT COUNT(*) FROM link_clicks lc2 JOIN tracked_links tl2 ON tl2.id = lc2.tracked_link_id WHERE tl2.campaign_id = c.id) as total_clicks,
        (SELECT COUNT(DISTINCT lc3.ip_address) FROM link_clicks lc3 JOIN tracked_links tl3 ON tl3.id = lc3.tracked_link_id WHERE tl3.campaign_id = c.id) as unique_clicks
      FROM campaigns c
      JOIN tracked_links tl ON tl.campaign_id = c.id
      GROUP BY c.id ORDER BY c.id DESC
    `).all();
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/clicks — click log for a specific link
router.get('/:id/clicks', auth, (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const link = db.prepare('SELECT * FROM tracked_links WHERE id = ?').get(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const total = db.prepare('SELECT COUNT(*) as c FROM link_clicks WHERE tracked_link_id = ?').get(req.params.id).c;
    const clicks = db.prepare('SELECT * FROM link_clicks WHERE tracked_link_id = ? ORDER BY clicked_at DESC LIMIT ? OFFSET ?').all(req.params.id, parseInt(limit), offset);
    res.json({ link, data: clicks, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
