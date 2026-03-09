const { getDb } = require('../db/init');

let intervalId = null;

function processDripEnrollments() {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    
    // Find active enrollments where next_send_at <= now
    const due = db.prepare(`
      SELECT de.*, ds.name as sequence_name 
      FROM drip_enrollments de 
      JOIN drip_sequences ds ON ds.id = de.sequence_id 
      WHERE de.status = 'active' AND de.next_send_at <= ? AND ds.is_active = 1
    `).all(now);

    if (!due.length) return;

    const engine = require('./index');

    for (const enrollment of due) {
      try {
        // Get next step (current_step is the last completed step, 0 = none completed)
        const nextStepOrder = enrollment.current_step + 1;
        const step = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? AND step_order = ?').get(enrollment.sequence_id, nextStepOrder);

        if (!step) {
          // No more steps, mark completed
          db.prepare("UPDATE drip_enrollments SET status = 'completed' WHERE id = ?").run(enrollment.id);
          continue;
        }

        // Get message content
        let messageText = step.message_text;
        if (!messageText && step.template_id) {
          const template = db.prepare('SELECT content FROM templates WHERE id = ?').get(step.template_id);
          if (template) messageText = template.content;
        }

        if (messageText) {
          // Send via engine (best effort)
          const activeNumber = db.prepare("SELECT * FROM phone_numbers WHERE status = 'active' LIMIT 1").get();
          if (activeNumber) {
            engine.sendMessage(activeNumber.id, enrollment.contact_phone, messageText).catch(e => {
              console.error(`Drip send error (enrollment ${enrollment.id}):`, e.message);
            });
          }
        }

        // Advance step
        const nextStep = db.prepare('SELECT * FROM drip_steps WHERE sequence_id = ? AND step_order = ?').get(enrollment.sequence_id, nextStepOrder + 1);
        
        if (nextStep) {
          // Calculate next send time
          const nextSendAt = new Date(Date.now() + nextStep.delay_hours * 3600000).toISOString();
          db.prepare('UPDATE drip_enrollments SET current_step = ?, next_send_at = ? WHERE id = ?').run(nextStepOrder, nextSendAt, enrollment.id);
        } else {
          // This was the last step
          db.prepare("UPDATE drip_enrollments SET current_step = ?, status = 'completed', next_send_at = NULL WHERE id = ?").run(nextStepOrder, enrollment.id);
        }
      } catch (e) {
        console.error(`Drip worker error for enrollment ${enrollment.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('Drip worker error:', e.message);
  }
}

function startDripWorker() {
  if (intervalId) return;
  console.log('✅ Drip worker started (every 60s)');
  intervalId = setInterval(processDripEnrollments, 60000);
  // Also run immediately
  processDripEnrollments();
}

function stopDripWorker() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

module.exports = { startDripWorker, stopDripWorker };
