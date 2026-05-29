import { Markup } from 'telegraf';
import db from './db.js';
import { getDramaDetail, getEpisodes, getHlsUrl } from './api.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// === Part navigation store (in-memory, lost on restart) ===
const partStore = new Map(); // sessionId -> { parts: [{path,idx,total}], dramaId, title, platform }

export function setupBot(bot) {

  // === Auto-reply system ===
  const replies = db.prepare('SELECT keyword, response FROM auto_replies WHERE active = 1').all();

  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
      const msg = ctx.message.text.toLowerCase();
      for (const r of replies) {
        if (msg.includes(r.keyword)) {
          await ctx.reply(r.response);
          return;
        }
      }
    }
    return next();
  });

  // === Start (with deeplink support: full-{id}-{platform}, ep-{id}-{epNo}-{platform}) ===
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      const ref = ctx.startPayload || null;
      const code = 'DR' + crypto.randomBytes(3).toString('hex').toUpperCase();
      db.prepare('INSERT OR IGNORE INTO users (id, username, first_name, referral_code, referred_by) VALUES (?,?,?,?,?)')
        .run(userId, ctx.from.username, ctx.from.first_name, code, ref);
    }

    const payload = ctx.startPayload;
    
    // IDShortBot-style deeplink: /start full-42000012097-dramabox
    if (payload && payload.startsWith('full-')) {
      const parts = payload.slice(5).split('-');
      const platform = parts.pop(); // last segment
      const dramaId = parts.join('-'); // rest is the ID
      await handleWebAppData(ctx, {
        action: 'watch_full',
        dramaId,
        title: '',
        platform,
        fromStartPayload: true,
      });
      return;
    }
    
    // IDShortBot-style deeplink: /start ep-42000012097-1-dramabox
    if (payload && payload.startsWith('ep-')) {
      const parts = payload.slice(3).split('-');
      const platform = parts.pop();
      const epNo = parseInt(parts.pop());
      const dramaId = parts.join('-');
      await handleWebAppData(ctx, {
        action: 'watch_chat',
        dramaId,
        dramaTitle: '',
        episodeNo: epNo,
        platform,
        fromStartPayload: true,
      });
      return;
    }

    await mainMenu(ctx, true);
  });

  // === Inline button handlers (IDShortBot-style navigation) ===
  bot.action(/^next_part:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const sessionId = ctx.match[1];
    const partIdx = parseInt(ctx.match[2]);
    const session = partStore.get(sessionId);
    if (!session) return ctx.reply('⚠️ Sesi sudah expired. Cari drama lagi ya.');

    const nextIdx = partIdx + 1;
    if (nextIdx >= session.parts.length) return ctx.reply('✅ Semua part sudah ditonton! 🏠');

    const p = session.parts[nextIdx];
    const total = session.parts.length;
    const buttons = buttonsForPart(sessionId, nextIdx, total);
    const caption = `🎬 *${session.title}*\n📺 Part ${nextIdx + 1}/${total}`;

    try {
      await ctx.replyWithVideo(
        { source: p.path },
        {
          caption,
          parse_mode: 'Markdown',
          supports_streaming: true,
          ...Markup.inlineKeyboard(buttons),
        }
      );
      db.prepare('UPDATE users SET watch_count = watch_count + 1 WHERE id = ?').run(ctx.from.id);
    } catch (e) {
      console.error('send part error:', e.message);
      await ctx.reply(`❌ Gagal mengirim part ${nextIdx + 1}: ${e.message.slice(0, 100)}`);
    }
  });

  bot.action(/^list_parts:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const session = partStore.get(ctx.match[1]);
    if (!session) return ctx.reply('⚠️ Sesi sudah expired.');

    const text = `📜 *${session.title}*\n\n` +
      session.parts.map((p, i) => `${i === session.currentIdx ? '▶️' : '📺'} Part ${i + 1}/${session.parts.length}`).join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.action(/^movie_home$/, async (ctx) => {
    await ctx.answerCbQuery();
    await mainMenu(ctx);
  });

  // Episode navigation (from watch_chat inline buttons)
  bot.action(/^chat_ep:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const dramaId = ctx.match[1];
    const epNo = parseInt(ctx.match[2]);
    // Re-trigger watch_chat by simulating webapp data
    await handleWebAppData(ctx, {
      action: 'watch_chat',
      dramaId,
      dramaTitle: '', // will be filled by streamEpisode
      episodeNo: epNo,
      platform: 'dramabox',
    });
  });

  bot.action(/^chat_list:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const dramaId = ctx.match[1];
    try {
      const { getEpisodes } = await import('./api.js');
      const eps = await getEpisodes(dramaId);
      if (!eps || !eps.length) return ctx.reply('⚠️ Episode tidak ditemukan.');
      const text = `📜 *Daftar Episode*\n\n` +
        eps.map((e, i) => `${i + 1}. Episode ${(e.chapterIndex || i) + 1}`).join('\n') +
        `\n\n_Ketik nomor episode untuk nonton_`;
      await ctx.reply(text, { parse_mode: 'Markdown' });
    } catch (e) {
      await ctx.reply('❌ Gagal memuat episode.');
    }
  });

  // === Main Menu ===
  bot.hears(['🏠 Home', '🏠 Beranda'], ctx => mainMenu(ctx));
  bot.hears(['🔍 Cari', '🔍 Cari Drama'], ctx => ctx.reply('Ketik judul drama yang kamu cari 👇'));
  bot.hears(['👑 VIP', '👑 Beli VIP'], ctx => vipMenu(ctx));
  bot.hears(['📜 Riwayat'], ctx => historyCmd(ctx));
  bot.hears(['ℹ️ Bantuan'], ctx => helpCmd(ctx));

  // === Commands ===
  bot.command('vip', ctx => vipMenu(ctx));
  bot.command('cari', ctx => ctx.reply('Ketik judul drama yang kamu cari 👇'));
  bot.command('bantuan', ctx => helpCmd(ctx));
  bot.command('riwayat', ctx => historyCmd(ctx));

  // === VIP Menu ===
  bot.action('menu_vip', ctx => {
    ctx.answerCbQuery();
    vipMenu(ctx);
  });

  // === Open Mini App ===
  bot.action('open_app', ctx => {
    ctx.answerCbQuery();
    return openMiniApp(ctx);
  });

  bot.action('menu_home', ctx => {
    ctx.answerCbQuery();
    return mainMenu(ctx);
  });

  // === Search handler ===
  bot.on('text', async (ctx) => {
    const q = ctx.message.text;
    if (q.startsWith('/') || q.length < 2) return;

    await ctx.reply(`🔍 Mencari: *${q}*...`, { parse_mode: 'Markdown' });
    // Forward to Mini App with search query
    await openMiniApp(ctx, q);
  });

  // === Web App data (from Mini App) ===
  bot.on('web_app_data', async (ctx) => {
    try {
      // Telegraf 4.16: webAppData.data is { json(), text() }, not a string
      const data = ctx.webAppData.data.json();
      console.log('📨 web_app_data:', JSON.stringify(data));
      await handleWebAppData(ctx, data);
    } catch (e) {
      console.error('WebApp data error:', e.message);
    }
  });

  console.log('🤖 Bot commands registered');
}

