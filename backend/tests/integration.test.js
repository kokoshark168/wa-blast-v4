/**
 * Integration Tests - Full workflows
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Database from 'better-sqlite3';
import path from 'path';
import { ReferralService } from '../referral/ReferralService.js';

describe('Referral Workflow', () => {
  let db;
  let service;

  beforeAll(() => {
    // Create test database
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Full schema
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        email TEXT UNIQUE,
        vip_tier TEXT DEFAULT 'free',
        vip_expires_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE referral_codes (
        id INTEGER PRIMARY KEY,
        user_id INTEGER UNIQUE,
        code TEXT UNIQUE,
        total_earned REAL DEFAULT 0,
        pending_balance REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE referrals (
        id INTEGER PRIMARY KEY,
        referrer_id INTEGER,
        referred_user_id INTEGER UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id)
      );

      CREATE TABLE referral_earnings (
        id INTEGER PRIMARY KEY,
        referrer_id INTEGER,
        referred_user_id INTEGER,
        amount REAL,
        status TEXT DEFAULT 'earned',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE withdrawals (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        amount REAL,
        wallet_address TEXT,
        status TEXT DEFAULT 'pending',
        transaction_id TEXT,
        requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        payment_id TEXT UNIQUE,
        status TEXT,
        amount REAL,
        tier TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE dramas (
        id INTEGER PRIMARY KEY,
        external_id TEXT UNIQUE,
        source TEXT,
        title TEXT,
        total_episodes INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE drama_parts (
        id INTEGER PRIMARY KEY,
        drama_id INTEGER,
        part_number INTEGER,
        episodes_start INTEGER,
        episodes_end INTEGER,
        file_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(drama_id, part_number),
        FOREIGN KEY (drama_id) REFERENCES dramas(id)
      );
    `);

    service = new ReferralService(db);
  });

  afterAll(() => {
    db.close();
  });

  it('should complete full referral workflow', async () => {
    // Step 1: Create referrer
    db.prepare(`
      INSERT INTO users (id, telegram_id, username, email)
      VALUES (?, ?, ?, ?)
    `).run(1, 111, 'referrer', 'referrer@test.com');

    // Step 2: Get referral code
    const code = await service.getOrCreateCode(1);
    expect(code.code).toBeDefined();
    expect(code.code).toHaveLength(8);

    // Step 3: New user signs up with referral
    db.prepare(`
      INSERT INTO users (id, telegram_id, username, email)
      VALUES (?, ?, ?, ?)
    `).run(2, 222, 'referred', 'referred@test.com');

    await service.applyReferralCode(2, code.code);

    // Step 4: Check referral recorded
    const referral = db.prepare('SELECT * FROM referrals WHERE referred_user_id = ?').get(2);
    expect(referral).toBeDefined();
    expect(referral.referrer_id).toBe(1);

    // Step 5: Award commission (VIP upgrade)
    db.prepare(`
      INSERT INTO referral_earnings (referrer_id, referred_user_id, amount, status)
      VALUES (?, ?, ?, 'earned')
    `).run(1, 2, 1.00);

    db.prepare(`
      UPDATE referral_codes SET pending_balance = 1.00 WHERE user_id = 1
    `).run();

    // Step 6: Request withdrawal
    const withdrawal = await service.requestWithdrawal(1, 1.00, '0xabc123');
    expect(withdrawal.status).toBe('pending');

    // Step 7: Admin approves
    await service.approveWithdrawal(withdrawal.withdrawal_id, 'tx123');

    const approvedWithdrawal = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(withdrawal.withdrawal_id);
    expect(approvedWithdrawal.status).toBe('approved');
    expect(approvedWithdrawal.transaction_id).toBe('tx123');

    // Step 8: Verify balance reduced
    const updated = db.prepare('SELECT pending_balance FROM referral_codes WHERE user_id = 1').get();
    expect(updated.pending_balance).toBe(0);
  });

  it('should handle VIP upgrade with payment', async () => {
    // Create user
    db.prepare(`
      INSERT INTO users (id, telegram_id, username)
      VALUES (?, ?, ?)
    `).run(10, 1000, 'vipuser');

    // Record payment
    db.prepare(`
      INSERT INTO payments (user_id, payment_id, status, amount, tier)
      VALUES (?, ?, ?, ?, ?)
    `).run(10, 'pay-123', 'confirmed', 9.99, 'premium');

    // Update user VIP
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      UPDATE users
      SET vip_tier = 'premium', vip_expires_at = ?
      WHERE id = ?
    `).run(expiresAt, 10);

    // Verify
    const user = db.prepare('SELECT vip_tier, vip_expires_at FROM users WHERE id = ?').get(10);
    expect(user.vip_tier).toBe('premium');
    expect(new Date(user.vip_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('should cache drama parts with file_id', async () => {
    // Create drama
    db.prepare(`
      INSERT INTO dramas (id, external_id, source, title, total_episodes)
      VALUES (?, ?, ?, ?, ?)
    `).run(100, 'ext-100', 'TestAdapter', 'Test Drama', 120);

    // Create parts
    db.prepare(`
      INSERT INTO drama_parts (drama_id, part_number, episodes_start, episodes_end, file_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(100, 1, 1, 30, 'file_id_1');

    db.prepare(`
      INSERT INTO drama_parts (drama_id, part_number, episodes_start, episodes_end, file_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(100, 2, 31, 60, 'file_id_2');

    // Retrieve parts
    const parts = db.prepare(`
      SELECT * FROM drama_parts WHERE drama_id = ? ORDER BY part_number
    `).all(100);

    expect(parts).toHaveLength(2);
    expect(parts[0].file_id).toBe('file_id_1');
    expect(parts[1].file_id).toBe('file_id_2');
    expect(parts[0].episodes_start).toBe(1);
    expect(parts[1].episodes_end).toBe(60);
  });
});

describe('Database Schema', () => {
  let db;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterAll(() => {
    db.close();
  });

  it('should enforce foreign key constraints', () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    db.prepare('INSERT INTO parent (id) VALUES (1)').run();
    db.prepare('INSERT INTO child (id, parent_id) VALUES (1, 1)').run();

    // This should fail
    expect(() => {
      db.prepare('INSERT INTO child (id, parent_id) VALUES (2, 999)').run();
    }).toThrow();
  });

  it('should enforce unique constraints', () => {
    db.exec(`
      CREATE TABLE users_test (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE
      );
    `);

    db.prepare('INSERT INTO users_test (id, email) VALUES (1, "test@test.com")').run();

    expect(() => {
      db.prepare('INSERT INTO users_test (id, email) VALUES (2, "test@test.com")').run();
    }).toThrow();
  });
});
