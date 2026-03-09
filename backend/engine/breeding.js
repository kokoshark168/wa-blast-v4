const { getDb } = require('../db/init');
const engine = require('./index');
const { delay } = require('@whiskeysockets/baileys');
const { getRandomConversation } = require('./breeding-conversations');

class BreedingWorker {
  constructor() {
    this._intervals = new Map(); // sessionId -> intervalId
    this._consecutiveFailures = new Map(); // sessionId -> count
    this._activeConversations = new Map(); // `${sessionId}:${senderIdx}:${receiverIdx}` -> { conversation, step }
    this.MAX_CONSECUTIVE_FAILURES = 10; // auto-stop after this many full-round failures
  }

  async startBreeding(sessionId) {
    if (this._intervals.has(sessionId)) {
      throw new Error('Breeding session already running');
    }

    const db = getDb();
    const session = db.prepare('SELECT * FROM breeding_sessions WHERE id = ?').get(sessionId);
    if (!session) throw new Error('Breeding session not found');

    const numberIds = JSON.parse(session.number_ids || '[]');
    if (numberIds.length < 2) throw new Error('Need at least 2 numbers for breeding');

    const templates = JSON.parse(session.message_templates || '[]');
    if (!templates.length) throw new Error('No message templates configured');

    // Pre-check: at least 2 numbers must be actually connected
    const connectedCount = numberIds.filter(id => {
      const sess = engine.sessions.get(id);
      return sess && sess.status === 'active';
    }).length;

    if (connectedCount < 2) {
      throw new Error(`Need at least 2 connected numbers for breeding. Currently connected: ${connectedCount}/${numberIds.length}. Please connect your WhatsApp numbers first via QR scan.`);
    }

    const frequencyMs = (session.frequency_minutes || 60) * 60 * 1000;

    db.prepare("UPDATE breeding_sessions SET status = 'active' WHERE id = ?").run(sessionId);
    this._consecutiveFailures.set(sessionId, 0);

    // Run first round in background (don't await — so HTTP response returns immediately)
    this._runBreedingRound(sessionId, numberIds, templates).catch(err => {
      console.error(`❌ Breeding #${sessionId} first round error:`, err.message);
    });

    const intervalId = setInterval(async () => {
      try {
        await this._runBreedingRound(sessionId, numberIds, templates);
      } catch (err) {
        console.error(`❌ Breeding #${sessionId} interval error:`, err.message);
      }
    }, frequencyMs);

    this._intervals.set(sessionId, intervalId);
    console.log(`🐣 Breeding: Session #${sessionId} started (every ${session.frequency_minutes}min, ${connectedCount} numbers connected)`);
  }

  stopBreeding(sessionId) {
    const intervalId = this._intervals.get(sessionId);
    if (intervalId) {
      clearInterval(intervalId);
      this._intervals.delete(sessionId);
    }
    this._consecutiveFailures.delete(sessionId);

    // Clean up conversation states for this session
    for (const key of this._activeConversations.keys()) {
      if (key.startsWith(`${sessionId}:`)) this._activeConversations.delete(key);
    }

    try {
      const db = getDb();
      db.prepare("UPDATE breeding_sessions SET status = 'stopped' WHERE id = ?").run(sessionId);
    } catch (e) {}

    console.log(`🛑 Breeding: Session #${sessionId} stopped`);
  }

