const cron = require('node-cron');
const { getDb } = require('../db/init');
const { getDailyTarget } = require('../routes/warmup');
const { broadcast } = require('../utils/wsServer');

let cronJob = null;

function runWarmup() {
  try {
    const db = getDb();
    const activePlans = db.prepare('SELECT wp.*, pn.number FROM warmup_plans wp JOIN phone_numbers pn ON pn.id = wp.phone_number_id WHERE wp.is_active = 1').all();
    
    for (const plan of activePlans) {
      const remaining = plan.daily_target - plan.daily_sent;
      if (remaining <= 0) continue;

      // Get breeding pool contacts to send to
      const contacts = db.prepare(`
        SELECT DISTINCT target_phone FROM blast_queue 
        WHERE sender_number_id = ? AND status IN ('sent','delivered','read')
        ORDER BY RANDOM() LIMIT ?
      `).all(plan.phone_number_id, remaining);

      console.log(`🔥 Warmup: Number ${plan.number} Day ${plan.current_day}/${plan.total_days} - Target: ${plan.daily_target}, Sending: ${contacts.length}`);
      
      // Update daily_sent count (actual sending would be handled by WA engine)
      const sentCount = contacts.length;
      db.prepare('UPDATE warmup_plans SET daily_sent = daily_sent + ? WHERE id = ?').run(sentCount, plan.id);
      
      broadcast('warmup:progress', {
        planId: plan.id,
        number: plan.number,
        day: plan.current_day,
        totalDays: plan.total_days,
        dailySent: plan.daily_sent + sentCount,
        dailyTarget: plan.daily_target
      });
    }

    // Advance day for plans where it's a new day (reset daily_sent at midnight)
    // This runs at 08:00, so we advance the day and reset
    const plansToAdvance = db.prepare('SELECT * FROM warmup_plans WHERE is_active = 1 AND daily_sent >= daily_target').all();
    for (const plan of plansToAdvance) {
      const nextDay = plan.current_day + 1;
      if (nextDay > plan.total_days) {
        db.prepare('UPDATE warmup_plans SET is_active = 0 WHERE id = ?').run(plan.id);
        broadcast('warmup:complete', { planId: plan.id });
        console.log(`✅ Warmup complete for plan ${plan.id}`);
      } else {
        const newTarget = getDailyTarget(plan.plan_type, nextDay);
        db.prepare('UPDATE warmup_plans SET current_day = ?, daily_target = ?, daily_sent = 0 WHERE id = ?').run(nextDay, newTarget, plan.id);
      }
    }
  } catch (err) {
    console.error('Warmup worker error:', err.message);
  }
}

function startWarmupWorker() {
  // Run daily at 08:00 WIB (01:00 UTC)
  cronJob = cron.schedule('0 1 * * *', runWarmup);
  console.log('✅ Warmup worker scheduled (08:00 WIB daily)');
}

function stopWarmupWorker() {
  if (cronJob) { cronJob.stop(); cronJob = null; }
}

module.exports = { startWarmupWorker, stopWarmupWorker, runWarmup };
