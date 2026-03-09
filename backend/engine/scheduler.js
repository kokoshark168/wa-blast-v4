const { getDb } = require('../db/init');
const engine = require('./index');

let intervalId = null;

function startScheduler() {
  console.log('⏰ Scheduler: Started (checking every 30s)');
  checkScheduled(); // Run immediately
  intervalId = setInterval(checkScheduled, 30000);
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function checkScheduled() {
  try {
    const db = getDb();

    // Auto-resume cooling numbers after 24h
    const cooled = db.prepare("SELECT id FROM phone_numbers WHERE status = 'cooling' AND cooldown_until <= datetime('now', 'localtime')").all();
    for (const num of cooled) {
      db.prepare("UPDATE phone_numbers SET status = 'active', health_score = MAX(health_score, 20) WHERE id = ?").run(num.id);
      console.log(`♻️ Scheduler: Resumed cooling number #${num.id}`);
    }
    const due = db.prepare("SELECT * FROM campaigns WHERE status = 'scheduled' AND schedule_at <= datetime('now', 'localtime')").all();
    for (const campaign of due) {
      console.log(`⏰ Scheduler: Launching campaign #${campaign.id} "${campaign.name}"`);
      db.prepare("UPDATE campaigns SET status = 'running' WHERE id = ?").run(campaign.id);

      // Build queue if not already built
      const queueCount = db.prepare('SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ?').get(campaign.id);
      if (queueCount.c === 0) {
        const contacts = db.prepare('SELECT * FROM contacts WHERE list_id = ?').all(campaign.contact_list_id);
        const numbers = JSON.parse(campaign.numbers_used || '[]');
        const activeNumbers = numbers.length
          ? db.prepare(`SELECT id FROM phone_numbers WHERE id IN (${numbers.map(() => '?').join(',')}) AND status = 'active'`).all(...numbers)
          : db.prepare("SELECT id FROM phone_numbers WHERE status = 'active'").all();

        if (activeNumbers.length && contacts.length) {
          const stmt = db.prepare("INSERT INTO blast_queue (campaign_id, sender_number_id, target_phone, created_at) VALUES (?, ?, ?, datetime('now', 'localtime'))");
          contacts.forEach((c, i) => {
            const sender = activeNumbers[i % activeNumbers.length];
            stmt.run(campaign.id, sender.id, c.phone);
          });
        }
      }

      engine.sendBulk(campaign.id).then(stats => {
        console.log(`✅ Scheduled campaign #${campaign.id} complete:`, stats);
      }).catch(err => {
        console.error(`❌ Scheduled campaign #${campaign.id} error:`, err.message);
      });
    }
  } catch (err) {
    console.error('❌ Scheduler error:', err.message);
  }
}

module.exports = { startScheduler, stopScheduler };
