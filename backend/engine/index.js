const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay, fetchLatestBaileysVersion, proto, generateWAMessageFromContent, prepareWAMessageMedia } = require('@whiskeysockets/baileys');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/init');
const { wrapLinks } = require('../utils/linkTracker');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const MAX_RECONNECT_ATTEMPTS = 5;

class WAEngine {
  constructor() {
    this.sessions = new Map(); // phoneNumberId -> { sock, qr, status, reconnectAttempts }
    this._bulkRunning = new Map(); // campaignId -> { running, abortController }
    this.logger = pino({ level: 'silent' });
  }

  // === Initialize on server start: reconnect previously active numbers ===
  async init() {
    const db = getDb();
    // Reconnect ALL numbers that have session files (not just 'active')
    const reconnectableStatuses = ['active', 'qr_pending', 'disconnected', 'connecting', 'reconnecting', 'inactive'];
    const allNumbers = db.prepare("SELECT id, status FROM phone_numbers WHERE status IN ('active','qr_pending','disconnected','connecting','reconnecting','inactive')").all();
    
    // Filter: only reconnect if session files exist (meaning previously connected)
    const activeNumbers = allNumbers.filter(n => {
      const sessDir = path.join(SESSIONS_DIR, String(n.id));
      const hasFiles = fs.existsSync(sessDir) && fs.readdirSync(sessDir).length > 0;
      // Also check backup
      const backupDir = path.join(SESSIONS_DIR, `${n.id}_backup`);
      const hasBackup = fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0;
      return hasFiles || hasBackup;
    });
    
    this._autoReconnecting = true;
    console.log(`🔌 WAEngine: Reconnecting ${activeNumbers.length} number(s) with session files (staggered 5s)...`);
    for (let i = 0; i < activeNumbers.length; i++) {
      const num = activeNumbers[i];
      if (i > 0) await new Promise(r => setTimeout(r, 5000)); // 5s delay between connects
      try {
        // Set active so connect() proceeds
        if (num.status !== 'active') {
          db.prepare("UPDATE phone_numbers SET status = 'active' WHERE id = ?").run(num.id);
        }
        await this.connect(num.id);
      } catch (err) {
        console.error(`❌ WAEngine: Failed to reconnect #${num.id}:`, err.message);
      }
    }
    this._autoReconnecting = false;
  }

