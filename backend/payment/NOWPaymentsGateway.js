/**
 * NOWPayments Gateway
 * Crypto payment processing for VIP subscriptions
 * Supports USDT (TRC20, ERC20, BSC) with webhook notifications
 */
import pino from 'pino';
import crypto from 'crypto';
import db from '../utils/db.js';
import { ReferralService } from '../referral/ReferralService.js';

const logger = pino();
const referralService = new ReferralService(db);

export class NOWPaymentsGateway {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.NOWPAYMENTS_API_KEY;
    this.ipnSecret = config.ipnSecret || process.env.NOWPAYMENTS_IPN_SECRET;
    this.baseUrl = 'https://api.nowpayments.io/v1';
    this.timeout = 10000;

    if (!this.apiKey) {
      logger.warn('NOWPayments API key not configured');
    }
  }

  /**
   * Create payment invoice
   * @param {Object} options - { user_id, amount, currency, tier, webhook_url }
   * @returns {Promise<Object>} Invoice with payment ID and address
   */
  async createInvoice(options) {
    const { userId, amount, currency = 'USDTERC20', tier = 'premium', webhookUrl } = options;

    if (!userId) throw new Error('userId is required');
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      throw new Error('amount must be a positive number');
    }

    const orderId = `order-${userId}-${Date.now()}`;

    try {
      const response = await this._request('/invoice', {
        method: 'POST',
        data: {
          price_amount: amount,
          price_currency: 'USD',
          pay_currency: currency,
          order_id: orderId,
          order_description: `VIP ${tier} Subscription`,
          notify_url: webhookUrl || process.env.WEBHOOK_URL,
          success_url: `${process.env.APP_URL}/vip/success`,
          cancel_url: `${process.env.APP_URL}/vip/cancel`
        }
      });

      if (!response.id) {
        throw new Error('Invalid invoice response');
      }

      // Store payment record. order_id is the stable correlation key: the IPN
      // webhook reports a payment_id that differs from the invoice id.
      db.prepare(`
        INSERT INTO payments (user_id, payment_id, order_id, status, amount, currency, tier, created_at)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, datetime('now'))
      `).run(userId, String(response.id), orderId, amount, currency, tier);

      logger.info(`Invoice created: ${response.id} for user ${userId}`);

      return {
        payment_id: response.id,
        pay_address: response.pay_address,
        price_amount: response.price_amount,
        price_currency: response.price_currency,
        pay_currency: response.pay_currency,
        expires_at: response.expires_at,
        invoice_url: response.invoice_url
      };
    } catch (error) {
      logger.error(`Create invoice error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await this._request(`/payment/${paymentId}`);

      return {
        id: response.id,
        status: response.status, // 'waiting', 'confirming', 'confirmed', 'sending', 'finished', 'failed', 'refunded'
        pay_address: response.pay_address,
        pay_amount: response.pay_amount,
        pay_currency: response.pay_currency,
        price_amount: response.price_amount,
        price_currency: response.price_currency,
        tx_id: response.txid
      };
    } catch (error) {
      logger.error(`Get payment status error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body, signature) {
    if (!this.ipnSecret) {
      logger.warn('IPN secret not configured');
      return false;
    }

    if (!signature || typeof signature !== 'string' || !body || typeof body !== 'object') {
      return false;
    }

    // NOWPayments IPN spec: HMAC-SHA512 over the JSON body with keys sorted
    // alphabetically (recursively), hex-encoded.
    const sortObject = (obj) => {
      if (Array.isArray(obj)) return obj.map(sortObject);
      if (obj && typeof obj === 'object') {
        return Object.keys(obj).sort().reduce((acc, key) => {
          acc[key] = sortObject(obj[key]);
          return acc;
        }, {});
      }
      return obj;
    };

    const hash = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(JSON.stringify(sortObject(body)))
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const expected = Buffer.from(hash, 'utf8');
    const provided = Buffer.from(signature, 'utf8');
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(expected, provided);
  }

  /**
   * Process webhook callback
   * Updates payment status and applies VIP upgrade if confirmed
   */
  async processWebhook(paymentData) {
    // IPN payloads use payment_id; invoice creation responses use id.
    const paymentId = paymentData.payment_id ?? paymentData.id;
    const orderId = paymentData.order_id;
    const { payment_status, status: rawStatus, pay_amount } = paymentData;
    const status = payment_status || rawStatus;

    try {
      logger.info(`Processing webhook for payment ${paymentId} (order ${orderId}): status=${status}`);

      if (!paymentId && !orderId) {
        return { success: false, error: 'Missing payment identifier' };
      }

      // Correlate by order_id first (stable across invoice -> payment), then payment_id
      const payment =
        (orderId && db.prepare(`
          SELECT id, user_id, tier, status as old_status FROM payments WHERE order_id = ?
        `).get(orderId)) ||
        (paymentId && db.prepare(`
          SELECT id, user_id, tier, status as old_status FROM payments WHERE payment_id = ?
        `).get(String(paymentId)));

      if (!payment) {
        logger.warn(`Payment not found: ${paymentId} / ${orderId}`);
        return { success: false, error: 'Payment not found' };
      }

      // Idempotency: once a payment reached a terminal success state, ignore
      // further (possibly out-of-order or replayed) updates.
      const terminal = ['finished', 'confirmed'];
      if (terminal.includes(payment.old_status)) {
        logger.info(`Payment ${payment.id} already ${payment.old_status}, skipping update`);
        return { success: true, status: payment.old_status, skipped: true };
      }

      // Update payment status (also record the real payment_id from the IPN)
      db.prepare(`
        UPDATE payments
        SET status = ?, payment_id = COALESCE(?, payment_id), pay_amount = ?, txid = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(status, paymentId ? String(paymentId) : null, pay_amount ?? null, paymentData.txid ?? null, payment.id);

      // If payment confirmed, upgrade VIP and award referral commission
      if (status === 'confirmed' || status === 'finished') {
        await this.upgradeVIP(payment.user_id, payment.tier);

        try {
          await referralService.awardCommission(payment.user_id);
        } catch (error) {
          // Commission failure must not block the user's upgrade
          logger.error(`Referral commission error for user ${payment.user_id}: ${error.message}`);
        }
      }

      // If payment failed, don't do anything (user can retry)
      if (status === 'failed' || status === 'refunded' || status === 'expired') {
        logger.warn(`Payment ${payment.id} ${status}`);
      }

      return { success: true, status };
    } catch (error) {
      logger.error(`Webhook process error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upgrade user to VIP tier
   */
  async upgradeVIP(userId, tier) {
    try {
      const tiers = {
        free: { storage: 1, concurrent: 1, bandwidth: 10 },
        premium: { storage: 100, concurrent: 5, bandwidth: 500 },
        plus: { storage: 500, concurrent: 20, bandwidth: 2000 }
      };

      // Only known tiers may be written (users.vip_tier has a CHECK constraint)
      if (!Object.prototype.hasOwnProperty.call(tiers, tier)) {
        logger.warn(`Unknown tier "${tier}", defaulting to premium`);
        tier = 'premium';
      }
      const tierConfig = tiers[tier];
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      db.prepare(`
        UPDATE users
        SET vip_tier = ?, vip_expires_at = ?, storage_limit_gb = ?, concurrent_uploads = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(tier, expiresAt.toISOString(), tierConfig.storage, tierConfig.concurrent, userId);

      db.prepare(`
        INSERT OR REPLACE INTO vip_subscriptions
        (user_id, tier, storage_limit_gb, concurrent_uploads, download_bandwidth_gb_month, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(userId, tier, tierConfig.storage, tierConfig.concurrent, tierConfig.bandwidth, expiresAt.toISOString());

      logger.info(`User ${userId} upgraded to ${tier}`);
      return true;
    } catch (error) {
      logger.error(`Upgrade VIP error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Refund payment
   */
  async refundPayment(paymentId, reason = '') {
    try {
      const response = await this._request(`/payment/${paymentId}/refund`, {
        method: 'POST',
        data: { reason }
      });

      logger.info(`Refund initiated for payment ${paymentId}`);
      return response;
    } catch (error) {
      logger.error(`Refund error: ${error.message}`);
      throw error;
    }
  }

  /**
   * List available currencies
   */
  async getCurrencies() {
    try {
      const response = await this._request('/currencies');
      return response.currencies || [];
    } catch (error) {
      logger.error(`Get currencies error: ${error.message}`);
      return [];
    }
  }

  /**
   * HTTP request helper
   */
  async _request(endpoint, options = {}) {
    const { method = 'GET', data = null } = options;
    const url = `${this.baseUrl}${endpoint}`;

    if (!this.apiKey) {
      throw new Error('NOWPayments API key is not configured');
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: data ? JSON.stringify(data) : undefined,
        // fetch() has no `timeout` option; AbortSignal is the supported mechanism
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(this.timeout) : undefined
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${response.statusText} ${errorBody}`.trim());
      }

      return await response.json();
    } catch (error) {
      logger.error(`API request error: ${error.message}`);
      throw error;
    }
  }
}

// Export singleton
export const paymentGateway = new NOWPaymentsGateway();
