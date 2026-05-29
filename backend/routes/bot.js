/**
 * Bot Routes - Telegram webhook and bot management
 */
import express from 'express';
import pino from 'pino';
import db from '../utils/db.js';
import { registry } from '../adapters/registry.js';

const router = express.Router();
const logger = pino();

// Telegram webhook
router.post('/webhook', async (req, res) => {
  try {
    const update = req.body;

    logger.debug(`Webhook update: ${update.update_id}`);

    // Verify webhook token
    const token = req.headers['x-telegram-bot-token'];
    if (token !== process.env.TELEGRAM_BOT_TOKEN) {
      logger.warn('Invalid webhook token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Process update (delegated to bot instance in main.js)
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
