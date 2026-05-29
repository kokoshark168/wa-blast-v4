/**
 * Telegram Drama Bot - Phase B Server
 * Complete backend with adapters, bot, payment, and referral
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

// Database
import db from './utils/db.js';
import './db/init.js';

// Routes
import paymentRoutes from './routes/payment.js';
import dramasRoutes from './routes/dramas.js';
import referralRoutes from './routes/referral.js';
import botRoutes from './routes/bot.js';

// Adapters & Registry
import { registry } from './adapters/registry.js';
import { DramaBoxAdapter } from './adapters/full/DramaBoxAdapter.js';
import { ShortMaxAdapter } from './adapters/full/ShortMaxAdapter.js';
import { MoboReelsAdapter } from './adapters/partial/MoboReelsAdapter.js';
import { NetShortAdapter } from './adapters/partial/NetShortAdapter.js';
import { ReellifeAdapter } from './adapters/partial/ReellifeAdapter.js';
import {
  MyDramalistAdapter,
  DramaGoAdapter,
  KissAsianAdapter,
  DramaFeverAdapter,
  VikiAdapter,
  ZeeTVAdapter,
  WeTVAdapter,
  NetflixAdapter,
  IQIYIAdapter,
  BilibiliAdapter,
  TencentVideoAdapter,
  YoukuAdapter,
  MangoTVAdapter,
  HimaxinAdapter,
  GagaOOlalaAdapter,
  CatchPlayAdapter,
  RakutenVikiAdapter
} from './adapters/search/SearchAdapters.js';

// Telegram Bot
import { createBot } from './bot/TelegramBot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const logger = pino(
  process.env.NODE_ENV === 'production'
    ? {}
    : { transport: { target: 'pino-pretty' } }
);

// === Middleware ===
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// === Initialize Adapters ===
function initializeAdapters() {
  logger.info('Initializing adapters...');

  // Full adapters (Search + Details + Episodes)
  registry.register(new DramaBoxAdapter(), 'full');
  registry.register(new ShortMaxAdapter(), 'full');

  // Partial adapters (Limited capabilities)
  registry.register(new MoboReelsAdapter(), 'partial');
  registry.register(new NetShortAdapter(), 'partial');
  registry.register(new ReellifeAdapter(), 'partial');

  // Search-only adapters (15+)
  registry.register(new MyDramalistAdapter(), 'search');
  registry.register(new DramaGoAdapter(), 'search');
  registry.register(new KissAsianAdapter(), 'search');
  registry.register(new DramaFeverAdapter(), 'search');
  registry.register(new VikiAdapter(), 'search');
  registry.register(new ZeeTVAdapter(), 'search');
  registry.register(new WeTVAdapter(), 'search');
  registry.register(new NetflixAdapter(), 'search');
  registry.register(new IQIYIAdapter(), 'search');
  registry.register(new BilibiliAdapter(), 'search');
  registry.register(new TencentVideoAdapter(), 'search');
  registry.register(new YoukuAdapter(), 'search');
  registry.register(new MangoTVAdapter(), 'search');
  registry.register(new HimaxinAdapter(), 'search');
  registry.register(new GagaOOlalaAdapter(), 'search');
  registry.register(new CatchPlayAdapter(), 'search');
  registry.register(new RakutenVikiAdapter(), 'search');

  const summary = registry.getSummary();
  logger.info(`✅ Adapters initialized: ${summary.full} full + ${summary.partial} partial + ${summary.search} search`);
}

// === Initialize Telegram Bot ===
let telegramBot = null;
function initializeBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.warn('⚠️ TELEGRAM_BOT_TOKEN not set, skipping bot initialization');
    return;
  }

  try {
    telegramBot = createBot(process.env.TELEGRAM_BOT_TOKEN);
    logger.info('✅ Telegram bot initialized');

    // Start bot in background
    if (process.env.BOT_POLLING === 'true') {
      telegramBot.start()
        .catch(error => logger.error(`Bot start error: ${error.message}`));
    }
  } catch (error) {
    logger.error(`Bot initialization error: ${error.message}`);
  }
}

// === Health Check ===
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    adapters: registry.getSummary().total
  });
});

// === API Routes ===
app.use('/api/payment', paymentRoutes);
app.use('/api/dramas', dramasRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/bot', botRoutes);

// === Root API Info ===
app.get('/api', (req, res) => {
  res.json({
    service: 'Telegram Drama Bot - Phase B',
    version: '1.0.0',
    endpoints: {
      payment: '/api/payment',
      dramas: '/api/dramas',
      referral: '/api/referral',
      bot: '/api/bot',
      health: '/health'
    }
  });
});

// === Error Handlers ===
app.use((err, req, res, next) => {
  logger.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// === Graceful Shutdown ===
function shutdown() {
  logger.info('🛑 Shutting down...');

  try {
    if (telegramBot) {
      telegramBot.stop();
    }
  } catch (e) {
    logger.error(`Bot shutdown error: ${e.message}`);
  }

  try {
    db.close();
    logger.info('✅ Database closed');
  } catch (e) {
    logger.error(`Database close error: ${e.message}`);
  }

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// === Startup ===
initializeAdapters();
initializeBot();

const server = app.listen(PORT, () => {
  logger.info(`🚀 Telegram Drama Bot server running on port ${PORT}`);
  logger.info(`📁 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🤖 Bot polling: ${process.env.BOT_POLLING === 'true' ? 'enabled' : 'disabled'}`);
});

export default app;
