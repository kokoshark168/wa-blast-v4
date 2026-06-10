/**
 * Payment Gateway Tests - IPN signature verification, webhook processing,
 * VIP upgrade and referral commission wiring.
 *
 * Uses an in-memory database: DATABASE_PATH must be set before the shared
 * db module is imported, hence the dynamic imports.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import crypto from 'crypto';

process.env.DATABASE_PATH = ':memory:';
process.env.NOWPAYMENTS_API_KEY = 'test-api-key';
process.env.NOWPAYMENTS_IPN_SECRET = 'test-ipn-secret';

const { default: db } = await import('../db/init.js');
const { NOWPaymentsGateway } = await import('../payment/NOWPaymentsGateway.js');

function signBody(body, secret) {
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
  return crypto.createHmac('sha512', secret).update(JSON.stringify(sortObject(body))).digest('hex');
}

describe('NOWPayments webhook signature', () => {
  const gateway = new NOWPaymentsGateway({ apiKey: 'k', ipnSecret: 'test-ipn-secret' });

  it('accepts a correctly signed body', () => {
    const body = { payment_id: 123, payment_status: 'finished', order_id: 'order-1-1' };
    const signature = signBody(body, 'test-ipn-secret');
    expect(gateway.verifyWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = { payment_id: 123, payment_status: 'finished', order_id: 'order-1-1' };
    const signature = signBody(body, 'test-ipn-secret');
    expect(gateway.verifyWebhookSignature({ ...body, payment_status: 'failed' }, signature)).toBe(false);
  });

  it('rejects missing or malformed signatures', () => {
    const body = { payment_id: 123 };
    expect(gateway.verifyWebhookSignature(body, undefined)).toBe(false);
    expect(gateway.verifyWebhookSignature(body, '')).toBe(false);
    expect(gateway.verifyWebhookSignature(body, 'deadbeef')).toBe(false);
  });

  it('rejects everything when the IPN secret is not configured', () => {
    const unconfigured = new NOWPaymentsGateway({ apiKey: 'k', ipnSecret: null });
    const body = { payment_id: 123 };
    expect(unconfigured.verifyWebhookSignature(body, signBody(body, ''))).toBe(false);
  });
});

describe('NOWPayments webhook processing', () => {
  const gateway = new NOWPaymentsGateway({ apiKey: 'k', ipnSecret: 'test-ipn-secret' });

  beforeAll(() => {
    // Referrer (id 1) and the paying, referred user (id 2)
    db.prepare("INSERT INTO users (id, telegram_id, username) VALUES (1, 111, 'referrer')").run();
    db.prepare("INSERT INTO users (id, telegram_id, username) VALUES (2, 222, 'buyer')").run();
    db.prepare(`
      INSERT INTO referral_codes (user_id, code, total_earned, pending_balance)
      VALUES (1, 'REFCODE1', 0, 0)
    `).run();
    db.prepare('INSERT INTO referrals (referrer_id, referred_user_id) VALUES (1, 2)').run();
    db.prepare(`
      INSERT INTO payments (user_id, payment_id, order_id, status, amount, currency, tier)
      VALUES (2, 'inv-1', 'order-2-1', 'pending', 9.99, 'USDTTRC20', 'premium')
    `).run();
  });

  it('upgrades VIP and awards referral commission on finished payment', async () => {
    const result = await gateway.processWebhook({
      payment_id: 555,
      payment_status: 'finished',
      order_id: 'order-2-1',
      pay_amount: 9.99,
      txid: '0xabc'
    });

    expect(result.success).toBe(true);

    const user = db.prepare('SELECT vip_tier, vip_expires_at FROM users WHERE id = 2').get();
    expect(user.vip_tier).toBe('premium');
    expect(new Date(user.vip_expires_at).getTime()).toBeGreaterThan(Date.now());

    const payment = db.prepare("SELECT status, payment_id FROM payments WHERE order_id = 'order-2-1'").get();
    expect(payment.status).toBe('finished');
    expect(payment.payment_id).toBe('555');

    // Referral commission awarded exactly once
    const code = db.prepare('SELECT total_earned, pending_balance FROM referral_codes WHERE user_id = 1').get();
    expect(code.total_earned).toBe(1);
    expect(code.pending_balance).toBe(1);
  });

  it('is idempotent: a replayed webhook does not double-award', async () => {
    const result = await gateway.processWebhook({
      payment_id: 555,
      payment_status: 'finished',
      order_id: 'order-2-1',
      pay_amount: 9.99,
      txid: '0xabc'
    });

    expect(result.skipped).toBe(true);

    const code = db.prepare('SELECT total_earned, pending_balance FROM referral_codes WHERE user_id = 1').get();
    expect(code.total_earned).toBe(1);
    expect(code.pending_balance).toBe(1);
  });

  it('returns an error for unknown payments', async () => {
    const result = await gateway.processWebhook({
      payment_id: 999999,
      payment_status: 'finished',
      order_id: 'order-does-not-exist'
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid tiers via the CHECK-safe default', async () => {
    db.prepare("INSERT INTO users (id, telegram_id, username) VALUES (3, 333, 'other')").run();
    await gateway.upgradeVIP(3, "plus'); DROP TABLE users; --");
    const user = db.prepare('SELECT vip_tier FROM users WHERE id = 3').get();
    expect(user.vip_tier).toBe('premium'); // fell back to a known tier
  });
});