// === Helper: inline keyboard buttons for video parts ===
function buttonsForPart(sessionId, currentIdx, total) {
  const btns = [];
  if (currentIdx < total - 1) {
    btns.push(Markup.button.callback('⏭️ Tonton selanjutnya', `next_part:${sessionId}:${currentIdx}`));
  }
  btns.push(Markup.button.callback('📜 List part', `list_parts:${sessionId}`));
  btns.push(Markup.button.callback('🏠 Home', 'movie_home'));
  return [btns];
}

// === Menu Functions ===

async function mainMenu(ctx, isStart = false) {
  const userId = ctx.from?.id || ctx.chat?.id;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const isVip = user?.vip_until && new Date(user.vip_until) > new Date();
  const watchCount = user?.watch_count || 0;

  const vipBadge = isVip ? '👑 VIP Aktif' : '🎬 Free User';
  const text = isStart
    ? `🎬 *Selamat datang di DracinBot!*\n\nNonton drama pendek vertikal Korea & China tanpa batas. ${isVip ? 'Kamu sudah VIP, enjoy!' : `Kamu punya ${10 - watchCount} episode gratis tersisa.`}\n\n👤 ${ctx.from.first_name} — ${vipBadge}`
    : `🎬 *DracinBot*\n👤 ${ctx.from.first_name} — ${vipBadge}\n📊 ${watchCount} episode ditonton`;

  const url = process.env.MINIAPP_URL || 'https://server1.nyxshark.online/dracin-app';

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    // Reply keyboard, NOT inline: Telegram only delivers WebApp.sendData() — the
    // channel the Mini App uses to request videos / VIP — when the app is opened
    // from a keyboard-button WebApp. Inline-button WebApps cannot sendData.
    ...Markup.keyboard([
      [Markup.button.webApp('🎬 Buka Katalog', url)],
      [Markup.button.webApp('👑 Beli VIP', `${url}#vip`)],
      ['📜 Riwayat', 'ℹ️ Bantuan'],
    ]).resize(),
  });
}