  /**
   * Run a breeding round using connected conversation flows.
   * Instead of sending random standalone messages, this picks a conversation template
   * and plays through it message by message across rounds, alternating A↔B.
   * Falls back to legacy random messages if conversation templates aren't available.
   */
  async _runBreedingRound(sessionId, numberIds, templates) {
    const db = getDb();
    try {
      // Check which numbers are actually connected
      const connectedIds = numberIds.filter(id => {
        const sess = engine.sessions.get(id);
        return sess && sess.status === 'active';
      });

      if (connectedIds.length < 2) {
        const failCount = (this._consecutiveFailures.get(sessionId) || 0) + 1;
        this._consecutiveFailures.set(sessionId, failCount);
        console.log(`⚠️ Breeding #${sessionId}: Only ${connectedIds.length} numbers connected, need 2+. (failure ${failCount}/${this.MAX_CONSECUTIVE_FAILURES})`);

        if (failCount >= this.MAX_CONSECUTIVE_FAILURES) {
          console.log(`🛑 Breeding #${sessionId}: Auto-stopping — too many consecutive failures (no connected numbers)`);
          try {
            db.prepare("INSERT INTO alerts (type, message) VALUES ('warning', ?)").run(
              `Breeding session #${sessionId} auto-stopped: not enough connected WhatsApp numbers (${connectedIds.length}/2 required)`
            );
          } catch (e) {}
          this.stopBreeding(sessionId);
        }
        return;
      }

      // Create random pairs from CONNECTED numbers only
      const shuffled = [...connectedIds].sort(() => Math.random() - 0.5);
      const pairs = [];
      for (let i = 0; i < shuffled.length; i++) {
        pairs.push({ sender: shuffled[i], receiver: shuffled[(i + 1) % shuffled.length] });
      }

      // Read anti-ban settings
      let minDelay = 3000, maxDelay = 8000, typingSim = true;
      try {
        const profile = db.prepare('SELECT * FROM antiban_profiles ORDER BY id DESC LIMIT 1').get();
        if (profile) {
          minDelay = (profile.min_delay || 3) * 1000;
          maxDelay = (profile.max_delay || 8) * 1000;
          typingSim = !!profile.typing_simulation;
        }
      } catch (e) {}

      let successCount = 0, failCount = 0;

      for (const pair of pairs) {
        const pairKey = `${sessionId}:${pair.sender}:${pair.receiver}`;

        // Get or initialize conversation state for this pair
        let convState = this._activeConversations.get(pairKey);
        if (!convState || convState.step >= convState.conversation.messages.length) {
          // Start a new conversation for this pair
          const conv = getRandomConversation();
          convState = { conversation: conv, step: 0 };
          this._activeConversations.set(pairKey, convState);
          console.log(`🐣 Breeding #${sessionId}: New conversation "${conv.topic}" for pair ${pair.sender}↔${pair.receiver}`);
        }

        const conv = convState.conversation;
        const msg = conv.messages[convState.step];

        // Determine actual sender/receiver based on conversation role (A or B)
        const actualSenderId = msg.from === 'A' ? pair.sender : pair.receiver;
        const actualReceiverId = msg.from === 'A' ? pair.receiver : pair.sender;

        const receiverRow = db.prepare('SELECT number FROM phone_numbers WHERE id = ?').get(actualReceiverId);
        if (!receiverRow) { convState.step++; continue; }

        // Double-check sender is still connected
        const senderSess = engine.sessions.get(actualSenderId);
        if (!senderSess || senderSess.status !== 'active') {
          console.log(`🐣 Breeding #${sessionId}: Sender #${actualSenderId} no longer connected, skipping`);
          failCount++;
          continue;
        }

        // Typing simulation
        if (typingSim) {
          const jid = receiverRow.number.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          try {
            await senderSess.sock.presenceSubscribe(jid);
            await senderSess.sock.sendPresenceUpdate('composing', jid);
            // Typing duration proportional to message length (more natural)
            const typingMs = Math.min(1000 + msg.text.length * 50, 5000) + Math.random() * 1500;
            await delay(typingMs);
            await senderSess.sock.sendPresenceUpdate('paused', jid);
          } catch (e) {}
        }

        console.log(`🐣 Breeding #${sessionId} [${conv.topic}]: Sending step ${convState.step + 1}/${conv.messages.length} | sender=#${actualSenderId} → receiver=#${actualReceiverId} (${receiverRow.number}) | msg="${msg.text.substring(0, 50)}"`);
        
        const result = await engine.sendMessage(actualSenderId, receiverRow.number, msg.text);

        if (result.success) {
          successCount++;
          convState.step++;
          console.log(`🐣 Breeding #${sessionId} [${conv.topic} ${convState.step}/${conv.messages.length}]: ✅ ${actualSenderId} → ${actualReceiverId}`);
        } else {
          failCount++;
          console.log(`🐣 Breeding #${sessionId}: ❌ Failed ${actualSenderId} → ${actualReceiverId}: ${result.error}`);
        }

        // Conversational delay between messages (30s-2min for within-conversation feel)
        const conversationDelay = 30000 + Math.random() * 90000; // 30s - 2min
        // Use the larger of anti-ban delay and conversation delay
        const pairDelay = Math.max(minDelay + Math.random() * (maxDelay - minDelay), conversationDelay);
        await delay(pairDelay);
      }

      // Clean up completed conversations
      for (const [key, state] of this._activeConversations) {
        if (key.startsWith(`${sessionId}:`) && state.step >= state.conversation.messages.length) {
          this._activeConversations.delete(key);
        }
      }

      // Track consecutive failures
      if (successCount > 0) {
        this._consecutiveFailures.set(sessionId, 0);
      } else {
        const consecutive = (this._consecutiveFailures.get(sessionId) || 0) + 1;
        this._consecutiveFailures.set(sessionId, consecutive);
        if (consecutive >= this.MAX_CONSECUTIVE_FAILURES) {
          console.log(`🛑 Breeding #${sessionId}: Auto-stopping — ${consecutive} consecutive rounds with 0 success`);
          try {
            db.prepare("INSERT INTO alerts (type, message) VALUES ('warning', ?)").run(
              `Breeding session #${sessionId} auto-stopped: ${consecutive} consecutive failed rounds`
            );
          } catch (e) {}
          this.stopBreeding(sessionId);
          return;
        }
      }

      db.prepare("UPDATE breeding_sessions SET last_run_at = datetime('now', 'localtime') WHERE id = ?").run(sessionId);
      console.log(`🐣 Breeding #${sessionId}: Round complete — ${successCount} sent, ${failCount} failed`);
    } catch (err) {
      console.error(`❌ Breeding #${sessionId} error:`, err.message);
    }
  }

  // Stop all on shutdown
  shutdown() {
    for (const [id] of this._intervals) {
      this.stopBreeding(id);
    }
  }
}

const breeding = new BreedingWorker();
module.exports = breeding;
