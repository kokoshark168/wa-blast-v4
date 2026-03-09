const crypto = require('crypto');
const { getDb } = require('../db/init');

const URL_REGEX = /https?:\/\/[^\s]+/g;
const DEFAULT_BASE_URL = process.env.TRACKING_BASE_URL || 'https://server1.nyxshark.online';

function generateShortCode() {
  return crypto.randomBytes(4).toString('hex');
}

function getPrimaryDomain() {
  try {
    const db = getDb();
    const row = db.prepare("SELECT id, domain FROM shortlink_domains WHERE is_primary = 1 AND status = 'active' LIMIT 1").get();
    return row || null;
  } catch (e) {
    return null;
  }
}

function wrapLinks(text, campaignId, blastQueueId, contactNumber) {
  const db = getDb();
  const primaryDomain = getPrimaryDomain();
  const baseUrl = primaryDomain ? `https://${primaryDomain.domain}` : DEFAULT_BASE_URL;
  const domainId = primaryDomain ? primaryDomain.id : null;

  const insert = db.prepare(
    'INSERT INTO tracked_links (campaign_id, blast_queue_id, original_url, short_code, contact_number, domain_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\', \'localtime\'))'
  );

  return text.replace(URL_REGEX, (url) => {
    // PREVENT double-wrapping: skip URLs that are already tracked short links
    if (url.includes('/go/')) {
      return url;
    }
    const shortCode = generateShortCode();
    insert.run(campaignId, blastQueueId, url, shortCode, contactNumber, domainId);
    return `${baseUrl}/go/${shortCode}`;
  });
}

module.exports = { wrapLinks, generateShortCode };
