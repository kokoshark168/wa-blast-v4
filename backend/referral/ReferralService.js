/**
 * Referral Service
 * Manages referral codes, commission tracking, and withdrawal approval
 */
import crypto from 'crypto';
import pino from 'pino';

const logger = pino();

export class ReferralService {
  constructor(database) {
    this.db = database;
    this.commissionPerVIP = 1.00; // $1 per referred VIP
  }

  /**
   * Create or get referral code for user
   */
  async getOrCreateCode(userId) {
    try {
      // Check if code exists
      let referral = this.db.prepare(`
        SELECT code, total_earned, pending_balance
        FROM referral_codes
        WHERE user_id = ?
      `).get(userId);

      if (referral) {
        return referral;
      }

      // Generate new code, retrying on the (unlikely) UNIQUE collision
      let code = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = this.generateCode();
        try {
          this.db.prepare(`
            INSERT INTO referral_codes (user_id, code, total_earned, pending_balance, created_at)
            VALUES (?, ?, 0, 0, datetime('now'))
          `).run(userId, candidate);
          code = candidate;
          break;
        } catch (error) {
          // Another request may have created this user's code concurrently
          const existing = this.db.prepare(`
            SELECT code, total_earned, pending_balance FROM referral_codes WHERE user_id = ?
          `).get(userId);
          if (existing) return existing;
          // Otherwise it was a code collision — retry with a new candidate
          if (attempt === 4) throw error;
        }
      }

      return { code, total_earned: 0, pending_balance: 0 };
    } catch (error) {
      logger.error(`Get or create code error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Apply referral code when new user signs up
   */
  async applyReferralCode(referredUserId, code) {
    try {
      if (!code || typeof code !== 'string') {
        throw new Error('Referral code required');
      }
      const normalizedCode = code.trim().toUpperCase();

      // Find referrer
      const referrer = this.db.prepare(`
        SELECT user_id FROM referral_codes WHERE code = ?
      `).get(normalizedCode);

      if (!referrer) {
        throw new Error(`Invalid referral code: ${code}`);
      }

      if (referrer.user_id === referredUserId) {
        throw new Error('Cannot use own referral code');
      }

      // Check if already referred
      const existing = this.db.prepare(`
        SELECT id FROM referrals WHERE referred_user_id = ?
      `).get(referredUserId);

      if (existing) {
        throw new Error('User already has a referrer');
      }

      // Record referral
      this.db.prepare(`
        INSERT INTO referrals (referrer_id, referred_user_id, created_at)
        VALUES (?, ?, datetime('now'))
      `).run(referrer.user_id, referredUserId);

      logger.info(`Referral applied: ${referredUserId} -> ${referrer.user_id}`);
      return { referrer_id: referrer.user_id };
    } catch (error) {
      logger.error(`Apply referral code error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Award commission when referred user upgrades to VIP
   */
  async awardCommission(referredUserId) {
    try {
      const referral = this.db.prepare(`
        SELECT referrer_id FROM referrals WHERE referred_user_id = ?
      `).get(referredUserId);

      if (!referral) {
        logger.debug(`No referrer found for user ${referredUserId}`);
        return null;
      }

      // Check if already awarded
      const existing = this.db.prepare(`
        SELECT id FROM referral_earnings WHERE referred_user_id = ? AND status = 'earned'
      `).get(referredUserId);

      if (existing) {
        logger.debug(`Commission already earned for user ${referredUserId}`);
        return null;
      }

      // Record earning + update totals atomically
      const awardTx = this.db.transaction(() => {
        this.db.prepare(`
          INSERT INTO referral_earnings (referrer_id, referred_user_id, amount, status, created_at)
          VALUES (?, ?, ?, 'earned', datetime('now'))
        `).run(referral.referrer_id, referredUserId, this.commissionPerVIP);

        this.db.prepare(`
          UPDATE referral_codes
          SET total_earned = total_earned + ?,
              pending_balance = pending_balance + ?
          WHERE user_id = ?
        `).run(this.commissionPerVIP, this.commissionPerVIP, referral.referrer_id);
      });
      awardTx();

      logger.info(`Commission awarded: $${this.commissionPerVIP} to user ${referral.referrer_id}`);
      return {
        referrer_id: referral.referrer_id,
        amount: this.commissionPerVIP
      };
    } catch (error) {
      logger.error(`Award commission error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get referral stats for user
   */
  getReferralStats(userId) {
    try {
      const codeData = this.db.prepare(`
        SELECT total_earned, pending_balance FROM referral_codes WHERE user_id = ?
      `).get(userId);

      const referrals = this.db.prepare(`
        SELECT COUNT(*) as count FROM referrals WHERE referrer_id = ?
      `).get(userId);

      const vipReferrals = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM referrals r
        JOIN users u ON r.referred_user_id = u.id
        WHERE r.referrer_id = ? AND u.vip_tier IN ('premium', 'plus')
      `).get(userId);

      return {
        total_referred: referrals.count || 0,
        vip_referrals: vipReferrals.count || 0,
        total_earned: codeData?.total_earned || 0,
        pending_balance: codeData?.pending_balance || 0
      };
    } catch (error) {
      logger.error(`Get referral stats error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Request withdrawal of pending balance
   */
  async requestWithdrawal(userId, amount, walletAddress) {
    try {
      // Validate inputs (defense in depth — routes validate too)
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Withdrawal amount must be a positive number');
      }
      if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.trim().length < 10) {
        throw new Error('A valid wallet address is required');
      }

      // Atomically hold the funds: deduct pending_balance when the request is
      // created so concurrent/duplicate requests cannot over-withdraw.
      const requestTx = this.db.transaction(() => {
        const hold = this.db.prepare(`
          UPDATE referral_codes
          SET pending_balance = pending_balance - ?
          WHERE user_id = ? AND pending_balance >= ?
        `).run(numericAmount, userId, numericAmount);

        if (hold.changes === 0) {
          throw new Error('Insufficient balance for withdrawal');
        }

        return this.db.prepare(`
          INSERT INTO withdrawals (user_id, amount, wallet_address, status, requested_at)
          VALUES (?, ?, ?, 'pending', datetime('now'))
        `).run(userId, numericAmount, walletAddress.trim());
      });

      const result = requestTx();

      logger.info(`Withdrawal requested: $${numericAmount} for user ${userId}`);

      return {
        withdrawal_id: result.lastInsertRowid,
        amount: numericAmount,
        status: 'pending',
        requested_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Request withdrawal error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Approve withdrawal (admin)
   * Funds were already held at request time, so approval only marks it paid.
   */
  async approveWithdrawal(withdrawalId, transactionId) {
    try {
      const withdrawal = this.db.prepare(`
        SELECT user_id, amount, status FROM withdrawals WHERE id = ?
      `).get(withdrawalId);

      if (!withdrawal) {
        throw new Error(`Withdrawal not found: ${withdrawalId}`);
      }
      if (withdrawal.status !== 'pending') {
        throw new Error(`Withdrawal ${withdrawalId} is already ${withdrawal.status}`);
      }

      const updated = this.db.prepare(`
        UPDATE withdrawals
        SET status = 'approved', transaction_id = ?, approved_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(transactionId, withdrawalId);

      if (updated.changes === 0) {
        throw new Error(`Withdrawal ${withdrawalId} could not be approved`);
      }

      logger.info(`Withdrawal approved: ${withdrawalId} (tx: ${transactionId})`);
      return { status: 'approved', transaction_id: transactionId };
    } catch (error) {
      logger.error(`Approve withdrawal error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject withdrawal (admin) — releases the held funds back to the user.
   */
  async rejectWithdrawal(withdrawalId, reason) {
    try {
      const withdrawal = this.db.prepare(`
        SELECT user_id, amount, status FROM withdrawals WHERE id = ?
      `).get(withdrawalId);

      if (!withdrawal) {
        throw new Error(`Withdrawal not found: ${withdrawalId}`);
      }
      if (withdrawal.status !== 'pending') {
        throw new Error(`Withdrawal ${withdrawalId} is already ${withdrawal.status}`);
      }

      const rejectTx = this.db.transaction(() => {
        const updated = this.db.prepare(`
          UPDATE withdrawals
          SET status = 'rejected', rejection_reason = ?, rejected_at = datetime('now')
          WHERE id = ? AND status = 'pending'
        `).run(reason || null, withdrawalId);

        if (updated.changes === 0) {
          throw new Error(`Withdrawal ${withdrawalId} could not be rejected`);
        }

        // Refund the held amount
        this.db.prepare(`
          UPDATE referral_codes
          SET pending_balance = pending_balance + ?
          WHERE user_id = ?
        `).run(withdrawal.amount, withdrawal.user_id);
      });

      rejectTx();

      logger.info(`Withdrawal rejected: ${withdrawalId}`);
      return { status: 'rejected' };
    } catch (error) {
      logger.error(`Reject withdrawal error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate referral code using a CSPRNG (Math.random is predictable)
   */
  generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(crypto.randomInt(chars.length));
    }
    return code;
  }
}