async function vipMenu(ctx) {
  const packages = db.prepare('SELECT * FROM vip_packages WHERE active = 1 ORDER BY price_idr').all();
  const text = '*👑 Pilih Paket VIP*\n\n' +
    packages.map(p =>
      `• *${p.name}* — Rp ${p.price_idr.toLocaleString('id')}\n  _${p.description}_`
    ).join('\n\n') +
    '\n\n_Klik tombol di bawah untuk beli via QRIS_';

  const url = process.env.MINIAPP_URL || 'https://server1.nyxshark.online/dracin-app';

  await ctx.reply(text, {
    parse_mode: 'Markdown',
    // Reply-keyboard WebApp so the in-app QRIS purchase can sendData() back.
    ...Markup.keyboard([
      [Markup.button.webApp('💳 Beli VIP Sekarang', `${url}#vip`)],
      ['🏠 Beranda'],
    ]).resize(),
  });
}

async function openMiniApp(ctx, searchQuery = '') {
  const url = process.env.MINIAPP_URL || 'https://server1.nyxshark.online/dracin-app';
  const fullUrl = searchQuery ? `${url}?q=${encodeURIComponent(searchQuery)}` : url;

  const label = searchQuery ? `🔍 Lihat hasil: ${searchQuery.slice(0, 20)}` : '🎬 Buka DracinApp';

  await ctx.reply('📱 Buka katalog di bawah 👇', {
    // Reply-keyboard WebApp so drama cards opened from search can sendData() back.
    ...Markup.keyboard([
      [Markup.button.webApp(label, fullUrl)],
      ['🏠 Beranda'],
    ]).resize(),
  });
}

async function historyCmd(ctx) {
  const userId = ctx.from.id;
  const history = db.prepare(
    'SELECT DISTINCT drama_title, drama_id FROM watch_history WHERE user_id = ? ORDER BY MAX(watched_at) DESC LIMIT 10'
  ).all(userId);

  if (history.length === 0) {
    await ctx.reply('📭 Kamu belum nonton apa-apa.\nKlik tombol katalog buat mulai! 🎬');
    return;
  }

  const text = '*📜 Riwayat Tontonan*\n\n' +
    history.map((h, i) => `${i + 1}. ${h.drama_title}`).join('\n');

  await ctx.reply(text, { parse_mode: 'Markdown' });
}

async function helpCmd(ctx) {
  await ctx.reply(
    '*ℹ️ Bantuan DracinBot*\n\n' +
    '• 🎬 *Nonton*: Buka katalog via tombol di menu\n' +
    '• 🔍 *Cari*: Ketik judul drama langsung di chat\n' +
    '• 👑 *VIP*: Beli akses unlimited\n' +
    '• 💬 *Support*: Ketik /bantuan atau mention admin\n\n' +
    'Free: 10 episode pertama gratis!\n' +
    'VIP: Unlimited nonton semua drama',
    { parse_mode: 'Markdown' }
  );
}

