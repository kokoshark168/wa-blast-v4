/**
 * Telegram Bot - grammY based bot for drama search and delivery
 * Features:
 * - /start <referral_code> - Register with referral
 * - Inline search - autocomplete drama titles
 * - Video delivery - send merged episodes via file_id
 * - VIP checking - verify subscription before sending
 * - Referral tracking - commission on successful sends
 */
import { Bot } from 'grammy';
import pino from 'pino';
import db from '../utils/db.js';
import { registry } from '../adapters/registry.js';
import { ReferralService } from '../referral/ReferralService.js';

const logger = pino();

export class TelegramBot {
  constructor(botToken, options = {}) {
    if (!botToken) throw new Error('Bot token required');

    this.bot = new Bot(botToken);
    this.referralService = new ReferralService(db);
    this.options = options;
    this.setupMiddleware();
    this.setupHandlers();
  }

  setupMiddleware() {
    // Context extension for user info
    this.bot.use(async (ctx, next) => {
      ctx.state = ctx.state || {};
      ctx.state.userId = ctx.from?.id;
      ctx.state.username = ctx.from?.username;
      await next();
    });
  }

  setupHandlers() {
    // /start command with optional referral code
    this.bot.command('start', async (ctx) => {
      const telegramId = ctx.from.id;
      const username = ctx.from.username;
      const referralCode = ctx.match?.trim() || null;

      try {
        // Check if user exists
        let user = db.prepare(
          'SELECT id FROM users WHERE telegram_id = ?'
        ).get(telegramId);

        if (!user) {
          // Create new user
          const stmt = db.prepare(`
            INSERT INTO users (telegram_id, username, vip_tier, created_at, updated_at)
            VALUES (?, ?, 'free', datetime('now'), datetime('now'))
          `);
          const result = stmt.run(telegramId, username);
          user = { id: result.lastInsertRowid };

          // Apply referral if provided
          if (referralCode) {
            try {
              await this.referralService.applyReferralCode(user.id, referralCode);
            } catch (error) {
              logger.warn(`Referral code invalid: ${referralCode}`);
            }
          }
        }

        await ctx.reply(
          '🎬 Welcome to Drama Bot!\n\n' +
          'Use inline search to find dramas:\n' +
          'Type `@dramabotusername drama name` in any chat to search.\n\n' +
          '💎 VIP Required: Video delivery requires active VIP subscription.\n' +
          'Type /vip to check your status or upgrade.\n\n' +
          '💰 Referral: Share your code and earn commissions!\n' +
          'Type /referral to get your personal code.',
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        logger.error(`Start command error: ${error.message}`);
        await ctx.reply('Error: Could not initialize. Please try again.');
      }
    });

    // Inline search
    this.bot.on('inline_query', async (ctx) => {
      const query = ctx.inlineQuery.query.trim();

      try {
        if (query.length < 2) {
          return await ctx.answerInlineQuery([]);
        }

        const results = await registry.searchAll(query);

        if (results.length === 0) {
          return await ctx.answerInlineQuery([]);
        }

        // grammY does not export result classes; inline results are plain objects
        // matching the Telegram Bot API InlineQueryResult schema.
        // IDs must be unique per answer (max 64 bytes), so include the index.
        const inlineResults = results.slice(0, 50).map((drama, index) => ({
          type: 'article',
          id: `${index}-${String(drama.id ?? 'unknown')}`.slice(0, 64),
          title: drama.title || 'Unknown',
          description: `${drama.year || '?'} • ${drama.total_episodes || '?'} episodes • ${drama.source || 'Unknown'}`,
          ...(drama.image ? { thumbnail_url: drama.image } : {}),
          input_message_content: {
            // Plain text (no parse_mode): titles may contain Markdown control chars
            message_text:
              `📺 ${drama.title || 'Unknown'}\n\n` +
              `Year: ${drama.year || '?'}\n` +
              `Episodes: ${drama.total_episodes || '?'}\n` +
              `Rating: ${drama.rating || 'N/A'}\n` +
              `Source: ${drama.source || 'Unknown'}\n\n` +
              `Use /getvideo ${drama.id ?? ''} to request the merged video.`
          }
        }));

        await ctx.answerInlineQuery(inlineResults, {
          cache_time: 300, // Cache for 5 minutes
          is_personal: false
        });
      } catch (error) {
        logger.error(`Inline query error: ${error.message}`);
        await ctx.answerInlineQuery([]);
      }
    });

    // VIP status
    this.bot.command('vip', async (ctx) => {
      const telegramId = ctx.from.id;

      try {
        const user = db.prepare(`
          SELECT u.vip_tier, u.vip_expires_at,
                 vs.storage_limit_gb, vs.concurrent_uploads
          FROM users u
          LEFT JOIN vip_subscriptions vs ON u.id = vs.user_id
          WHERE u.telegram_id = ?
        `).get(telegramId);

        if (!user) {
          return await ctx.reply('User not found. Use /start to register.');
        }

        const now = new Date();
        const expiresAt = user.vip_expires_at ? new Date(user.vip_expires_at) : null;
        const isActive = expiresAt && expiresAt > now;

        let message = `💎 *Your VIP Status*\n\n`;
        message += `Tier: ${(user.vip_tier || 'free').toUpperCase()}\n`;
        message += `Status: ${isActive ? '✅ ACTIVE' : '❌ INACTIVE'}\n`;

        if (expiresAt) {
          message += `Expires: ${expiresAt.toLocaleDateString()}\n`;
        }

        message += `\nStorage: ${user.storage_limit_gb || 1} GB\n`;
        message += `Concurrent: ${user.concurrent_uploads || 1} uploads\n\n`;
        message += `_To upgrade, use /upgrade premium or /upgrade plus_`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
      } catch (error) {
        logger.error(`VIP command error: ${error.message}`);
        await ctx.reply('Error checking VIP status.');
      }
    });

    // Referral code
    this.bot.command('referral', async (ctx) => {
      const telegramId = ctx.from.id;

      try {
        const user = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(telegramId);
        if (!user) {
          return await ctx.reply('User not found. Use /start to register.');
        }

        const referralData = await this.referralService.getOrCreateCode(user.id);

        await ctx.reply(
          `💰 *Your Referral Code*\n\n` +
          `Code: \`${referralData.code}\`\n` +
          `Share: \`/start ${referralData.code}\`\n\n` +
          `Earnings: $${referralData.total_earned || 0}\n` +
          `Pending: $${referralData.pending_balance || 0}\n\n` +
          `_Earn $1 commission for each referred VIP!_`,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        logger.error(`Referral command error: ${error.message}`);
        await ctx.reply('Error retrieving referral code.');
      }
    });

    // Help command
    this.bot.command('help', async (ctx) => {
      await ctx.reply(
        '📖 *Drama Bot Help*\n\n' +
        '/start - Register and optional referral code\n' +
        '/search query - Search for dramas\n' +
        '/vip - Check VIP status\n' +
        '/upgrade [premium|plus] - Upgrade subscription\n' +
        '/referral - Get your referral code\n' +
        '/withdraw - Request balance withdrawal\n\n' +
        'Inline: Type @dramabotusername query to search anywhere',
        { parse_mode: 'Markdown' }
      );
    });
  }

  /**
   * Start polling for updates
   */
  async start() {
    logger.info('🤖 Telegram Bot starting...');

    try {
      await this.bot.start({
        onStart: (botInfo) => {
          logger.info(`✅ Bot started as @${botInfo.username}`);
        }
      });
    } catch (error) {
      logger.error(`Bot error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send video to user (via file_id or direct upload)
   */
  async sendVideo(telegramId, fileId, title, caption = '') {
    try {
      await this.bot.api.sendVideo(
        telegramId,
        fileId,
        {
          caption: caption || `📺 ${title}`,
          parse_mode: 'Markdown'
        }
      );
      return true;
    } catch (error) {
      logger.error(`Send video error: ${error.message}`);
      return false;
    }
  }

  /**
   * Send message to user
   */
  async sendMessage(telegramId, text, options = {}) {
    try {
      await this.bot.api.sendMessage(telegramId, text, options);
      return true;
    } catch (error) {
      logger.error(`Send message error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get bot info
   */
  async getMe() {
    return await this.bot.api.getMe();
  }

  /**
   * Stop bot (safe to call even if polling was never started)
   */
  async stop() {
    try {
      if (this.bot.isRunning()) {
        await this.bot.stop();
      }
      logger.info('Bot stopped');
    } catch (error) {
      logger.warn(`Bot stop error: ${error.message}`);
    }
  }
}

// Export factory
export function createBot(token, options = {}) {
  return new TelegramBot(token, options);
}
