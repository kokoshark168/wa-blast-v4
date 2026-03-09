const { Router } = require('express');
const { getDb } = require('../db/init');
const { buildCrud } = require('../utils/crud');
const engine = require('../engine/index');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const { requireFields } = require('../utils/validate');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = Router();

const crud = buildCrud('campaigns', {
  allowedFields: ['name','status','template_id','contact_list_id','schedule_at','delay_min','delay_max','numbers_used','message','media_url','media_type','interactive_type','interactive_data']
});

// === Media Upload Config ===
const uploadsDir = path.join(__dirname, '..', 'uploads', 'campaigns');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `campaign-${req.params.id}-${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only jpg/png/gif/webp images allowed'));
  }
});

router.get('/', auth, crud.getAll);

// Campaign comparison (must be before /:id to avoid matching "compare" as an id)
router.get('/compare', auth, (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number).filter(Boolean);
    if (ids.length < 2) return res.status(400).json({ error: 'At least 2 campaign IDs required' });
    const db = getDb();
    const results = ids.map(id => {
      const campaign = db.prepare('SELECT id, name, status, created_at FROM campaigns WHERE id = ?').get(id);
      if (!campaign) return { id, error: 'Not found' };
      const stats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
          SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
        FROM blast_queue WHERE campaign_id = ?
      `).get(id);
      const clicks = db.prepare('SELECT COUNT(*) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?').get(id).c;
      return {
        ...campaign, ...stats, clicks,
        delivery_rate: stats.total > 0 ? Math.round((stats.delivered + stats.read_count) / stats.total * 100) : 0,
        read_rate: stats.total > 0 ? Math.round(stats.read_count / stats.total * 100) : 0,
      };
    });
    res.json(results);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, crud.getById);
router.post('/', auth, auditLog('campaigns.create'), (req, res, next) => {
  const err = requireFields(req.body, ["name"]);
  if (!err) { const db = getDb(); const dup = db.prepare("SELECT id FROM campaigns WHERE name = ?").get(req.body.name); if (dup) return res.status(409).json({ error: "Nama campaign sudah dipakai, gunakan nama lain" }); }
  if (err) return res.status(400).json({ error: err });
  // Auto-set scheduled status if schedule_at is in the future
  if (req.body.schedule_at && new Date(req.body.schedule_at) > new Date()) {
    req.body.status = 'scheduled';
  }
  next();
}, crud.create);
router.patch('/:id', auth, auditLog('campaigns.update'), crud.update);
router.delete('/:id', auth, auditLog('campaigns.delete'), crud.remove);