// === WebApp data handler ===
async function handleWebAppData(ctx, data) {
  const userId = ctx.from.id;

  switch (data.action) {
    case 'view_drama': {
      // User clicked a drama card
      await ctx.reply(`🎬 *${data.title}*\nPlatform: ${data.platform || 'DramaBox'}`, {
        parse_mode: 'Markdown'
      });
      break;
    }

    case 'watch_start': {
      // Record watch in database — user watches in Mini App
      db.prepare(
        'INSERT INTO watch_history (user_id, drama_id, drama_title, episode_no) VALUES (?,?,?,?)'
      ).run(userId, data.dramaId, data.dramaTitle, data.episodeNo);
      db.prepare('UPDATE users SET watch_count = watch_count + 1 WHERE id = ?').run(userId);

      await ctx.reply(`🎬 Memutar: *${data.dramaTitle}* Ep ${data.episodeNo}`, {
        parse_mode: 'Markdown'
      });
      break;
    }

    case 'watch_full': {
      // IDShortBot-style: merge → split → send parts directly in chat with inline buttons
      const sessionId = `full_${userId}_${Date.now()}`;
      const statusMsg = await ctx.reply(`🎬 *${data.title}*\n\n⏳ Mengunduh semua episode...`, {
        parse_mode: 'Markdown'
      });

      try {
        const { mergeAllEpisodes } = await import('./video.js');

        // Merge + split (all episodes → parts)
        const result = await mergeAllEpisodes(data.dramaId, async (type, done, total) => {
          const msgs = {
            download: `📥 *Mengunduh episode...* ${done}/${total} _(16 paralel)_`,
            merge: `🔄 *Menggabungkan ${total} episode...*`,
            encode: `🎬 *Encode Part ${done}/${total}...*`,
          };
          try {
            await ctx.telegram.editMessageText(
              statusMsg.chat.id, statusMsg.message_id, undefined,
              msgs[type] || `⏳ Memproses...`,
              { parse_mode: 'Markdown' }
            );
          } catch {}
        }, data.platform || 'dramabox');

        const parts = result.parts || [];
        const rawFile = result.rawFile;
        const MINIAPP_URL = process.env.MINIAPP_URL || 'http://localhost:3777';

        // Save download link
        let downloadUrl = null;
        const downloadDir = path.join(process.cwd(), 'public', 'downloads');
        try {
          if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });
          const safeName = data.title.replace(/[/\\?%*:|"<>]/g, '_');
          const dlPath = path.join(downloadDir, `${safeName}_FULL.mp4`);
          fs.copyFileSync(rawFile, dlPath);
          downloadUrl = `${MINIAPP_URL}/downloads/${encodeURIComponent(safeName)}_FULL.mp4`;
        } catch {}

        // Store session
        const partPaths = parts.map((p, i) => ({ path: p.path, idx: i, total: parts.length }));
        partStore.set(sessionId, {
          parts: partPaths,
          dramaId: data.dramaId,
          title: data.title,
          platform: data.platform,
          currentIdx: -1,
        });

        const total = parts.length;

        if (total === 0) {
          // No split parts (file < 50MB) → send directly
          if (fs.existsSync(rawFile) && fs.statSync(rawFile).size > 100000) {
            await ctx.replyWithVideo(
              { source: rawFile },
              {
                caption: `🎬 *${data.title}*\n📦 Full Movie`,
                parse_mode: 'Markdown',
                supports_streaming: true,
                ...Markup.inlineKeyboard([
                  [Markup.button.url('📥 Download', downloadUrl)],
                  [Markup.button.callback('🏠 Home', 'movie_home')],
                ]),
              }
            );
            try { await ctx.telegram.deleteMessage(statusMsg.chat.id, statusMsg.message_id); } catch {}
          }
        } else {
          // Send Part 1 with inline navigation
          const p0 = parts[0];
          const buttons = buttonsForPart(sessionId, 0, total);
          await ctx.telegram.editMessageText(
            statusMsg.chat.id, statusMsg.message_id, undefined,
            `✅ *Full Movie Siap!*\n\n${data.title}\n📦 ${(fs.statSync(rawFile).size/1024/1024).toFixed(0)} MB\n📺 ${total} part`,
            { parse_mode: 'Markdown' }
          );

          await ctx.replyWithVideo(
            { source: p0.path },
            {
              caption: `🎬 *${data.title}*\n📺 Part 1/${total}`,
              parse_mode: 'Markdown',
              supports_streaming: true,
              ...Markup.inlineKeyboard(buttons),
            }
          );
        }

        // Auto-cleanup after 2 hours
        setTimeout(() => {
          partStore.delete(sessionId);
          try { fs.unlinkSync(rawFile); } catch {}
          for (const p of parts) { try { fs.unlinkSync(p.path); } catch {} }
          // Clean download file too
          if (downloadUrl) {
            const df = path.join(process.cwd(), 'public', 'downloads', path.basename(downloadUrl));
            try { fs.unlinkSync(df); } catch {}
          }
        }, 7200000);

        // Record
        db.prepare(
          'INSERT INTO watch_history (user_id, drama_id, drama_title, episode_no) VALUES (?,?,?,?)'
        ).run(userId, data.dramaId, data.title, -1);
        db.prepare('UPDATE users SET watch_count = watch_count + 1 WHERE id = ?').run(userId);

      } catch (err) {
        console.error('watch_full error:', err.message, err.stack?.slice(0, 300));
        try {
          await ctx.telegram.editMessageText(
            statusMsg.chat.id, statusMsg.message_id, undefined,
            `❌ Gagal: ${err.message.slice(0, 150)}`,
            { parse_mode: 'Markdown' }
          );
        } catch {}
      }
      break;
    }

    case 'watch_chat': {
      const statusMsg = await ctx.reply(`⏳ *Menyiapkan video...*\n\n${data.dramaTitle} Ep ${data.episodeNo}`, {
        parse_mode: 'Markdown'
      });

      try {
        const { streamEpisode } = await import('./video.js');
        const epIdx = data.episodeNo - 1;
        
        // Update: streaming dari server
        await ctx.telegram.editMessageText(
          statusMsg.chat.id, statusMsg.message_id, undefined,
          `📥 *Mengunduh & mengirim video...*\n\n${data.dramaTitle} Ep ${data.episodeNo}\n\n_Mohon tunggu sebentar_`,
          { parse_mode: 'Markdown' }
        );

        const result = await streamEpisode(data.dramaId, epIdx, data.platform || 'dramabox');

        // Send video via stream (no disk for MP4, direct pipe to Telegram)
        await ctx.telegram.editMessageText(
          statusMsg.chat.id, statusMsg.message_id, undefined,
          `📤 *Mengirim ke Telegram...*\n\n${data.dramaTitle} Ep ${data.episodeNo}`,
          { parse_mode: 'Markdown' }
        );

        // IDShortBot-style: inline buttons for episode navigation
        const totalEps = result.totalEpisodes || 0;
        const nextEpNo = data.episodeNo + 1;
        const btns = [];
        if (nextEpNo <= totalEps) {
          const nextData = JSON.stringify({
            action: 'watch_chat',
            dramaId: data.dramaId,
            dramaTitle: data.dramaTitle,
            episodeNo: nextEpNo,
            platform: data.platform || 'dramabox',
          });
          // Use URL callback to re-trigger watch_chat (callback_data max 64 bytes)
          btns.push(Markup.button.callback('⏭️ Episode ' + nextEpNo, `chat_ep:${data.dramaId}:${nextEpNo}`));
        }
        btns.push(Markup.button.callback('📜 Semua Episode', `chat_list:${data.dramaId}`));
        btns.push(Markup.button.callback('🏠 Home', 'movie_home'));

        await ctx.replyWithVideo(
          { source: result.stream },
          {
            caption: `🎬 *${data.dramaTitle}* Ep ${data.episodeNo}`,
            parse_mode: 'Markdown',
            supports_streaming: true,
            ...(btns.length ? Markup.inlineKeyboard([btns]) : {}),
          }
        );

        // Cleanup
        try { await ctx.telegram.deleteMessage(statusMsg.chat.id, statusMsg.message_id); } catch {}
        if (result.path) {
          setTimeout(() => { try { fs.unlinkSync(result.path); } catch {} }, 600000);
        }

        // Record
        db.prepare(
          'INSERT INTO watch_history (user_id, drama_id, drama_title, episode_no) VALUES (?,?,?,?)'
        ).run(userId, data.dramaId, data.dramaTitle, data.episodeNo);
        db.prepare('UPDATE users SET watch_count = watch_count + 1 WHERE id = ?').run(userId);

      } catch (err) {
        console.error('watch_chat error:', err.message, err.stack?.slice(0, 300));
        try {
          await ctx.telegram.editMessageText(
            statusMsg.chat.id, statusMsg.message_id, undefined,
            `❌ Gagal: ${err.message.slice(0, 150)}`,
            { parse_mode: 'Markdown' }
          );
        } catch {}
      }
      break;
    }

    case 'purchase_vip': {
      // Record pending payment
      db.prepare(
        'INSERT INTO payments (user_id, package_id, package_name, amount) VALUES (?,?,?,?)'
      ).run(userId, data.packageId, data.packageName, data.amount);

      await ctx.reply(
        `💳 *Menunggu Pembayaran*\n\n` +
        `Paket: ${data.packageName}\n` +
        `Jumlah: Rp ${data.amount?.toLocaleString('id')}\n\n` +
        `_Upload bukti transfer di sini, atau scan QRIS di Mini App_`,
        { parse_mode: 'Markdown' }
      );
      break;
    }

    default:
      console.log('Unknown webapp action:', data.action);
  }
}
