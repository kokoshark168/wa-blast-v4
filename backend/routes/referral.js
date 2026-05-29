/**
 * Referral Routes - Referral codes, commissions, withdrawals
 */
import express from 'express';
import pino from 'pino';
import db from '../utils/db.js';
import { ReferralService } from '../referral/ReferralService.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();
const logger = pino();
const referralService = new ReferralService(db);

// Get referral code
router.get('/code', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;
    const code = await referralService.getOrCreateCode(userId);
    res.json(code);
  } catch (error) {
    logger.error(`Get referral code error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get referral stats
router.get('/stats', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;
    const stats = referralService.getReferralStats(userId);
    res.json(stats);
  } catch (error) {
    logger.error(`Get referral stats error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Apply referral code (registration)
router.post('/apply', async (req, res) => {
  try {
    const { user_id, referral_code } = req.body;

    if (!user_id || !referral_code) {
      return res.status(400).json({ error: 'user_id and referral_code required' });
    }

    const result = await referralService.applyReferralCode(user_id, referral_code);
    res.json(result);
  } catch (error) {
    logger.error(`Apply referral code error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Request withdrawal
router.post('/withdrawal', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;
    const { amount, wallet_address } = req.body;

    if (!amount || !wallet_address) {
      return res.status(400).json({ error: 'amount and wallet_address required' });
    }

    if (amount < 1) {
      return res.status(400).json({ error: 'Minimum withdrawal is $1' });
    }

    const withdrawal = await referralService.requestWithdrawal(userId, amount, wallet_address);
    res.json(withdrawal);
  } catch (error) {
    logger.error(`Request withdrawal error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Get withdrawal requests (admin)
router.get('/withdrawals', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;

    // Check if admin
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const withdrawals = db.prepare(`
      SELECT w.*, u.username FROM withdrawals w
      JOIN users u ON w.user_id = u.id
      WHERE w.status = 'pending'
      ORDER BY w.requested_at DESC
    `).all();

    res.json(withdrawals);
  } catch (error) {
    logger.error(`Get withdrawals error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Approve withdrawal (admin)
router.post('/withdrawals/:id/approve', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;
    const { id } = req.params;
    const { transaction_id } = req.body;

    // Check if admin
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await referralService.approveWithdrawal(id, transaction_id);
    res.json(result);
  } catch (error) {
    logger.error(`Approve withdrawal error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

// Reject withdrawal (admin)
router.post('/withdrawals/:id/reject', verifyAuth, async (req, res) => {
  try {
    const userId = req.state.userId;
    const { id } = req.params;
    const { reason } = req.body;

    // Check if admin
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    if (!user?.is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await referralService.rejectWithdrawal(id, reason);
    res.json(result);
  } catch (error) {
    logger.error(`Reject withdrawal error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
});

export default router;
