/**
 * Payment Routes - NOWPayments integration
 */
import express from 'express';
import pino from 'pino';
import db from '../utils/db.js';
import { paymentGateway } from '../payment/NOWPaymentsGateway.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();
const logger = pino();

// Create invoice
router.post('/invoice', verifyAuth, async (req, res) => {
  try {
    const { tier } = req.body;
    const userId = req.state.userId;

    if (!['premium', 'plus'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const prices = { premium: 9.99, plus: 24.99 };
    const amount = prices[tier];

    const invoice = await paymentGateway.createInvoice({
      userId,
      amount,
      tier,
      webhookUrl: `${process.env.APP_URL}/api/payment/webhook`
    });

    res.json(invoice);
  } catch (error) {
    logger.error(`Create invoice error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Check payment status
router.get('/invoice/:paymentId', verifyAuth, async (req, res) => {
  try {
    const status = await paymentGateway.getPaymentStatus(req.params.paymentId);
    res.json(status);
  } catch (error) {
    logger.error(`Get payment status error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Webhook (NOWPayments)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'];

    if (!paymentGateway.verifyWebhookSignature(req.body, signature)) {
      logger.warn('Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const result = await paymentGateway.processWebhook(req.body);
    res.json(result);
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// List payment history (user)
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;

    const payments = db.prepare(`
      SELECT id, payment_id, status, amount, currency, tier, created_at
      FROM payments
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId);

    res.json(payments);
  } catch (error) {
    logger.error(`Get payment history error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
