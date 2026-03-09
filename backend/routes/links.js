const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const router = Router();

// GET / — list all tracked links with click counts
router.get('/', auth, (req, res) => {
  try {
    const db = getDb();
    const { campaign_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = '';
    const params = [];
    if (campaign_id) {
      where = 'WHERE tl.campaign_id = ?';
      params.push(campaign_id);
    }

    const total = db.prepare(`SELECT COUNT(*) as c FROM tracked_links tl ${where}`).get(...params).c;

    const links = db.prepare(`
      SELECT tl.*, 
        (SELECT COUNT(*) FROM link_clicks lc WHERE lc.tracked_link_id = tl.id) as click_count,
        (SELECT MAX(lc.clicked_at) FROM link_clicks lc WHERE lc.tracked_link_id = tl.id) as last_click_at,
        d.domain as domain_name
      FROM tracked_links tl
      LEFT JOIN shortlink_domains d ON d.id = tl.domain_id
      ${where}
      ORDER BY tl.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ data: links, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/clicks — click details for a specific link
router.get('/:id/clicks', auth, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM tracked_links WHERE id = ?').get(req.params.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const clicks = db.prepare('SELECT * FROM link_clicks WHERE tracked_link_id = ? ORDER BY clicked_at DESC').all(req.params.id);
    res.json({ link, clicks, totalClicks: clicks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
