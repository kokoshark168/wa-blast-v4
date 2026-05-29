/**
 * NOWPayments Gateway
 * Crypto payment processing for VIP subscriptions
 * Supports USDT (TRC20, ERC20, BSC) with webhook notifications
 */
import pino from 'pino';
import crypto from 'crypto';
import db from '../utils/db.js';

const logger = pino();

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

    try {
      const response = await this._request('/invoice', {
        method: 'POST',
        data: {
          price_amount: amount,
          price_currency: 'USD',
          pay_currency: currency,
          order_id: `order-${userId}-${Date.now()}`,
          order_description: `VIP ${tier} Subscription`,
          notify_url: webhookUrl || process.env.WEBHOOK_URL,
          success_url: `${process.env.APP_URL}/vip/success`,
          cancel_url: `${process.env.APP_URL}/vip/cancel`
        }
      });

      if (!response.id) {
        throw new Error('Invalid invoice response');
      }

      // Store payment record
      db.prepare(`
        INSERT INTO payments (user_id, payment_id, status, amount, currency, tier, created_at)
        VALUES (?, ?, 'pending', ?, ?, ?, datetime('now'))
      `).run(userId, response.id, amount, currency, tier);

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

    const sortedData = Object.keys(body)
      .sort()
      .map(key => `${key}=${body[key]}`)
      .join('&');

    const hash = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sortedData)
      .digest('hex');

    return hash === signature;
  }

  /**
   * Process webhook callback
   * Updates payment status and applies VIP upgrade if confirmed
   */
  async processWebhook(paymentData) {
    const { id: paymentId, status, pay_amount, price_amount } = paymentData;

    try {
      logger.info(`Processing webhook for payment ${paymentId}: status=${status}`);

      const payment = db.prepare(`
        SELECT user_id, tier, status as old_status
        FROM payments
        WHERE payment_id = ?
      `).get(paymentId);

      if (!payment) {
        logger.warn(`Payment not found: ${paymentId}`);
        return { success: false, error: 'Payment not found' };
      }

      // Update payment status
      db.prepare(`
        UPDATE payments
        SET status = ?, pay_amount = ?, txid = ?, updated_at = datetime('now')
        WHERE payment_id = ?
      `).run(status, pay_amount, paymentData.txid, paymentId);

      // If payment confirmed, upgrade VIP
      if (status === 'confirmed' || status === 'finished') {
        await this.upgradeVIP(payment.user_id, payment.tier);
      }

      // If payment failed, don't do anything (user can retry)
      if (status === 'failed' || status === 'refunded') {
        logger.warn(`Payment ${paymentId} failed or refunded`);
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

      const tierConfig = tiers[tier] || tiers.free;
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

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey
        },
        body: data ? JSON.stringify(data) : undefined,
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
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
