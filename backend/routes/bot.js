/**
 * Bot Routes - Telegram webhook and bot management
 */
import express from 'express';
import crypto from 'crypto';
import pino from 'pino';
import { registry } from '../adapters/registry.js';

const router = express.Router();
const logger = pino();

// Telegram webhook
// NOTE: Telegram authenticates webhooks via the X-Telegram-Bot-Api-Secret-Token
// header, which echoes the secret_token passed to setWebhook(). It never sends
// the bot token itself. Configure TELEGRAM_WEBHOOK_SECRET to the same value
// used in setWebhook.
router.post('/webhook', async (req, res) => {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      logger.error('TELEGRAM_WEBHOOK_SECRET not configured; rejecting webhook');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const provided = req.headers['x-telegram-bot-api-secret-token'] || '';
    const expectedBuf = Buffer.from(expectedSecret);
    const providedBuf = Buffer.from(String(provided));
    const valid = expectedBuf.length === providedBuf.length &&
      crypto.timingSafeEqual(expectedBuf, providedBuf);

    if (!valid) {
      logger.warn('Invalid webhook secret token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.debug(`Webhook update: ${req.body?.update_id}`);

    // Process update (delegated to bot instance; polling mode is the default
    // in server-phase-b.js — wire grammY's webhookCallback here when switching
    // to webhook mode)
    res.json({ ok: true });
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const adapterHealth = await registry.healthCheck();
    const totalAdapters = registry.getSummary().total;
    const healthyAdapters = Object.values(adapterHealth).filter(h => h.status === 'ok').length;

    res.json({
      status: 'ok',
      adapters: {
        total: totalAdapters,
        healthy: healthyAdapters
      },
      adapters_detail: adapterHealth
    });
  } catch (error) {
    logger.error(`Health check error: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get adapter summary
router.get('/adapters', async (req, res) => {
  try {
    const summary = registry.getSummary();
    res.json(summary);
  } catch (error) {
    logger.error(`Get adapters error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// List all adapters with capabilities
router.get('/adapters/list', async (req, res) => {
  try {
    const adapters = registry.listAdapters();
    res.json(adapters);
  } catch (error) {
    logger.error(`List adapters error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
