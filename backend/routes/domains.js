const { Router } = require("express");
const { getDb } = require("../db/init");
const auth = require("../middleware/auth");
const dns = require("dns");
const router = Router();

const VPS_IP = "159.198.36.163";
const DOMAIN_REGEX = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

const CF_PREFIXES = [
  "104.16.","104.17.","104.18.","104.19.","104.20.","104.21.","104.22.","104.23.","104.24.","104.25.","104.26.","104.27.",
  "172.64.","172.65.","172.66.","172.67.","172.68.","172.69.","172.70.","172.71.",
  "173.245.","103.21.","103.22.","103.31.","141.101.","108.162.","190.93.","188.114.","197.234.","198.41."
];
function isCloudflareIP(ip) { return CF_PREFIXES.some(p => ip.startsWith(p)); }

router.get("/", auth, (req, res) => {
  try {
    const db = getDb();
    res.json(db.prepare("SELECT * FROM shortlink_domains ORDER BY is_primary DESC, created_at DESC").all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/stats", auth, (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT d.id, d.domain, d.status, d.is_primary,
        COUNT(DISTINCT tl.id) AS total_links, COUNT(lc.id) AS total_clicks,
        COUNT(DISTINCT lc.ip_address) AS unique_clicks, MAX(lc.clicked_at) AS last_click_at,
        CASE WHEN COUNT(DISTINCT tl.id) > 0 
          THEN ROUND(CAST(COUNT(DISTINCT CASE WHEN lc.id IS NOT NULL THEN tl.id END) AS REAL) / COUNT(DISTINCT tl.id) * 100, 1)
          ELSE 0 END AS ctr
      FROM shortlink_domains d
      LEFT JOIN tracked_links tl ON tl.domain_id = d.id
      LEFT JOIN link_clicks lc ON lc.tracked_link_id = tl.id
      GROUP BY d.id ORDER BY d.is_primary DESC, d.created_at DESC
    `).all();
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/", auth, (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain || !DOMAIN_REGEX.test(domain)) return res.status(400).json({ error: "Invalid domain format" });
    const db = getDb();
    const existing = db.prepare("SELECT id FROM shortlink_domains WHERE domain = ?").get(domain);
    if (existing) return res.status(409).json({ error: "Domain already exists" });
    const result = db.prepare("INSERT INTO shortlink_domains (domain) VALUES (?)").run(domain);
    const created = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json({ ...created, a_record: VPS_IP, instructions: "Point your domain A record to " + VPS_IP + " (or use Cloudflare proxy)" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/verify", auth, async (req, res) => {
  try {
    const db = getDb();
    const domain = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(req.params.id);
    if (!domain) return res.status(404).json({ error: "Domain not found" });

    let addresses;
    try { addresses = await dns.promises.resolve4(domain.domain); } catch (e) {
      db.prepare("UPDATE shortlink_domains SET status = 'failed', notes = ? WHERE id = ?").run("DNS resolution failed: " + (e.code || e.message), domain.id);
      return res.json({ verified: false, error: "DNS resolution failed: " + (e.code || e.message) });
    }

    const pointsToVPS = addresses.includes(VPS_IP);
    const pointsToCloudflare = addresses.some(ip => isCloudflareIP(ip));

    if (pointsToVPS || pointsToCloudflare) {
      const via = pointsToVPS ? "direct" : "cloudflare";
      db.prepare("UPDATE shortlink_domains SET status = 'active', verified_at = datetime('now', 'localtime'), notes = ? WHERE id = ?")
        .run("Verified via " + via + " (" + addresses.join(", ") + ")", domain.id);
      const hasPrimary = db.prepare("SELECT id FROM shortlink_domains WHERE is_primary = 1").get();
      if (!hasPrimary) {
        db.prepare("UPDATE shortlink_domains SET is_primary = 1 WHERE id = ?").run(domain.id);
      }
      const updated = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(domain.id);
      return res.json({ verified: true, via, addresses, domain: updated });
    } else {
      db.prepare("UPDATE shortlink_domains SET status = 'failed', notes = ? WHERE id = ?")
        .run("Resolved to " + addresses.join(", ") + " — not VPS or Cloudflare", domain.id);
      return res.json({ verified: false, addresses, expected: VPS_IP, error: "Domain must point to " + VPS_IP + " or use Cloudflare proxy" });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/:id/activate", auth, (req, res) => {
  try {
    const db = getDb();
    const domain = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(req.params.id);
    if (!domain) return res.status(404).json({ error: "Domain not found" });
    const hasPrimary = db.prepare("SELECT id FROM shortlink_domains WHERE is_primary = 1 AND id != ?").get(domain.id);
    db.prepare("UPDATE shortlink_domains SET status = 'active', is_primary = ? WHERE id = ?").run(hasPrimary ? 0 : 1, domain.id);
    res.json(db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(domain.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/:id/primary", auth, (req, res) => {
  try {
    const db = getDb();
    const domain = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(req.params.id);
    if (!domain) return res.status(404).json({ error: "Domain not found" });
    if (domain.status !== "active") return res.status(400).json({ error: "Domain must be active" });
    db.prepare("UPDATE shortlink_domains SET is_primary = 0").run();
    db.prepare("UPDATE shortlink_domains SET is_primary = 1 WHERE id = ?").run(domain.id);
    res.json(db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(domain.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/:id", auth, (req, res) => {
  try {
    const db = getDb();
    const domain = db.prepare("SELECT * FROM shortlink_domains WHERE id = ?").get(req.params.id);
    if (!domain) return res.status(404).json({ error: "Domain not found" });
    const linkCount = db.prepare("SELECT COUNT(*) as cnt FROM tracked_links WHERE domain_id = ?").get(domain.id);
    if (linkCount.cnt > 0) {
      db.prepare("UPDATE shortlink_domains SET status = 'disabled', is_primary = 0 WHERE id = ?").run(domain.id);
      return res.json({ message: "Domain disabled (has tracked links)", soft: true });
    }
    db.prepare("DELETE FROM shortlink_domains WHERE id = ?").run(domain.id);
    res.json({ message: "Domain deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