  // === Connect a phone number ===
  async connect(phoneNumberId, isManual = false) {
    // Concurrent connection limit — max 3 connecting at once
    const connectingCount = Array.from(this.sessions.values()).filter(s => s.status === 'connecting' || s.status === 'reconnecting').length;
    if (connectingCount >= 5 && !isManual) {
      console.log(`⏳ WAEngine: #${phoneNumberId} waiting — ${connectingCount} already connecting`);
      return null;
    }
    const db = getDb();
    const row = db.prepare('SELECT * FROM phone_numbers WHERE id = ?').get(phoneNumberId);
    if (!row) throw new Error('Phone number not found');

    // If already connected, disconnect first
    if (this.sessions.has(phoneNumberId)) {
      await this.disconnect(phoneNumberId);
    }

    const sessionDir = path.join(SESSIONS_DIR, String(phoneNumberId));
    
    // Check if auth state exists — if not and this is an auto-reconnect (not user-initiated QR scan),
    // skip to avoid endless reconnect loops for numbers that were never QR-scanned
    const hasAuthState = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;
    if (!hasAuthState && !isManual) {
      // Skip auto-reconnect for numbers without session (needs manual QR scan)
      db.prepare("UPDATE phone_numbers SET status = 'inactive' WHERE id = ?").run(phoneNumberId);
      console.log(`⚠️ WAEngine: #${phoneNumberId} no auth + auto-reconnect, skipping`);
      return null;
    }
    
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    // Restore from backup if session dir is empty but backup exists
    const backupDir = path.join(SESSIONS_DIR, `${phoneNumberId}_backup`);
    if (fs.readdirSync(sessionDir).length === 0 && fs.existsSync(backupDir) && fs.readdirSync(backupDir).length > 0) {
      fs.cpSync(backupDir, sessionDir, { recursive: true });
      console.log(`♻️ WAEngine: #${phoneNumberId} restored session from backup (${fs.readdirSync(sessionDir).length} files)`);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sessionData = {
      sock: null,
      qr: null,
      status: 'connecting',
      reconnectAttempts: 0,
    };
    this.sessions.set(phoneNumberId, sessionData);

    // Build proxy agent if number has proxy assigned
    let agent = undefined;
    let proxyInfo = null;
    try {
      const phoneRow = db.prepare('SELECT proxy_id FROM phone_numbers WHERE id = ?').get(phoneNumberId);
      if (phoneRow?.proxy_id) {
        proxyInfo = db.prepare('SELECT * FROM proxies WHERE id = ?').get(phoneRow.proxy_id);
        // If assigned proxy is dead, auto-switch to another active proxy
        if (proxyInfo && proxyInfo.status === 'dead') {
          console.log(`⚠️ WAEngine: #${phoneNumberId} proxy #${proxyInfo.id} (${proxyInfo.host}:${proxyInfo.port}) is dead, finding replacement...`);
          const maxPerProxy = parseInt(this._getSetting('max_numbers_per_proxy') || '2', 10);
          const newProxy = db.prepare("SELECT * FROM (SELECT p.*, (SELECT COUNT(*) FROM phone_numbers pn WHERE pn.proxy_id = p.id) as usage FROM proxies p WHERE p.status = 'active' AND p.id != ?) WHERE usage < ? ORDER BY usage ASC LIMIT 1").get(proxyInfo.id, maxPerProxy);
          if (newProxy) {
            db.prepare('UPDATE phone_numbers SET proxy_id = ? WHERE id = ?').run(newProxy.id, phoneNumberId);
            db.prepare('UPDATE proxies SET assigned_count = (SELECT COUNT(*) FROM phone_numbers WHERE proxy_id = ?) WHERE id = ?').run(newProxy.id, newProxy.id);
            db.prepare('UPDATE proxies SET assigned_count = (SELECT COUNT(*) FROM phone_numbers WHERE proxy_id = ?) WHERE id = ?').run(proxyInfo.id, proxyInfo.id);
            proxyInfo = newProxy;
            console.log(`🔄 WAEngine: #${phoneNumberId} auto-switched to proxy #${newProxy.id} (${newProxy.host}:${newProxy.port})`);
          } else {
            console.log(`❌ WAEngine: #${phoneNumberId} no available proxy — REFUSING connection`);
            db.prepare("UPDATE phone_numbers SET status = ? WHERE id = ?").run("inactive", phoneNumberId);
            return;
          }
        }
        if (proxyInfo && proxyInfo.status === 'active') {
          const auth = proxyInfo.username ? `${proxyInfo.username}:${proxyInfo.password}@` : '';
          if (proxyInfo.type === 'socks5') {
            const proxyUrl = `socks5://${auth}${proxyInfo.host}:${proxyInfo.port}`;
            agent = new SocksProxyAgent(proxyUrl);
            console.log(`🌐 WAEngine: #${phoneNumberId} using SOCKS5 proxy ${proxyInfo.host}:${proxyInfo.port}`);
          } else {
            const proxyUrl = `http://${auth}${proxyInfo.host}:${proxyInfo.port}`;
            agent = new HttpsProxyAgent(proxyUrl);
            console.log(`🌐 WAEngine: #${phoneNumberId} using HTTP proxy ${proxyInfo.host}:${proxyInfo.port}`);
          }
        }
      } else {
        // No proxy assigned — auto-assign (REQUIRED for Indonesia IP)
        const maxPerProxy = parseInt(this._getSetting('max_numbers_per_proxy') || '2', 10);
        const availableProxy = db.prepare("SELECT * FROM (SELECT p.*, (SELECT COUNT(*) FROM phone_numbers pn WHERE pn.proxy_id = p.id) as usage FROM proxies p WHERE p.status = 'active') WHERE usage < ? ORDER BY usage ASC LIMIT 1").get(maxPerProxy);
        if (availableProxy) {
          db.prepare('UPDATE phone_numbers SET proxy_id = ? WHERE id = ?').run(availableProxy.id, phoneNumberId);
          db.prepare('UPDATE proxies SET assigned_count = (SELECT COUNT(*) FROM phone_numbers WHERE proxy_id = ?) WHERE id = ?').run(availableProxy.id, availableProxy.id);
          proxyInfo = availableProxy;
          const auth = proxyInfo.username ? `${proxyInfo.username}:${proxyInfo.password}@` : '';
          if (proxyInfo.type === 'socks5') {
            agent = new SocksProxyAgent(`socks5://${auth}${proxyInfo.host}:${proxyInfo.port}`);
          } else {
            agent = new HttpsProxyAgent(`http://${auth}${proxyInfo.host}:${proxyInfo.port}`);
          }
          console.log(`🌐 WAEngine: #${phoneNumberId} auto-assigned proxy #${availableProxy.id} (${availableProxy.host}:${availableProxy.port})`);
        }
      }
    } catch (proxyErr) {
      console.error(`❌ WAEngine: Proxy setup error for #${phoneNumberId}:`, proxyErr.message);
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.logger,
      printQRInTerminal: false,
      browser: ['WA Backoffice', 'Chrome', '120.0'],
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false,
      ...(agent ? { agent } : {}),
    });

    sessionData.sock = sock;

    // --- QR Timeout: 30s auto-retry if no QR for new connections ---
    if (!hasAuthState) {
      sessionData._qrTimeout = setTimeout(async () => {
        const s = this.sessions.get(phoneNumberId);
        if (s && !s.qr && s.status !== 'active') {
          console.log(`⏰ WAEngine: #${phoneNumberId} QR timeout (30s) — retrying...`);
          try {
            await this.disconnect(phoneNumberId);
            // Small delay before retry
            setTimeout(() => {
              this.connect(phoneNumberId, true).catch(e => {
                console.log(`❌ WAEngine: #${phoneNumberId} QR retry failed: ${e.message}`);
              });
            }, 2000);
          } catch (e) {}
        }
      }, 30000);
    }

    // --- Event: creds.update ---
    sock.ev.on('creds.update', saveCreds);

    // --- Event: connection.update ---
    sock.ev.on('connection.update', (update) => {
      this._handleConnectionUpdate(phoneNumberId, update);
    });

    // --- Event: messages.update (delivery/read receipts) ---
    sock.ev.on('messages.update', (updates) => {
      this._handleMessageStatusUpdates(updates);
    });

    // --- Event: messages.upsert (incoming messages) ---
    // --- Event: message-receipt.update (delivery/read receipts) ---
    sock.ev.on('message-receipt.update', (updates) => {
      for (const { key, receipt } of updates) {
        const jid = (key.remoteJid || '').replace(/[:@].+$/, '');
        const msgId = key.id;
        if (!jid && !msgId) continue;
        const db = getDb();
        
        if (receipt.receiptTimestamp) {
          // Delivered
          const items = db.prepare("SELECT id, sender_number_id FROM blast_queue WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status = 'sent'").all(jid || '', msgId || '');
          if (items.length > 0) {
            db.prepare("UPDATE blast_queue SET status = 'delivered', delivered_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status = 'sent'").run(jid || '', msgId || '');
            console.log('📬 WAEngine: Delivered to ' + jid + ' (' + items.length + ' msgs)');
            for (const item of items) {
              if (item.sender_number_id) this._updateHealthScore(item.sender_number_id, 'delivered');
            }
          }
        }
        
        if (receipt.readTimestamp) {
          // Read
          db.prepare("UPDATE blast_queue SET status = 'read', read_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status IN ('sent', 'delivered')").run(jid || '', msgId || '');
          db.prepare("UPDATE blast_queue SET delivered_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND delivered_at IS NULL AND status = 'read'").run(jid || '', msgId || '');
          console.log('👀 WAEngine: Read by ' + jid);
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (msg.key.fromMe) continue;
        this._handleIncomingMessage(phoneNumberId, msg);
      }
    });

    db.prepare("UPDATE phone_numbers SET status = 'qr_pending' WHERE id = ?").run(phoneNumberId);
    return sessionData;
  }

  // === Handle connection updates ===
  _handleConnectionUpdate(phoneNumberId, update) {
    const db = getDb();
    const session = this.sessions.get(phoneNumberId);
    if (!session) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      session.qr = qr;
      session.status = 'qr_pending';
      session._hadQR = true;
      if (session._qrTimeout) { clearTimeout(session._qrTimeout); session._qrTimeout = null; }
      console.log(`📱 WAEngine: #${phoneNumberId} QR code generated — scan now!`);
      try { db.prepare("UPDATE phone_numbers SET status = 'qr_pending' WHERE id = ?").run(phoneNumberId); } catch (e) {}
    }

    if (connection === 'open') {
      session.qr = null;
      session.reconnectAttempts = 0;
      if (session._qrTimeout) { clearTimeout(session._qrTimeout); session._qrTimeout = null; }
      // Don't override banned status
      const curRow = db.prepare('SELECT status FROM phone_numbers WHERE id = ?').get(phoneNumberId);
      if (curRow && curRow.status === 'banned') {
        console.log(`⛔ WAEngine: #${phoneNumberId} is banned, disconnecting`);
        session.status = 'banned';
        try { sock.logout(); } catch(e) {}
        try { sock.end(); } catch(e) {}
        return;
      }
      session.status = 'active';
      try {
        db.prepare("UPDATE phone_numbers SET status = 'active', connected_at = datetime('now', 'localtime') WHERE id = ?").run(phoneNumberId);
      } catch (e) {}
      // Lookup connection IP and geo info
      this._updateConnectionIP(phoneNumberId);

      // Auto-sync: update DB number to match actual WA number from session
      try {
        // Try sock.user first, fallback to creds.json
        let waId = session.sock?.user?.id;
        if (!waId) {
          const credsPath = path.join(SESSIONS_DIR, String(phoneNumberId), 'creds.json');
          if (fs.existsSync(credsPath)) {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
            waId = creds?.me?.id;
          }
        }
        if (waId) {
          const waNumber = '+' + waId.split(':')[0].replace(/[^0-9]/g, '');
          const dbRow = db.prepare('SELECT number FROM phone_numbers WHERE id = ?').get(phoneNumberId);
          if (dbRow && dbRow.number !== waNumber) {
            db.prepare('UPDATE phone_numbers SET number = ? WHERE id = ?').run(waNumber, phoneNumberId);
            console.log(`🔄 WAEngine: #${phoneNumberId} number synced: ${dbRow.number} → ${waNumber}`);
          }
        }
      } catch (e) {
        console.error(`⚠️ WAEngine: #${phoneNumberId} number sync failed:`, e.message);
      }

      console.log(`✅ WAEngine: #${phoneNumberId} connected`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason;
      const reasonMsg = lastDisconnect?.error?.output?.payload?.message || lastDisconnect?.error?.message || 'unknown';
      console.log(`🔌 WAEngine: #${phoneNumberId} disconnected — code: ${statusCode}, reason: ${reasonMsg}`);
      
      // === BANNED: only 403 (forbidden) is a real ban ===
      if (statusCode === 403) {
        console.log(`⛔ WAEngine: #${phoneNumberId} BANNED (code 403 forbidden)`);
        session.status = 'banned';
        try { db.prepare("UPDATE phone_numbers SET status = 'banned' WHERE id = ?").run(phoneNumberId); } catch (e) {}
        const sessPath = require('path').join(__dirname, 'sessions', String(phoneNumberId));
        try { require('fs').rmSync(sessPath, { recursive: true, force: true }); } catch (e) {}
        return;
      }

      // === LOGGED OUT: 401 = session expired, need new QR (NOT banned) ===
      if (statusCode === 401 || statusCode === reason.loggedOut) {
        console.log(`🔑 WAEngine: #${phoneNumberId} logged out (code ${statusCode}) — needs new QR scan`);
        session.status = 'disconnected';
        session.qr = null;
        const row = db.prepare('SELECT number FROM phone_numbers WHERE id = ?').get(phoneNumberId);
        const phoneLabel = row?.number ? `+${row.number}` : `#${phoneNumberId}`;
        try {
          db.prepare("UPDATE phone_numbers SET status = 'disconnected' WHERE id = ?").run(phoneNumberId);
          db.prepare("INSERT INTO alerts (type, message) VALUES ('logout', ?)").run(`Number ${phoneLabel} logged out — needs QR rescan`);
        } catch (e) {}
        // Record ban in campaign_number_stats for any active campaigns
        try {
          db.prepare("UPDATE campaign_number_stats SET ended_at = datetime('now', 'localtime'), end_reason = 'banned' WHERE phone_number_id = ? AND end_reason IS NULL").run(phoneNumberId);
        } catch (e) {}
        // Auto-pause campaigns if ALL sender numbers are now inactive
        this._checkAutoPauseCampaigns(phoneNumberId);
        // Notify N8N ban alert webhook
        this._notifyN8N('n8n_ban_webhook_url', {
          phone: phoneLabel,
          phoneNumberId,
          reason: statusCode === 401 ? 'Logged out (401)' : 'Disconnected/Banned',
          timestamp: new Date().toISOString(),
        });
        // Clean auth state so next connect requires new QR
        const sessionDir = path.join(SESSIONS_DIR, String(phoneNumberId));
        try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch (e) {}
        this.sessions.delete(phoneNumberId);
        console.log(`🚫 WAEngine: #${phoneNumberId} logged out/banned`);
        return;
      }

      // Reconnect logic
      if (session.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        session.reconnectAttempts++;
        session.status = 'reconnecting';
        
        // If never got QR (new number, proxy issue), rotate proxy before retry
        const hasAuth = fs.existsSync(path.join(SESSIONS_DIR, String(phoneNumberId))) && 
                        fs.readdirSync(path.join(SESSIONS_DIR, String(phoneNumberId))).length > 0;
        if (!hasAuth && !session._hadQR) {
          this._rotateProxy(phoneNumberId);
        }
        
        console.log(`🔄 WAEngine: #${phoneNumberId} reconnecting (attempt ${session.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        setTimeout(() => {
          this.connect(phoneNumberId, !hasAuth).catch(err => {
            console.error(`❌ WAEngine: Reconnect failed for #${phoneNumberId}:`, err.message);
          });
        }, 10000 * session.reconnectAttempts); // 10s, 20s, 30s between retries
      } else {
        session.status = 'inactive';
        session.qr = null;
        try {
          db.prepare("UPDATE phone_numbers SET status = 'inactive' WHERE id = ?").run(phoneNumberId);
          db.prepare("INSERT INTO alerts (type, message) VALUES ('disconnect', ?)").run(`Phone #${phoneNumberId} disconnected after ${MAX_RECONNECT_ATTEMPTS} reconnect attempts`);
          db.prepare("UPDATE campaign_number_stats SET ended_at = datetime('now', 'localtime'), end_reason = 'disconnected' WHERE phone_number_id = ? AND end_reason IS NULL").run(phoneNumberId);
        } catch (e) {}
        // Keep session in memory but stop reconnecting — session files preserved for manual reconnect
        this.sessions.delete(phoneNumberId);
        console.log(`❌ WAEngine: #${phoneNumberId} gave up reconnecting (session files preserved, click Connect to retry)`);
      }
    }
  }

  // === Handle incoming messages ===
  _handleIncomingMessage(phoneNumberId, msg) {
    const db = getDb();
    const fromNumber = msg.key.remoteJid?.replace('@s.whatsapp.net', '').replace('@g.us', '') || '';
    const row = db.prepare('SELECT number FROM phone_numbers WHERE id = ?').get(phoneNumberId);
    const toNumber = row?.number || '';
    const body = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption
      || '[media]';

    // Auto-save pushName (WA profile name) to contacts table
    const pushName = msg.pushName || '';
    if (pushName && fromNumber) {
      try {
        const cleanPhone = fromNumber.replace(/[^0-9]/g, '');
        const existing = db.prepare('SELECT id, name FROM contacts WHERE phone LIKE ?').get(`%${cleanPhone.slice(-10)}`);
        if (existing && !existing.name) {
          db.prepare('UPDATE contacts SET name = ? WHERE id = ?').run(pushName, existing.id);
          console.log(`📇 WAEngine: Saved pushName "${pushName}" for ${cleanPhone}`);
        } else if (!existing) {
          // Save to a global contacts pool (list_id = 0 for auto-collected)
          db.prepare('INSERT OR IGNORE INTO contacts (list_id, phone, name) VALUES (0, ?, ?)').run('+' + cleanPhone, pushName);
          console.log(`📇 WAEngine: New contact "${pushName}" (${cleanPhone})`);
        }
      } catch (e) {}
    }

    try {
      db.prepare('INSERT INTO replies (from_number, to_number, message) VALUES (?, ?, ?)').run(fromNumber, toNumber, body);
      // Boost health score for receiving a reply
      this._updateHealthScore(phoneNumberId, 'reply_received');
    } catch (e) {
      console.error('❌ WAEngine: Failed to save reply:', e.message);
    }

    // === Built-in Auto-Reply (pass full remoteJid for @lid support) ===
    this._processAutoReply(phoneNumberId, msg.key.remoteJid, body).catch(err => {
      console.error('❌ WAEngine: Auto-reply error:', err.message);
    });

    // POST to N8N webhook (for logging/notifications)
    this._notifyN8N('n8n_reply_webhook_url', {
      from: fromNumber,
      to: toNumber,
      message: body,
      phoneNumberId,
      sessionId: phoneNumberId,
      timestamp: new Date().toISOString(),
    });
  }

  // === Process Auto-Reply rules ===
  // Anti-spam cooldown cache: Map<remoteJid, timestamp>
  _autoReplyCooldowns = new Map();

  async _processAutoReply(phoneNumberId, remoteJid, messageBody) {
    if (!messageBody || messageBody === '[media]') return;
    // Skip status broadcasts and group chats
    if (remoteJid === 'status@broadcast' || remoteJid?.endsWith('@g.us')) return;

    // Skip internal/breeding numbers (save AI tokens)
    const db = getDb();
    const ownNumbers = db.prepare('SELECT number FROM phone_numbers').all().map(r => r.number.replace('+', ''));
    const senderNum = remoteJid?.replace(/@.+$/, '') || '';
    if (ownNumbers.some(n => senderNum === n || senderNum.endsWith(n) || n.endsWith(senderNum))) {
      return;
    }

    console.log('\u{1f4e9} WAEngine: External msg from ' + remoteJid + ': ' + messageBody.substring(0, 50));

    // Check global auto-reply toggle
    const globalSetting = db.prepare("SELECT value FROM settings WHERE key = 'auto_reply_enabled'").get();
    if (globalSetting && (globalSetting.value === '0' || globalSetting.value === 'false')) return;

    // Anti-spam: check cooldown (default 24h per number)
    const cooldownMs = parseInt(this._getSetting('auto_reply_cooldown_hours') || '1', 10) * 3600000;
    const lastReply = this._autoReplyCooldowns.get(remoteJid);
    if (lastReply && (Date.now() - lastReply) < cooldownMs) {
      return; // Already replied within cooldown, skip silently
    }

    // === Layer 1: Keyword-based rules (free, instant) ===
    const rules = db.prepare('SELECT * FROM auto_reply_rules WHERE is_active = 1 ORDER BY priority DESC, id ASC').all();
    const msgLower = messageBody.toLowerCase().trim();

    for (const rule of rules) {
      const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase());
      let matched = false;

      for (const kw of keywords) {
        if (!kw) continue;
        switch (rule.match_type) {
          case 'exact':
            matched = msgLower === kw;
            break;
          case 'startswith':
            matched = msgLower.startsWith(kw);
            break;
          case 'regex':
            try { matched = new RegExp(kw, 'i').test(messageBody); } catch (e) { matched = false; }
            break;
          case 'contains':
          default:
            matched = msgLower.includes(kw);
            break;
        }
        if (matched) break;
      }

      if (matched) {
        console.log(`🤖 WAEngine: Auto-reply matched rule #${rule.id} ("${rule.keyword}") for ${remoteJid}`);
        try { db.prepare('UPDATE auto_reply_rules SET hit_count = hit_count + 1 WHERE id = ?').run(rule.id); } catch (e) {}

        if (rule.action === 'reply' && rule.response_text) {
          await this._sendAutoReply(phoneNumberId, remoteJid, rule.response_text);
        } else if (rule.action === 'blacklist') {
          const cleanNumber = remoteJid.replace(/@.+$/, '');
          try {
            db.prepare('INSERT OR IGNORE INTO blacklist (phone) VALUES (?)').run(cleanNumber);
            console.log(`🚫 WAEngine: Auto-blacklisted ${cleanNumber} via rule #${rule.id}`);
          } catch (e) {}
        }
        return; // First match wins
      }
    }

    // === Layer 2: AI Sentiment Detection (if enabled + API key configured) ===
    // Skip AI if this number is currently in an active breeding session
    const breedingSessions = db.prepare("SELECT number_ids FROM breeding_sessions WHERE status = 'running'").all();
    const isBreeding = breedingSessions.some(s => {
      try { return JSON.parse(s.number_ids).includes(phoneNumberId); } catch(e) { return false; }
    });
    if (isBreeding) {
      console.log('⏭️ WAEngine: Skipping AI for #' + phoneNumberId + ' (breeding active)');
      return;
    }

    const aiEnabled = this._getSetting('auto_reply_ai_enabled');
    const aiApiKey = this._getSetting('openai_api_key');
    if (aiEnabled === '1' && aiApiKey) {
      await this._processAISentiment(phoneNumberId, remoteJid, messageBody, aiApiKey);
    }
  }

  // === Send auto-reply with cooldown tracking ===
  async _sendAutoReply(phoneNumberId, remoteJid, replyText) {
    const session = this.sessions.get(phoneNumberId);
    if (!session?.sock || session.status !== 'active') {
      console.log(`❌ WAEngine: Auto-reply skipped, session #${phoneNumberId} not active`);
      return;
    }

    // Natural delay 1-3 seconds
    const replyDelay = 1000 + Math.random() * 2000;
    await delay(replyDelay);

    try {
      await session.sock.sendMessage(remoteJid, { text: replyText });
      this._autoReplyCooldowns.set(remoteJid, Date.now());
      console.log(`✅ WAEngine: Auto-replied to ${remoteJid}`);
    } catch (sendErr) {
      console.log(`❌ WAEngine: Auto-reply send failed to ${remoteJid}:`, sendErr.message);
    }
  }

  // AI rate limit tracking
  _aiCallsThisHour = [];

  // === AI Sentiment Analysis via OpenAI ===
  async _processAISentiment(phoneNumberId, remoteJid, messageBody, apiKey) {
    try {
      // Rate limit: max N calls per hour
      const maxPerHour = parseInt(this._getSetting('ai_max_calls_per_hour') || '20', 10);
      const now = Date.now();
      this._aiCallsThisHour = this._aiCallsThisHour.filter(t => now - t < 3600000);
      if (this._aiCallsThisHour.length >= maxPerHour) {
        console.log(`⚠️ WAEngine: AI rate limit hit (${maxPerHour}/hr), skipping sentiment for ${remoteJid}`);
        return;
      }
      this._aiCallsThisHour.push(now);

      // Get promo/product info from settings for lobby/upsell
      const db = getDb();
      const promoText = this._getSetting('ai_promo_text') || '';
      const brandName = this._getSetting('ai_brand_name') || 'kami';
      const aiTone = this._getSetting('ai_tone') || 'friendly, informal, pakai bahasa Indonesia sehari-hari';

      let promoInstruction = '';
      if (promoText) {
        promoInstruction = `
- Jika marah/kecewa: SETELAH comfort & minta maaf, soft-sell tawarin promo berikut sebagai "permintaan maaf":
  "${promoText}"
  Jangan terlalu pushy, buat natural seperti teman yang nawarin.
- Jika bingung/tanya info: jawab helpful, lalu sisipkan info promo jika relevan.
- Jika senang: balas friendly, bisa mention promo secara casual.`;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 200,
          temperature: 0.7,
          messages: [
            {
              role: 'system',
              content: `Kamu adalah customer service WhatsApp untuk ${brandName}.
Tone: ${aiTone}

Analisa pesan customer dan tentukan:
1. sentiment: "marah", "kecewa", "bingung", "senang", "netral"
2. needs_reply: true/false (false jika pesan netral/spam/tidak perlu dibalas)
3. reply: string balasan (dalam Bahasa Indonesia)

Rules:
- Jika marah/kecewa: balas dengan empati, minta maaf, tawarkan bantuan${promoInstruction ? '' : ''}
- Jika bingung: balas dengan helpful, kasih arahan
- Jika senang: balas friendly singkat
- Jika sapaan/greeting (halo, bosku, min, bang, dll): needs_reply = true, balas ramah dan tanya ada yang bisa dibantu
- Jika tanya/request apapun (link, info, cara, dll): needs_reply = true, jawab helpful
- SELALU needs_reply = true KECUALI pesan benar-benar spam/random/tidak bermakna (contoh: "asjkdhf", "...", angka random)
- Default: needs_reply = true
${promoInstruction}

PENTING: Reply harus natural seperti chat WA biasa, JANGAN kaku/formal. Pakai emoji secukupnya.
Reply dalam JSON format: {"sentiment":"...","needs_reply":true/false,"reply":"..."}`
            },
            { role: 'user', content: messageBody }
          ]
        })
      });

      if (!response.ok) {
        console.log(`⚠️ WAEngine: AI sentiment API error: ${response.status}`);
        return;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Parse JSON response
      let result;
      try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch (e) {
        console.log(`⚠️ WAEngine: AI response parse error:`, content);
        return;
      }

      console.log(`🧠 WAEngine: AI sentiment for ${remoteJid}: ${result.sentiment} (needs_reply: ${result.needs_reply})`);

      // Track AI usage
      try {
        const db = getDb();
        const tokens = (data.usage?.total_tokens || 0);
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_tokens_today', CAST(COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'ai_tokens_today'), 0) + ? AS TEXT))").run(tokens);
      } catch (e) {}

      if (result.needs_reply && result.reply) {
        await this._sendAutoReply(phoneNumberId, remoteJid, result.reply);
      }
    } catch (err) {
      console.log(`⚠️ WAEngine: AI sentiment error:`, err.message);
    }
  }

  // === Disconnect ===
  async disconnect(phoneNumberId) {
    const db = getDb();
    const session = this.sessions.get(phoneNumberId);
    
    // Backup session files before disconnect (safety net — never lose auth)
    const sessDir = path.join(SESSIONS_DIR, String(phoneNumberId));
    const backupDir = path.join(SESSIONS_DIR, `${phoneNumberId}_backup`);
    try {
      if (fs.existsSync(sessDir) && fs.readdirSync(sessDir).length > 0) {
        if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
        fs.cpSync(sessDir, backupDir, { recursive: true });
      }
    } catch (e) {}
    
    if (session?.sock) {
      try { session.sock.end(); } catch (e) {}
    }
    this.sessions.delete(phoneNumberId);
    try { db.prepare("UPDATE phone_numbers SET status = 'inactive' WHERE id = ?").run(phoneNumberId); } catch (e) {}
  }

  // === Reconnect ===
  async reconnect(phoneNumberId) {
    await this.disconnect(phoneNumberId);
    return this.connect(phoneNumberId);
  }

  // === Get QR ===

  // === Auto-rotate proxy on connect failure ===
  _rotateProxy(phoneNumberId) {
    const db = getDb();
    const row = db.prepare('SELECT proxy_id FROM phone_numbers WHERE id = ?').get(phoneNumberId);
    const currentProxyId = row?.proxy_id;
    
    // Get all active socks5 proxies, excluding current
    const proxies = db.prepare("SELECT id FROM proxies WHERE status = 'active' AND type = 'socks5' AND id != ? ORDER BY RANDOM() LIMIT 1").all(currentProxyId || 0);
    
    if (proxies.length > 0) {
      const newProxy = proxies[0].id;
      db.prepare('UPDATE phone_numbers SET proxy_id = ? WHERE id = ?').run(newProxy, phoneNumberId);
      console.log(`🔄 WAEngine: #${phoneNumberId} proxy rotated: #${currentProxyId} → #${newProxy}`);
      return true;
    }
    console.log(`⚠️ WAEngine: #${phoneNumberId} no alternative proxy available`);
    return false;
  }

  getQR(phoneNumberId) {
    const session = this.sessions.get(phoneNumberId);
    return session?.qr || null;
  }

  // === Get Status ===
  getStatus(phoneNumberId) {
    const session = this.sessions.get(phoneNumberId);
    return session?.status || 'disconnected';
  }

  // === Send Message ===
  async sendMessage(phoneNumberId, targetPhone, message, media) {
    const session = this.sessions.get(phoneNumberId);
    if (!session?.sock) return { success: false, error: 'Session not connected' };
    if (session.status !== 'active') return { success: false, error: `Session status: ${session.status}` };

    const db = getDb();

    // Check blacklist
    const blacklisted = db.prepare('SELECT id FROM blacklist WHERE phone = ?').get(targetPhone);
    if (blacklisted) return { success: false, error: 'Number is blacklisted' };

    // Rate limit enforcement
    const maxPerHour = parseInt(this._getSetting('max_messages_per_hour') || '200', 10);
    const maxPerDay = parseInt(this._getSetting('max_messages_per_day') || '1000', 10);
    const sentLastHour = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE sender_number_id = ? AND status = 'sent' AND sent_at > datetime('now', 'localtime', '-1 hour')").get(phoneNumberId);
    if (sentLastHour.c >= maxPerHour) return { success: false, error: 'Hourly rate limit exceeded' };
    const sentLastDay = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE sender_number_id = ? AND status = 'sent' AND sent_at > datetime('now', 'localtime', '-24 hours')").get(phoneNumberId);
    if (sentLastDay.c >= maxPerDay) return { success: false, error: 'Daily rate limit exceeded' };

    const jid = targetPhone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

    try {
      // Typing simulation
      const typingSetting = this._getSetting('typing_simulation');
      if (typingSetting === '1' || typingSetting === 'true') {
        await session.sock.presenceSubscribe(jid);
        await session.sock.sendPresenceUpdate('composing', jid);
        await delay(1500 + Math.random() * 2000);
        await session.sock.sendPresenceUpdate('paused', jid);
      }

      let msgContent;
      if (media) {
        const mediaType = media.mime_type || media.mimeType || '';
        if (mediaType.startsWith('image/')) {
          msgContent = { image: { url: media.path || media.url }, caption: message || '' };
        } else if (mediaType.startsWith('video/')) {
          msgContent = { video: { url: media.path || media.url }, caption: message || '' };
        } else {
          msgContent = { document: { url: media.path || media.url }, mimetype: mediaType, fileName: media.filename || media.original_name || 'file', caption: message || '' };
        }
      } else {
        msgContent = { text: message };
      }

      const result = await session.sock.sendMessage(jid, msgContent);
      return { success: true, messageId: result?.key?.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // === Send Bulk (Campaign Blast) ===
  async sendBulk(campaignId) {
    const db = getDb();
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    if (campaign.status !== 'running') throw new Error('Campaign is not in running state');

    // Check if already running
    if (this._bulkRunning.has(campaignId)) throw new Error('Campaign blast already in progress');

    const abortState = { running: true };
    this._bulkRunning.set(campaignId, abortState);

    // Get template
    const template = campaign.template_id
      ? db.prepare('SELECT * FROM templates WHERE id = ?').get(campaign.template_id)
      : null;

    // Get media: campaign-level media takes priority, then template media
    let media = null;
    if (campaign.media_url) {
      media = { path: path.join(__dirname, '..', campaign.media_url), mime_type: campaign.media_type, original_name: path.basename(campaign.media_url) };
    } else if (template?.media_id) {
      const templateMedia = db.prepare('SELECT * FROM media WHERE id = ?').get(template.media_id);
      if (templateMedia) media = templateMedia;
    }

    // Interactive message config
    let interactiveType = campaign.interactive_type || 'none';
    let interactiveData = null;
    try { interactiveData = campaign.interactive_data ? JSON.parse(campaign.interactive_data) : null; } catch (e) {}
    // Fallback to template interactive if campaign has none
    if (interactiveType === 'none' && template) {
      const tplInterType = template.interactive_type || 'none';
      if (tplInterType !== 'none') {
        interactiveType = tplInterType;
        try { interactiveData = template.interactive_data ? JSON.parse(template.interactive_data) : null; } catch (e) {}
      }
    }
    const _origInteractiveData = interactiveData ? JSON.parse(JSON.stringify(interactiveData)) : null;

    // Settings
    const maxPerHour = parseInt(this._getSetting('max_messages_per_hour') || '200', 10);
    const delayMin = (campaign.delay_min || 5) * 1000;
    const delayMax = (campaign.delay_max || 15) * 1000;

    try {
      // Get all sender phone numbers to skip them from targets
      const senderNumbers = db.prepare("SELECT number FROM phone_numbers").all().map(r => r.number.replace(/[^0-9]/g, ''));

      // Process pending queue items
      const pending = db.prepare("SELECT * FROM blast_queue WHERE campaign_id = ? AND status = 'pending' ORDER BY id ASC").all(campaignId);
      if (!pending.length) {
        db.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(campaignId);
        this._bulkRunning.delete(campaignId);
        return { sent: 0, failed: 0, total: 0 };
      }

      const campaignNumberIds = JSON.parse(campaign.numbers_used || '[]').map(Number).filter(Boolean);
      let sent = 0, failed = 0;
      const hourStart = Date.now();
      let hourCount = 0;

      for (const item of pending) {
        // Check abort / pause
        if (!abortState.running) break;
        const freshCampaign = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
        if (freshCampaign?.status === 'paused' || freshCampaign?.status === 'draft') break;

        // Skip sender numbers from targets
        const targetClean = item.target_phone.replace(/[^0-9]/g, '');
        if (senderNumbers.some(s => s === targetClean || targetClean.endsWith(s) || s.endsWith(targetClean))) {
          db.prepare("UPDATE blast_queue SET status = 'skipped', error = 'Target is a sender number' WHERE id = ?").run(item.id);
          continue;
        }

        // Rate limit per hour
        if (Date.now() - hourStart < 3600000 && hourCount >= maxPerHour) {
          const waitMs = 3600000 - (Date.now() - hourStart);
          console.log(`⏳ WAEngine: Rate limit hit for campaign #${campaignId}, waiting ${Math.round(waitMs / 1000)}s`);
          await delay(waitMs);
          hourCount = 0;
        }

        // Pick sender — respect cooldown, restrict to campaign's selected numbers
        let sender = this._pickSender(item.sender_number_id, campaignNumberIds);
        if (!sender) {
          console.log('⏳ WAEngine: No sender for campaign #' + campaignId + ', waiting 30s...');
          await delay(30000);
          sender = this._pickSender(item.sender_number_id, campaignNumberIds);
          if (!sender) {
            console.log('❌ WAEngine: Still no sender, skipping item #' + item.id);
            continue; // Keep as pending, don't mark failed
          }
        }

        // Resolve message content (with spin variants and variables)
        // Use campaign.message as direct content when no template is selected
        // Look up contact info for variable substitution
        const contactInfo = db.prepare('SELECT name, vars FROM contacts WHERE phone = ? OR phone LIKE ?').get(item.target_phone, '%' + item.target_phone.replace(/[^0-9]/g, '').slice(-10));
        let messageText = template
          ? this._resolveTemplate(template, item.target_phone, contactInfo)
          : this._resolveDirectMessage(campaign.message || '', item.target_phone, contactInfo);

        // Skip if no message content
        if (!messageText || messageText.trim() === '') {
          console.log('⚠️ WAEngine: Empty message for campaign #' + campaignId + ' item #' + item.id + ', skipping');
          db.prepare("UPDATE blast_queue SET status = 'failed', error = 'No message content - check template/message' WHERE id = ?").run(item.id);
          failed++;
          continue;
        }

        // Wrap links for tracking (body text + button URLs)
        try {
          messageText = wrapLinks(messageText, campaignId, item.id, item.target_phone);
          // Also wrap URLs inside interactive button values — clone from ORIGINAL each time
          let itemInteractiveData = _origInteractiveData ? JSON.parse(JSON.stringify(_origInteractiveData)) : interactiveData;
          if (itemInteractiveData && itemInteractiveData.buttons) {
            for (const btn of itemInteractiveData.buttons) {
              if (btn.type === 'url' && btn.value && btn.value.startsWith('http')) {
                btn.value = wrapLinks(btn.value, campaignId, item.id, item.target_phone);
              }
            }
          }
        } catch (e) {
          console.error('❌ WAEngine: Link wrapping error:', e.message);
        }

        // Convert interactive buttons to plain text (relayMessage is unreliable)
        let result;
        if (interactiveType !== 'none' && itemInteractiveData && itemInteractiveData.buttons && itemInteractiveData.buttons.length > 0) {
          let btnText = '';
          for (const btn of itemInteractiveData.buttons) {
            if (btn.type === 'url' && btn.value) {
              btnText += '\n\n🔗 ' + btn.text + '\n' + btn.value;
            } else if (btn.type === 'call' && btn.value) {
              btnText += '\n\n📞 ' + btn.text + ': ' + btn.value;
            } else if (btn.type === 'quick_reply') {
              btnText += '\n\n▶️ ' + btn.text;
            }
          }
          messageText = (messageText || '') + btnText;
          result = await this.sendMessage(sender.id, item.target_phone, messageText, media ? { path: media.path || path.join(__dirname, '..', media.path), mime_type: media.mime_type, original_name: media.original_name } : null);
        } else {
          result = await this.sendMessage(sender.id, item.target_phone, messageText, media ? { path: media.path || path.join(__dirname, '..', media.path), mime_type: media.mime_type, original_name: media.original_name } : null);
        }

        if (result.success) {
          db.prepare("UPDATE blast_queue SET status = 'sent', sent_at = datetime('now', 'localtime'), wa_message_id = ? WHERE id = ?").run(result.messageId || null, item.id);
          db.prepare('UPDATE phone_numbers SET total_sent = total_sent + 1 WHERE id = ?').run(sender.id);
          this._updateHealthScore(sender.id, 'send_success');
          this._trackCampaignNumberStat(campaignId, sender.id, 'sent');
          sent++;
          hourCount++;
        } else {
          db.prepare("UPDATE blast_queue SET status = 'failed', error = ? WHERE id = ?").run(result.error, item.id);
          db.prepare('UPDATE phone_numbers SET total_failed = total_failed + 1 WHERE id = ?').run(sender.id);
          this._updateHealthScore(sender.id, 'send_failed');
          this._trackCampaignNumberStat(campaignId, sender.id, 'failed');
          failed++;

          // Auto-flag dead/invalid numbers
          const errMsg = (result.error || '').toLowerCase();
          if (errMsg.includes('not registered') || errMsg.includes('not on whatsapp') || errMsg.includes('408') || errMsg.includes('428') || errMsg.includes('not-found') || errMsg.includes('jid not found')) {
            try {
              db.prepare("UPDATE contacts SET is_valid = 0 WHERE phone = ?").run(item.target_phone);
            } catch (e2) {}
          }

          // Alert on error
          try {
            db.prepare("INSERT INTO alerts (type, message) VALUES ('blast_error', ?)").run(`Campaign #${campaignId}: Failed to send to ${item.target_phone} via #${sender.id}: ${result.error}`);
          } catch (e) {}
        }

        // Delay between messages
        const msgDelay = delayMin + Math.random() * (delayMax - delayMin);
        await delay(msgDelay);
      }

      // Check if all done
      const remaining = db.prepare("SELECT COUNT(*) as c FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").get(campaignId);
      if (remaining.c === 0) {
        db.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(campaignId);
        // Mark surviving numbers as completed
        try {
          db.prepare("UPDATE campaign_number_stats SET ended_at = datetime('now', 'localtime'), end_reason = 'completed' WHERE campaign_id = ? AND end_reason IS NULL").run(campaignId);
        } catch (e) {}
      }

      // Set cooldown on used numbers
      const cooldownMinutes = parseInt(this._getSetting('cooldown_minutes') || '30', 10);
      const usedNumbers = db.prepare("SELECT DISTINCT sender_number_id FROM blast_queue WHERE campaign_id = ? AND status = 'sent'").all(campaignId);
      for (const un of usedNumbers) {
        db.prepare("UPDATE phone_numbers SET cooldown_until = datetime('now', 'localtime', '+' || ? || ' minutes') WHERE id = ?").run(cooldownMinutes, un.sender_number_id);
      }

      // If there are still pending items and campaign is running, retry after 60s
      if (remaining.c > 0) {
        const freshStatus = db.prepare('SELECT status FROM campaigns WHERE id = ?').get(campaignId);
        if (freshStatus?.status === 'running') {
          console.log('🔄 WAEngine: Campaign #' + campaignId + ' has ' + remaining.c + ' pending items, retrying in 60s...');
          setTimeout(() => {
            this.sendBulk(campaignId).then(stats => {
              console.log('✅ Campaign #' + campaignId + ' retry complete:', stats);
            }).catch(err => {
              console.error('❌ Campaign #' + campaignId + ' retry error:', err.message);
            });
          }, 60000);
        }
      }

      this._bulkRunning.delete(campaignId);
      return { sent, failed, total: pending.length };
    } catch (err) {
      this._bulkRunning.delete(campaignId);
      throw err;
    }
  }

  // === Pick an available sender (weighted random by health_score) ===
  _pickSender(preferredId, allowedIds) {
    const db = getDb();

    // Get all available numbers, filtered by campaign's selected numbers
    const cooldownEnabled = db.prepare("SELECT value FROM settings WHERE key = 'auto_cooldown_enabled'").get();
    const skipCooldown = cooldownEnabled?.value === 'false';
    const allActive = skipCooldown
      ? db.prepare("SELECT * FROM phone_numbers WHERE status = 'active'").all()
      : db.prepare("SELECT * FROM phone_numbers WHERE status = 'active' AND (cooldown_until IS NULL OR cooldown_until < datetime('now', 'localtime'))").all();
    let available = allActive.filter(n => this.sessions.has(n.id) && this.sessions.get(n.id).status === 'active');
    console.log(`📋 _pickSender: DB active=${allActive.map(n=>n.id)}, WA connected=${available.map(n=>n.id)}, allowed=${allowedIds||'all'}, preferred=${preferredId}`);
    // Restrict to allowed numbers if specified
    if (allowedIds && allowedIds.length > 0) {
      available = available.filter(n => allowedIds.includes(n.id));
    }

    if (!available.length) return null;

    // If preferred is available, give it a chance but still use weighted selection
    if (preferredId) {
      const preferred = available.find(n => n.id === preferredId);
      if (preferred && preferred.health_score >= 20) return preferred;
    }

    // Weighted random selection based on health_score
    const totalWeight = available.reduce((sum, n) => sum + Math.max(n.health_score, 1), 0);
    let random = Math.random() * totalWeight;
    for (const num of available) {
      random -= Math.max(num.health_score, 1);
      if (random <= 0) return num;
    }
    return available[0];
  }

  // === Update health score after send result ===
  _updateHealthScore(phoneNumberId, event) {
    const db = getDb();
    const row = db.prepare('SELECT health_score, status FROM phone_numbers WHERE id = ?').get(phoneNumberId);
    if (!row) return;

    let delta = 0;
    switch (event) {
      case 'send_success': delta = 1; break;
      case 'send_failed': delta = -5; break;
      case 'no_delivery': delta = -2; break;
      case 'reported': delta = -20; break;
      case 'reply_received': delta = 3; break;
      case 'delivered': delta = 1; break;
    }

    const newScore = Math.max(0, Math.min(100, row.health_score + delta));
    db.prepare('UPDATE phone_numbers SET health_score = ? WHERE id = ?').run(newScore, phoneNumberId);

    // Auto-clear cooldown if health recovered above 50
    if (newScore >= 50 && row.health_score < 50) {
      db.prepare("UPDATE phone_numbers SET cooldown_until = NULL WHERE id = ? AND cooldown_until IS NOT NULL").run(phoneNumberId);
      console.log(`♻️ WAEngine: #${phoneNumberId} cooldown cleared (health recovered to ${newScore})`);
    }

    // Auto-pause if health drops below 20 (only if cooldown enabled)
    const cooldownSetting = db.prepare("SELECT value FROM settings WHERE key = 'auto_cooldown_enabled'").get();
    if (newScore < 20 && row.status === 'active' && cooldownSetting?.value !== 'false') {
      db.prepare("UPDATE phone_numbers SET status = 'cooling', cooldown_until = datetime('now', 'localtime', '+24 hours') WHERE id = ?").run(phoneNumberId);
      try {
        db.prepare("INSERT INTO alerts (type, message) VALUES ('health', ?)").run(`Phone #${phoneNumberId} auto-paused (health: ${newScore})`);
      } catch (e) {}
      console.log(`⚠️ WAEngine: #${phoneNumberId} auto-paused, health=${newScore}`);
    }
  }

  // === Track per-number stats for a campaign ===
  _trackCampaignNumberStat(campaignId, phoneNumberId, event) {
    try {
      const db = getDb();
      // Upsert: create row if not exists, then increment
      db.prepare(`
        INSERT INTO campaign_number_stats (campaign_id, phone_number_id, messages_sent, messages_failed, started_at)
        VALUES (?, ?, 0, 0, datetime('now', 'localtime'))
        ON CONFLICT(campaign_id, phone_number_id) DO NOTHING
      `).run(campaignId, phoneNumberId);

      if (event === 'sent') {
        db.prepare('UPDATE campaign_number_stats SET messages_sent = messages_sent + 1 WHERE campaign_id = ? AND phone_number_id = ?').run(campaignId, phoneNumberId);
      } else if (event === 'failed') {
        db.prepare('UPDATE campaign_number_stats SET messages_failed = messages_failed + 1 WHERE campaign_id = ? AND phone_number_id = ?').run(campaignId, phoneNumberId);
      } else if (event === 'delivered') {
        db.prepare('UPDATE campaign_number_stats SET messages_delivered = messages_delivered + 1 WHERE campaign_id = ? AND phone_number_id = ?').run(campaignId, phoneNumberId);
      }
    } catch (e) {
      // Silently ignore — stats tracking should never break the blast
    }
  }

  // === Auto-pause campaigns when all sender numbers are inactive ===
  _checkAutoPauseCampaigns(disconnectedNumberId) {
    try {
      const db = getDb();
      // Find running campaigns that use this number
      const runningCampaigns = db.prepare("SELECT DISTINCT campaign_id FROM blast_queue WHERE sender_number_id = ? AND status = 'pending'").all(disconnectedNumberId);
      
      for (const { campaign_id } of runningCampaigns) {
        const campaign = db.prepare("SELECT * FROM campaigns WHERE id = ? AND status = 'running'").get(campaign_id);
        if (!campaign) continue;

        // Get all sender numbers used in pending messages for this campaign
        const senderIds = db.prepare("SELECT DISTINCT sender_number_id FROM blast_queue WHERE campaign_id = ? AND status = 'pending'").all(campaign_id).map(r => r.sender_number_id);
        
        // Check if ANY of them are still active
        const anyActive = senderIds.some(id => {
          const session = this.sessions.get(id);
          if (session && session.status === 'active') return true;
          const row = db.prepare("SELECT status FROM phone_numbers WHERE id = ?").get(id);
          return row?.status === 'active';
        });

        if (!anyActive) {
          // All senders are down — auto-pause
          this.stopBulk(campaign_id);
          db.prepare("UPDATE campaigns SET status = 'paused' WHERE id = ?").run(campaign_id);
          db.prepare("INSERT INTO alerts (type, message) VALUES ('auto_pause', ?)").run(
            `Campaign "${campaign.name}" (#${campaign_id}) auto-paused: all sender numbers are inactive/banned`
          );
          console.log(`⚠️ WAEngine: Campaign #${campaign_id} auto-paused — all senders inactive`);
        }
      }
    } catch (e) {
      console.error('❌ WAEngine: Auto-pause check failed:', e.message);
    }
  }

  // === Resolve template with spin variants ===
  _resolveTemplate(template, targetPhone, contactInfo) {
    if (!template) return null;
    let text = template.content || '';

    // Spin variants: pick random from each {option1|option2|option3}
    text = text.replace(/\{([^}]+)\}/g, (match, inner) => {
      if (inner.includes('|')) {
        const options = inner.split('|');
        return options[Math.floor(Math.random() * options.length)];
      }
      return match;
    });

    // Variable substitution
    text = text.replace(/{{phone}}/g, targetPhone);
    text = text.replace(/{{name}}/g, contactInfo?.name || targetPhone);
    text = text.replace(/{{date}}/g, new Date().toLocaleDateString('id-ID'));

    // Custom vars from contact
    if (contactInfo?.vars) {
      try {
        const customVars = typeof contactInfo.vars === 'string' ? JSON.parse(contactInfo.vars) : contactInfo.vars;
        for (const [key, val] of Object.entries(customVars)) {
          text = text.replace(new RegExp('{{' + key + '}}', 'g'), val || '');
        }
      } catch (e) {}
    }

    return text;
  }

  // === Resolve direct message (no template) with spin variants ===
  _resolveDirectMessage(message, targetPhone, contactInfo) {
    if (!message) return null;
    let text = message;

    // Spin variants: pick random from each {option1|option2|option3}
    text = text.replace(/\{([^}]+)\}/g, (match, inner) => {
      if (inner.includes('|')) {
        const options = inner.split('|');
        return options[Math.floor(Math.random() * options.length)];
      }
      return match;
    });

    // Variable substitution
    text = text.replace(/{{phone}}/g, targetPhone);
    text = text.replace(/{{name}}/g, contactInfo?.name || targetPhone);
    text = text.replace(/{{date}}/g, new Date().toLocaleDateString('id-ID'));
    if (contactInfo?.vars) {
      try {
        const customVars = typeof contactInfo.vars === 'string' ? JSON.parse(contactInfo.vars) : contactInfo.vars;
        for (const [key, val] of Object.entries(customVars)) {
          text = text.replace(new RegExp('{{' + key + '}}', 'g'), val || '');
        }
      } catch (e) {}
    }
    return text;
  }

  // === Get setting from DB ===
  _getSetting(key) {
    try {
      const db = getDb();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      return row?.value || null;
    } catch (e) {
      return null;
    }
  }

  // === Notify N8N webhook (fire-and-forget) ===
  _notifyN8N(settingKey, payload) {
    const url = this._getSetting(settingKey);
    if (!url) return;
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => {
      console.error(`❌ WAEngine: N8N webhook (${settingKey}) failed:`, err.message);
    });
  }

  // === Update connection IP and geo info ===
  async _updateConnectionIP(phoneNumberId) {
    // Throttle: max once per 10 minutes per number
    if (!this._ipLookupCache) this._ipLookupCache = {};
    const now = Date.now();
    if (this._ipLookupCache[phoneNumberId] && (now - this._ipLookupCache[phoneNumberId]) < 600000) return;
    this._ipLookupCache[phoneNumberId] = now;
    const { execSync } = require('child_process');
    try {
      const db = getDb();
      const phoneRow = db.prepare('SELECT proxy_id FROM phone_numbers WHERE id = ?').get(phoneNumberId);
      let curlCmd = 'curl -s --max-time 10 https://ipinfo.io/json';

      // Route IP lookup through assigned proxy
      if (phoneRow && phoneRow.proxy_id) {
        const proxyRow = db.prepare('SELECT * FROM proxies WHERE id = ?').get(phoneRow.proxy_id);
        if (proxyRow && proxyRow.status === 'active') {
          const auth = proxyRow.username ? proxyRow.username + ':' + proxyRow.password + '@' : '';
          const ptype = proxyRow.type === 'socks5' ? 'socks5' : 'http';
          curlCmd = 'curl -s --max-time 10 --proxy ' + ptype + '://' + auth + proxyRow.host + ':' + proxyRow.port + ' https://ipinfo.io/json';
        }
      }

      const result = execSync(curlCmd, { encoding: 'utf8', timeout: 15000 });
      const data = JSON.parse(result);

      if (data.ip) {
        const city = [data.city, data.region].filter(Boolean).join(', ');
        const proxyUrl = (phoneRow && phoneRow.proxy_id) ?
          db.prepare('SELECT host, port FROM proxies WHERE id = ?').get(phoneRow.proxy_id) : null;
        const proxyStr = proxyUrl ? proxyUrl.host + ':' + proxyUrl.port : null;

        db.prepare('UPDATE phone_numbers SET connection_ip = ?, connection_country = ?, connection_city = ?, proxy_url = ? WHERE id = ?')
          .run(data.ip, data.country || '', city, proxyStr, phoneNumberId);
        console.log('🌐 WAEngine: #' + phoneNumberId + ' IP: ' + data.ip + ' (' + data.country + ', ' + city + ')');
      }
    } catch (ipErr) {
      console.log('⚠️ WAEngine: IP lookup failed for #' + phoneNumberId + ': ' + ipErr.message);
      try {
        const result = execSync('curl -s --max-time 10 https://ipinfo.io/json', { encoding: 'utf8', timeout: 15000 });
        const data = JSON.parse(result);
        if (data.ip) {
          const db = getDb();
          const city = [data.city, data.region].filter(Boolean).join(', ');
          db.prepare('UPDATE phone_numbers SET connection_ip = ?, connection_country = ?, connection_city = ? WHERE id = ?')
            .run(data.ip, data.country || '', city, phoneNumberId);
          console.log('🌐 WAEngine: #' + phoneNumberId + ' IP: ' + data.ip + ' (' + data.country + ', ' + city + ') [fallback]');
        }
      } catch (e) {}
    }
  }

  // === Handle message status updates (delivery/read receipts) ===
  _handleMessageStatusUpdates(updates) {
    const db = getDb();
    for (const update of updates) {
      const msgId = update.key?.id;
      if (!msgId) continue;

      const status = update.update?.status;
      const jidRaw = update.key?.remoteJid || '';
      if (status >= 2) {
        console.log('📬 WAEngine: Status update for ' + jidRaw + ' status=' + status + ' (2=sent,3=delivered,4=read)');
      }
      // Baileys status codes: 2=sent, 3=delivered, 4=read
      if (status === 3) {
        try {
          const jid = (update.key?.remoteJid || '').replace(/[:@].+$/, '');
          if (jid) {
            // Match with or without + prefix
            const items = db.prepare("SELECT id, sender_number_id FROM blast_queue WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status = 'sent'").all(jid || '', msgId);
            db.prepare("UPDATE blast_queue SET status = 'delivered', delivered_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status = 'sent'").run(jid || '', msgId);
            // Update health for delivery
            for (const item of items) {
              if (item.sender_number_id) this._updateHealthScore(item.sender_number_id, 'delivered');
            }
          }
        } catch (e) { console.error('❌ WAEngine: Failed to update delivery status:', e.message); }
      } else if (status === 4) {
        try {
          const jid = (update.key?.remoteJid || '').replace(/[:@].+$/, '');
          if (jid) {
            db.prepare("UPDATE blast_queue SET status = 'read', read_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND status IN ('sent', 'delivered')").run(jid || '', msgId);
            db.prepare("UPDATE blast_queue SET delivered_at = datetime('now', 'localtime') WHERE (REPLACE(target_phone, '+', '') = ? OR wa_message_id = ?) AND delivered_at IS NULL AND status = 'read'").run(jid || '', msgId);
          }
        } catch (e) { console.error('❌ WAEngine: Failed to update read status:', e.message); }
      }
    }
  }

  // === Send Interactive Message (CTA buttons/list) via proto + relayMessage ===
  async _sendInteractive(phoneNumberId, targetPhone, messageText, media, interactiveType, interactiveData) {
    const session = this.sessions.get(phoneNumberId);
    if (!session?.sock || session.status !== 'active') {
      return this.sendMessage(phoneNumberId, targetPhone, messageText, media ? { path: media.path, mime_type: media.mime_type, original_name: media.original_name } : null);
    }

    const jid = targetPhone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
    const buttons = (interactiveData.buttons || []).slice(0, 3);

    // === CTA/Quick Reply Buttons via proto relayMessage ===
    if (interactiveType === 'buttons' && buttons.length) {
      try {
        const nativeButtons = buttons.map(btn => {
          if (btn.type === 'url') {
            return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
              name: 'cta_url',
              buttonParamsJson: JSON.stringify({ display_text: btn.text, url: btn.value, merchant_url: btn.value })
            });
          }
          if (btn.type === 'call') {
            return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
              name: 'cta_call',
              buttonParamsJson: JSON.stringify({ display_text: btn.text, phone_number: btn.value })
            });
          }
          return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({ display_text: btn.text, id: btn.value || btn.id || 'reply' })
          });
        });

        // Build header
        let header;
        if (media) {
          const absPath = path.isAbsolute(media.path) ? media.path : path.join(__dirname, '..', media.path);
          if (fs.existsSync(absPath)) {
            try {
              const uploaded = await prepareWAMessageMedia(
                { image: { url: absPath } },
                { upload: session.sock.waUploadToServer }
              );
              header = proto.Message.InteractiveMessage.Header.create({
                title: '',
                hasMediaAttachment: true,
                imageMessage: uploaded.imageMessage
              });
            } catch (uploadErr) {
              console.log('⚠️ WAEngine: Image upload for button msg failed:', uploadErr.message);
            }
          }
        }
        if (!header) {
          header = proto.Message.InteractiveMessage.Header.create({
            title: '',
            hasMediaAttachment: false
          });
        }

        const interactiveMsg = proto.Message.InteractiveMessage.create({
          header,
          body: proto.Message.InteractiveMessage.Body.create({ text: messageText }),
          footer: interactiveData.footer ? proto.Message.InteractiveMessage.Footer.create({ text: interactiveData.footer }) : undefined,
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: nativeButtons
          })
        });

        const fullMsg = generateWAMessageFromContent(jid, proto.Message.create({
          viewOnceMessage: proto.Message.FutureProofMessage.create({
            message: proto.Message.create({
              interactiveMessage: interactiveMsg
            })
          })
        }), {});

        await session.sock.relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id });
        console.log('✅ WAEngine: Interactive button msg sent via relayMessage to', targetPhone);
        return { success: true, messageId: fullMsg.key.id };
      } catch (interactiveErr) {
        console.log('⚠️ WAEngine: Interactive msg failed, sending as text+links:', interactiveErr.message);
        // Fallback: send as plain text with clickable links
        let fallbackText = messageText;
        if (buttons.length) {
          fallbackText += '\n\n';
          for (const btn of buttons) {
            if (btn.type === 'url') {
              fallbackText += '🔗 ' + btn.text + ': ' + btn.value + '\n';
            } else if (btn.type === 'call') {
              fallbackText += '📞 ' + btn.text + ': ' + btn.value + '\n';
            } else {
              fallbackText += '▶️ ' + btn.text + '\n';
            }
          }
          if (interactiveData.footer) fallbackText += '\n' + interactiveData.footer;
        }
        return this.sendMessage(phoneNumberId, targetPhone, fallbackText, media);
      }
    }

    // === List messages via proto relayMessage ===
    if (interactiveType === 'list' && interactiveData.sections?.length) {
      try {
        const sections = interactiveData.sections.map(s => ({
          title: s.title || 'Options',
          rows: (s.rows || []).map(r => ({
            title: r.title,
            description: r.description || '',
            rowId: r.id || r.rowId || r.title
          }))
        }));

        const interactiveMsg = proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: messageText }),
          footer: interactiveData.footer ? proto.Message.InteractiveMessage.Footer.create({ text: interactiveData.footer }) : undefined,
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
              proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: interactiveData.buttonText || 'Options',
                  sections
                })
              })
            ]
          })
        });

        const fullMsg = generateWAMessageFromContent(jid, proto.Message.create({
          viewOnceMessage: proto.Message.FutureProofMessage.create({
            message: proto.Message.create({
              interactiveMessage: interactiveMsg
            })
          })
        }), {});

        await session.sock.relayMessage(jid, fullMsg.message, { messageId: fullMsg.key.id });
        console.log('✅ WAEngine: List message sent via relayMessage to', targetPhone);
        return { success: true, messageId: fullMsg.key.id };
      } catch (err) {
        console.log('⚠️ WAEngine: list message relay failed:', err.message);
      }
    }

    // Final fallback
    return this.sendMessage(phoneNumberId, targetPhone, messageText, media ? { path: media.path, mime_type: media.mime_type, original_name: media.original_name } : null);
  }

  // === Stop a running bulk campaign ===
  stopBulk(campaignId) {
    const state = this._bulkRunning.get(campaignId);
    if (state) state.running = false;
  }

  // === Shutdown all sessions ===
  async shutdown() {
    console.log('🛑 WAEngine: Shutting down all sessions...');
    for (const [id, session] of this.sessions) {
      try { session.sock?.end(); } catch (e) {}
    }
    this.sessions.clear();
  }
}

// Singleton
const engine = new WAEngine();
module.exports = engine;
