const { Router } = require('express');
const { getDb } = require('../db/init');
const auth = require('../middleware/auth');
const auditLog = require('../middleware/auditLog');
const router = Router();

// Create A/B test (creates 2 campaigns with same contact list, split 50/50)
router.post('/', auth, auditLog('ab_test.create'), (req, res) => {
  const { name, contact_list_id, message_a, message_b, template_id_a, template_id_b, numbers_used, schedule_at, delay_min, delay_max } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!contact_list_id) return res.status(400).json({ error: 'Contact list is required' });
  if (!message_a && !template_id_a) return res.status(400).json({ error: 'Variant A message or template required' });
  if (!message_b && !template_id_b) return res.status(400).json({ error: 'Variant B message or template required' });

  const db = getDb();
  const groupId = `ab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const createAB = db.transaction(() => {
    const stmtCampaign = db.prepare(`INSERT INTO campaigns (name, status, template_id, contact_list_id, numbers_used, schedule_at, delay_min, delay_max, message, variant, ab_test_group) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    const resultA = stmtCampaign.run(
      `${name} (Variant A)`, schedule_at ? 'scheduled' : 'draft',
      template_id_a || null, contact_list_id,
      JSON.stringify(numbers_used || []), schedule_at || null,
      delay_min || 5, delay_max || 15,
      message_a || null, 'A', groupId
    );
    const resultB = stmtCampaign.run(
      `${name} (Variant B)`, schedule_at ? 'scheduled' : 'draft',
      template_id_b || null, contact_list_id,
      JSON.stringify(numbers_used || []), schedule_at || null,
      delay_min || 5, delay_max || 15,
      message_b || null, 'B', groupId
    );

    return { campaign_a_id: resultA.lastInsertRowid, campaign_b_id: resultB.lastInsertRowid, group_id: groupId };
  });

  try {
    const result = createAB();
    res.status(201).json(result);
  } catch (e) {
    console.error('A/B test create error:', e.message);
    res.status(500).json({ error: 'Failed to create A/B test' });
  }
});

// Launch A/B test (split contacts 50/50 and launch both)
router.post('/:groupId/launch', auth, auditLog('ab_test.launch'), (req, res) => {
  const db = getDb();
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE ab_test_group = ? ORDER BY variant ASC').all(req.params.groupId);
  if (campaigns.length !== 2) return res.status(404).json({ error: 'A/B test group not found' });

  const campaignA = campaigns.find(c => c.variant === 'A');
  const campaignB = campaigns.find(c => c.variant === 'B');
  if (!campaignA || !campaignB) return res.status(400).json({ error: 'Invalid A/B test group' });

  const launchAB = db.transaction(() => {
    const contacts = db.prepare('SELECT * FROM contacts WHERE list_id = ? AND COALESCE(is_valid, 1) = 1').all(campaignA.contact_list_id);
    if (!contacts.length) return { error: 'No contacts', status: 400 };

    // Shuffle and split 50/50
    const shuffled = contacts.sort(() => Math.random() - 0.5);
    const mid = Math.ceil(shuffled.length / 2);
    const contactsA = shuffled.slice(0, mid);
    const contactsB = shuffled.slice(mid);

    const numbersA = JSON.parse(campaignA.numbers_used || '[]');
    const numbersB = JSON.parse(campaignB.numbers_used || '[]');
    const activeNumbers = numbersA.length
      ? db.prepare(`SELECT id FROM phone_numbers WHERE id IN (${numbersA.map(() => '?').join(',')}) AND status = 'active'`).all(...numbersA)
      : db.prepare("SELECT id FROM phone_numbers WHERE status = 'active'").all();
    if (!activeNumbers.length) return { error: 'No active sender numbers', status: 400 };

    // Clean old queues
    db.prepare("DELETE FROM blast_queue WHERE campaign_id = ?").run(campaignA.id);
    db.prepare("DELETE FROM blast_queue WHERE campaign_id = ?").run(campaignB.id);

    const stmt = db.prepare("INSERT INTO blast_queue (campaign_id, sender_number_id, target_phone, created_at) VALUES (?, ?, ?, datetime('now', 'localtime'))");
    contactsA.forEach((c, i) => stmt.run(campaignA.id, activeNumbers[i % activeNumbers.length].id, c.phone));
    contactsB.forEach((c, i) => stmt.run(campaignB.id, activeNumbers[i % activeNumbers.length].id, c.phone));

    db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(campaignA.id);
    db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(campaignB.id);

    return { success: true, variant_a: contactsA.length, variant_b: contactsB.length };
  });

  const result = launchAB();
  if (result.error) return res.status(result.status).json({ error: result.error });

  // Launch blasts in background
  const engine = require('../engine/index');
  engine.sendBulk(campaignA.id).catch(e => console.error('A/B A blast error:', e.message));
  engine.sendBulk(campaignB.id).catch(e => console.error('A/B B blast error:', e.message));

  res.json({ message: 'A/B test launched', ...result });
});

// Get A/B test comparison
router.get('/:groupId/compare', auth, (req, res) => {
  const db = getDb();
  const campaigns = db.prepare('SELECT * FROM campaigns WHERE ab_test_group = ? ORDER BY variant ASC').all(req.params.groupId);
  if (campaigns.length !== 2) return res.status(404).json({ error: 'A/B test group not found' });

  const getStats = (campaignId) => {
    const total = db.prepare('SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ?').get(campaignId).c;
    const sent = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status IN ('sent','delivered','read')").get(campaignId).c;
    const delivered = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status IN ('delivered','read')").get(campaignId).c;
    const read = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'read'").get(campaignId).c;
    const failed = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'failed'").get(campaignId).c;
    const clicks = db.prepare('SELECT COUNT(DISTINCT tl.contact_number) as c FROM link_clicks lc JOIN tracked_links tl ON tl.id = lc.tracked_link_id WHERE tl.campaign_id = ?').get(campaignId).c;
    
    return {
      total, sent, delivered, read, failed, clicks,
      delivery_rate: total > 0 ? Math.round(delivered / total * 10000) / 100 : 0,
      read_rate: total > 0 ? Math.round(read / total * 10000) / 100 : 0,
      ctr: sent > 0 ? Math.round(clicks / sent * 10000) / 100 : 0,
    };
  };

  const statsA = getStats(campaigns[0].id);
  const statsB = getStats(campaigns[1].id);

  // Determine winner based on composite score (delivery + read + ctr)
  const scoreA = statsA.delivery_rate + statsA.read_rate + statsA.ctr;
  const scoreB = statsB.delivery_rate + statsB.read_rate + statsB.ctr;
  let winner = null;
  if (scoreA > scoreB && statsA.total > 0) winner = 'A';
  else if (scoreB > scoreA && statsB.total > 0) winner = 'B';

  res.json({
    group_id: req.params.groupId,
    variant_a: { campaign: campaigns[0], stats: statsA },
    variant_b: { campaign: campaigns[1], stats: statsB },
    winner
  });
});

// List all A/B test groups
router.get('/', auth, (req, res) => {
  const db = getDb();
  const groups = db.prepare("SELECT DISTINCT ab_test_group FROM campaigns WHERE ab_test_group IS NOT NULL AND ab_test_group != ''").all();
  const results = groups.map(g => {
    const campaigns = db.prepare('SELECT id, name, variant, status, created_at FROM campaigns WHERE ab_test_group = ? ORDER BY variant ASC').all(g.ab_test_group);
    return { group_id: g.ab_test_group, campaigns };
  });
  res.json({ data: results });
});

module.exports = router;