// === Campaign Media Upload ===
router.post('/:id/media', auth, upload.single('media'), (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) { if (req.file) fs.unlinkSync(req.file.path); return res.status(404).json({ error: 'Campaign not found' }); }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Remove old media if exists
    if (campaign.media_url) {
      const oldPath = path.join(__dirname, '..', campaign.media_url);
      try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (e) {}
    }

    const mediaUrl = `uploads/campaigns/${req.file.filename}`;
    db.prepare('UPDATE campaigns SET media_url = ?, media_type = ? WHERE id = ?').run(mediaUrl, req.file.mimetype, req.params.id);
    res.json({ media_url: mediaUrl, media_type: req.file.mimetype, filename: req.file.filename });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id/media', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.media_url) {
      const filePath = path.join(__dirname, '..', campaign.media_url);
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
    }
    db.prepare('UPDATE campaigns SET media_url = NULL, media_type = NULL WHERE id = ?').run(req.params.id);
    res.json({ message: 'Media removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Launch: generate blast queue from contacts (with race condition prevention)
router.post('/:id/launch', auth, auditLog('campaigns.launch'), (req, res) => {
  const db = getDb();

  // Use transaction to prevent double launch
  const launchCampaign = db.transaction(() => {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return { error: 'Campaign not found', status: 404 };
    if (campaign.status === 'running') return { error: 'Campaign is already running', status: 400 };
    if (campaign.status === 'completed') return { error: 'Campaign is already completed', status: 400 };

    // Clean any old queue entries for this campaign (e.g. from previous launches or demo data)
    db.prepare("DELETE FROM blast_queue WHERE campaign_id = ?").run(req.params.id);

    const contacts = db.prepare('SELECT * FROM contacts WHERE list_id = ? AND COALESCE(is_valid, 1) = 1').all(campaign.contact_list_id);
    if (!contacts.length) return { error: 'No contacts in the contact list', status: 400 };

    const numbers = JSON.parse(campaign.numbers_used || '[]');
    const activeNumbers = numbers.length
      ? db.prepare(`SELECT id FROM phone_numbers WHERE id IN (${numbers.map(() => '?').join(',')}) AND status = 'active'`).all(...numbers)
      : db.prepare("SELECT id FROM phone_numbers WHERE status = 'active'").all();

    if (!activeNumbers.length) return { error: 'No active sender numbers', status: 400 };

    // Validate: campaign must have template OR direct message
    if (!campaign.template_id && !campaign.message) {
      return { error: 'Campaign has no template and no message. Please select a template or write a message.', status: 400 };
    }
    // Validate: if template selected, make sure it exists and has content
    if (campaign.template_id) {
      const tpl = db.prepare('SELECT id, content FROM templates WHERE id = ?').get(campaign.template_id);
      if (!tpl) return { error: 'Selected template not found (id=' + campaign.template_id + ')', status: 400 };
      if (!tpl.content || tpl.content.trim() === '') return { error: 'Selected template has no content', status: 400 };
    }

    const stmt = db.prepare("INSERT INTO blast_queue (campaign_id, sender_number_id, target_phone, created_at) VALUES (?, ?, ?, datetime('now', 'localtime'))");
    contacts.forEach((c, i) => {
      const sender = activeNumbers[i % activeNumbers.length];
      stmt.run(campaign.id, sender.id, c.phone);
    });

    db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(req.params.id);
    return { success: true, queued: contacts.length };
  });

  const result = launchCampaign();
  if (result.error) return res.status(result.status).json({ error: result.error });

  // Start the actual blast in background
  engine.sendBulk(Number(req.params.id)).then(stats => {
    console.log(`✅ Campaign #${req.params.id} blast complete:`, stats);
  }).catch(err => {
    console.error(`❌ Campaign #${req.params.id} blast error:`, err.message);
    try {
      const db2 = getDb();
      db2.prepare("INSERT INTO alerts (type, message) VALUES ('blast_error', ?)").run(`Campaign #${req.params.id}: ${err.message}`);
    } catch (e) {}
  });

  res.json({ message: 'Campaign launched', queued: result.queued });
});

router.post('/:id/pause', auth, auditLog('campaigns.pause'), (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'running') return res.status(400).json({ error: 'Campaign is not running' });
  engine.stopBulk(Number(req.params.id));
  db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Campaign paused' });
});

router.post('/:id/resume', auth, auditLog('campaigns.resume'), (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status !== 'paused' && campaign.status !== 'running') return res.status(400).json({ error: 'Campaign is not paused' });
  db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(req.params.id);

  // Re-trigger sendBulk for remaining pending items
  const pending = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").get(req.params.id);
  if (pending.c > 0) {
    engine.sendBulk(Number(req.params.id)).then(stats => {
      console.log('✅ Campaign #' + req.params.id + ' resume blast complete:', stats);
    }).catch(err => {
      console.error('❌ Campaign #' + req.params.id + ' resume blast error:', err.message);
    });
  }

  res.json({ message: 'Campaign resumed', pending: pending.c });
});

// Cancel campaign
router.post('/:id/cancel', auth, auditLog('campaigns.cancel'), (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  if (campaign.status === 'completed') return res.status(400).json({ error: 'Campaign is already completed' });
  engine.stopBulk(Number(req.params.id));
  db.prepare("UPDATE campaigns SET status = 'draft' WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").run(req.params.id);
  res.json({ message: 'Campaign cancelled' });
});

// Campaign report
router.get('/:id/report', auth, (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const messages = db.prepare('SELECT id, target_phone, status, sent_at, delivered_at, read_at, error FROM blast_queue WHERE campaign_id = ? ORDER BY id ASC').all(req.params.id);

  const total = messages.length;
  const sent = messages.filter(m => m.status === 'sent').length;
  const delivered = messages.filter(m => m.status === 'delivered').length;
  const read = messages.filter(m => m.status === 'read').length;
  const failed = messages.filter(m => m.status === 'failed').length;
  const pending = messages.filter(m => m.status === 'pending').length;
  const skipped = messages.filter(m => m.status === 'skipped').length;

  res.json({
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, created_at: campaign.created_at },
    summary: { total, pending, sent, delivered, read, failed, skipped },
    messages
  });
});

// Export campaign report as CSV
router.get('/:id/export', auth, (req, res) => {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const messages = db.prepare('SELECT target_phone, status, sent_at, delivered_at, read_at, error FROM blast_queue WHERE campaign_id = ? ORDER BY id ASC').all(req.params.id);

  const header = 'recipient_number,message_status,sent_at,delivered_at,read_at,error_message';
  const rows = messages.map(m => {
    const escape = (v) => v ? `"${String(v).replace(/"/g, '""')}"` : '';
    return [escape(m.target_phone), escape(m.status), escape(m.sent_at), escape(m.delivered_at), escape(m.read_at), escape(m.error)].join(',');
  });
  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="campaign-${req.params.id}-report.csv"`);
  res.send(csv);
});

// Click stats for a campaign
router.get('/:id/clicks', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const totalLinks = db.prepare('SELECT COUNT(*) as c FROM tracked_links WHERE campaign_id = ?').get(req.params.id).c;
    const totalClicks = db.prepare('SELECT COUNT(*) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?').get(req.params.id).c;
    const uniqueClicks = db.prepare('SELECT COUNT(DISTINCT tl.contact_number) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?').get(req.params.id).c;
    const totalSent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status IN ('sent','delivered','read')").get(req.params.id).c;
    const ctr = totalSent > 0 ? Math.round(uniqueClicks / totalSent * 10000) / 100 : 0;

    const perLink = db.prepare(`
      SELECT tl.original_url, tl.short_code, COUNT(lc.id) as clicks, COUNT(DISTINCT tl.contact_number) as unique_clicks
      FROM tracked_links tl LEFT JOIN link_clicks lc ON lc.tracked_link_id = tl.id
      WHERE tl.campaign_id = ? GROUP BY tl.original_url, tl.short_code ORDER BY clicks DESC
    `).all(req.params.id);

    res.json({ totalLinks, totalClicks, uniqueClicks, ctr, totalSent, perLink });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Click timeline for a campaign
router.get('/:id/clicks/timeline', auth, (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', lc.clicked_at) as hour, COUNT(*) as clicks
      FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id
      WHERE tl.campaign_id = ? GROUP BY hour ORDER BY hour
    `).all(req.params.id);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Feature 14: Campaign Analytics Enhancement ===

// Timeline: hourly buckets of sent/delivered/read
router.get('/:id/timeline', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const sent = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', sent_at) as hour, COUNT(*) as count
      FROM blast_queue WHERE campaign_id = ? AND sent_at IS NOT NULL
      GROUP BY hour ORDER BY hour
    `).all(req.params.id);

    const delivered = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', delivered_at) as hour, COUNT(*) as count
      FROM blast_queue WHERE campaign_id = ? AND delivered_at IS NOT NULL
      GROUP BY hour ORDER BY hour
    `).all(req.params.id);

    const read = db.prepare(`
      SELECT strftime('%Y-%m-%d %H:00', read_at) as hour, COUNT(*) as count
      FROM blast_queue WHERE campaign_id = ? AND read_at IS NOT NULL
      GROUP BY hour ORDER BY hour
    `).all(req.params.id);

    // Merge into unified timeline
    const hourMap = {};
    for (const r of sent) { hourMap[r.hour] = { ...(hourMap[r.hour] || {}), hour: r.hour, sent: r.count }; }
    for (const r of delivered) { hourMap[r.hour] = { ...(hourMap[r.hour] || {}), hour: r.hour, delivered: r.count }; }
    for (const r of read) { hourMap[r.hour] = { ...(hourMap[r.hour] || {}), hour: r.hour, read: r.count }; }

    const timeline = Object.values(hourMap).sort((a, b) => a.hour.localeCompare(b.hour)).map(h => ({
      hour: h.hour, sent: h.sent || 0, delivered: h.delivered || 0, read: h.read || 0
    }));

    res.json(timeline);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Response analysis: word frequency from replies
router.get('/:id/responses-analysis', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Get target phones for this campaign
    const targets = db.prepare('SELECT target_phone FROM blast_queue WHERE campaign_id = ?').all(req.params.id).map(t => t.target_phone);
    if (!targets.length) return res.json({ words: [], total_replies: 0 });

    // Find replies from these numbers
    const placeholders = targets.map(() => '?').join(',');
    const replies = db.prepare(`SELECT message FROM replies WHERE from_number IN (${placeholders}) AND message IS NOT NULL AND message != ''`).all(...targets);

    // Word frequency
    const wordCount = {};
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','and','but','or','if','then','that','this','it','to','of','in','for','on','with','at','by','from','as','i','me','my','we','our','you','your','he','him','his','she','her','they','them','their','not','no','so','ya','yg','di','ke','dan','yang','ini','itu','ada','tidak','bisa','untuk','dengan','dari','juga','akan','sudah','saya','aku','kamu','dia']);

    for (const r of replies) {
      const words = r.message.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w));
      for (const w of words) { wordCount[w] = (wordCount[w] || 0) + 1; }
    }

    const words = Object.entries(wordCount).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([word, count]) => ({ word, count }));
    res.json({ words, total_replies: replies.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Geographic distribution by phone prefix
router.get('/:id/geo', auth, (req, res) => {
  try {
    const db = getDb();
    // Indonesian phone prefix regions
    const prefixMap = {
      '62811': 'Telkomsel', '62812': 'Telkomsel', '62813': 'Telkomsel', '62821': 'Telkomsel', '62822': 'Telkomsel', '62823': 'Telkomsel',
      '62814': 'Indosat', '62815': 'Indosat', '62816': 'Indosat', '62855': 'Indosat', '62856': 'Indosat', '62857': 'Indosat', '62858': 'Indosat',
      '62817': 'XL', '62818': 'XL', '62819': 'XL', '62859': 'XL', '62877': 'XL', '62878': 'XL',
      '62831': 'AXIS', '62832': 'AXIS', '62833': 'AXIS', '62838': 'AXIS',
      '62895': 'Three', '62896': 'Three', '62897': 'Three', '62898': 'Three', '62899': 'Three',
      '62881': 'Smartfren', '62882': 'Smartfren', '62883': 'Smartfren', '62884': 'Smartfren', '62885': 'Smartfren', '62886': 'Smartfren', '62887': 'Smartfren', '62888': 'Smartfren', '62889': 'Smartfren',
    };

    const rows = db.prepare('SELECT target_phone, status FROM blast_queue WHERE campaign_id = ?').all(req.params.id);
    const distribution = {};

    for (const r of rows) {
      const phone = r.target_phone.replace(/[^0-9]/g, '');
      let carrier = 'Other';
      for (const [prefix, name] of Object.entries(prefixMap)) {
        if (phone.startsWith(prefix)) { carrier = name; break; }
      }
      if (!distribution[carrier]) distribution[carrier] = { carrier, total: 0, sent: 0, delivered: 0, failed: 0 };
      distribution[carrier].total++;
      if (['sent', 'delivered', 'read'].includes(r.status)) distribution[carrier].sent++;
      if (['delivered', 'read'].includes(r.status)) distribution[carrier].delivered++;
      if (r.status === 'failed') distribution[carrier].failed++;
    }

    res.json(Object.values(distribution).sort((a, b) => b.total - a.total));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Campaign Number Performance Stats ===
router.get('/:id/number-performance', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    // Get stats from campaign_number_stats table
    const stats = db.prepare(`
      SELECT cns.*, pn.number as phone, pn.status as current_status, pn.health_score
      FROM campaign_number_stats cns
      LEFT JOIN phone_numbers pn ON pn.id = cns.phone_number_id
      WHERE cns.campaign_id = ?
      ORDER BY cns.messages_sent DESC
    `).all(req.params.id);

    // If no tracked stats yet, fall back to blast_queue aggregation
    let numberStats = stats;
    if (!stats.length) {
      numberStats = db.prepare(`
        SELECT 
          bq.sender_number_id as phone_number_id,
          pn.number as phone,
          pn.status as current_status,
          pn.health_score,
          COUNT(*) as total_assigned,
          SUM(CASE WHEN bq.status IN ('sent','delivered','read') THEN 1 ELSE 0 END) as messages_sent,
          SUM(CASE WHEN bq.status IN ('delivered','read') THEN 1 ELSE 0 END) as messages_delivered,
          SUM(CASE WHEN bq.status = 'failed' THEN 1 ELSE 0 END) as messages_failed,
          MIN(bq.sent_at) as started_at,
          MAX(bq.sent_at) as last_sent_at,
          NULL as ended_at,
          CASE 
            WHEN pn.status = 'active' THEN NULL
            WHEN pn.status IN ('banned','disconnected') THEN pn.status
            ELSE NULL
          END as end_reason
        FROM blast_queue bq
        LEFT JOIN phone_numbers pn ON pn.id = bq.sender_number_id
        WHERE bq.campaign_id = ?
        GROUP BY bq.sender_number_id
        ORDER BY messages_sent DESC
      `).all(req.params.id);
    }

    // Compute summary
    const totalNumbers = numberStats.length;
    const bannedNumbers = numberStats.filter(n => n.end_reason === 'banned').length;
    const disconnectedNumbers = numberStats.filter(n => n.end_reason === 'disconnected').length;
    const survivedNumbers = numberStats.filter(n => !n.end_reason || n.end_reason === 'completed').length;
    const totalSentByBanned = numberStats
      .filter(n => n.end_reason === 'banned')
      .reduce((sum, n) => sum + (n.messages_sent || 0), 0);
    const avgMsgsBeforeBan = bannedNumbers > 0 ? Math.round(totalSentByBanned / bannedNumbers) : null;
    const banRate = totalNumbers > 0 ? Math.round(bannedNumbers / totalNumbers * 100) : 0;

    // Per-number: compute duration
    const enriched = numberStats.map(n => {
      let durationMinutes = null;
      if (n.started_at) {
        const end = n.ended_at || n.last_sent_at || new Date().toISOString();
        durationMinutes = Math.round((new Date(end) - new Date(n.started_at)) / 60000);
      }
      return { ...n, duration_minutes: durationMinutes };
    });

    res.json({
      numbers: enriched,
      summary: {
        total_numbers: totalNumbers,
        survived: survivedNumbers,
        banned: bannedNumbers,
        disconnected: disconnectedNumbers,
        ban_rate: banRate,
        avg_msgs_before_ban: avgMsgsBeforeBan,
        cost_per_ban: bannedNumbers > 0 ? numberStats
          .filter(n => n.end_reason === 'banned')
          .map(n => ({ phone_number_id: n.phone_number_id, phone: n.phone, messages_sent: n.messages_sent || 0 })) : [],
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Reassign pending messages to new active senders ===
router.post('/:id/reassign', auth, auditLog('campaigns.reassign'), (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    let targetNumberIds = req.body?.number_ids || [];

    // If no number_ids provided, auto-select all active/connected numbers
    if (!targetNumberIds.length) {
      targetNumberIds = db.prepare("SELECT id FROM phone_numbers WHERE status = 'active'").all().map(n => n.id);
    }
    if (!targetNumberIds.length) return res.status(400).json({ error: 'No active numbers available for reassignment' });

    // Find pending messages whose sender is NOT in active numbers
    const activePlaceholders = targetNumberIds.map(() => '?').join(',');
    const stuckMessages = db.prepare(
      `SELECT id FROM blast_queue WHERE campaign_id = ? AND status = 'pending' AND sender_number_id NOT IN (${activePlaceholders})`
    ).all(req.params.id, ...targetNumberIds);

    if (!stuckMessages.length) return res.json({ reassigned: 0, newSenders: targetNumberIds });

    // Redistribute evenly across new senders
    const updateStmt = db.prepare('UPDATE blast_queue SET sender_number_id = ? WHERE id = ?');
    const reassignTx = db.transaction(() => {
      stuckMessages.forEach((msg, i) => {
        const newSender = targetNumberIds[i % targetNumberIds.length];
        updateStmt.run(newSender, msg.id);
      });
    });
    reassignTx();

    res.json({ reassigned: stuckMessages.length, newSenders: targetNumberIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stuck pending count for a campaign (messages assigned to inactive senders)
router.get('/:id/stuck', auth, (req, res) => {
  try {
    const db = getDb();
    const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const activeIds = db.prepare("SELECT id FROM phone_numbers WHERE status = 'active'").all().map(n => n.id);
    
    let stuckCount = 0;
    let totalPending = 0;
    
    if (activeIds.length) {
      const placeholders = activeIds.map(() => '?').join(',');
      stuckCount = db.prepare(
        `SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'pending' AND sender_number_id NOT IN (${placeholders})`
      ).get(req.params.id, ...activeIds).c;
    } else {
      // All numbers inactive — all pending are stuck
      stuckCount = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").get(req.params.id).c;
    }
    
    totalPending = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").get(req.params.id).c;

    res.json({ stuck: stuckCount, totalPending, activeNumbers: activeIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public API docs
router.get('/docs', (req, res) => {
  // Handled at server level
});

module.exports = router;
