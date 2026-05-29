/**
 * Unit Tests - Adapters, Services, Workers
 */
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { BaseAdapter } from '../adapters/base/BaseAdapter.js';
import { DramaBoxAdapter } from '../adapters/full/DramaBoxAdapter.js';
import { AdapterRegistry } from '../adapters/registry.js';
import { ReferralService } from '../referral/ReferralService.js';
import Database from 'better-sqlite3';
import path from 'path';

describe('BaseAdapter', () => {
  let adapter;

  beforeAll(() => {
    adapter = new BaseAdapter('TestAdapter', { baseUrl: 'http://test.local' });
  });

  it('should initialize with name and config', () => {
    expect(adapter.name).toBe('TestAdapter');
    expect(adapter.baseUrl).toBe('http://test.local');
  });

  it('should throw error if search not implemented', async () => {
    await expect(adapter.search('test')).rejects.toThrow('search() not implemented');
  });

  it('should validate configuration', () => {
    expect(adapter.validate()).toBe(true);
  });

  it('should normalize drama data', () => {
    const normalized = adapter._normalizeDrama({
      id: 1,
      title: 'Test Drama',
      image: 'http://test.jpg',
      year: 2024,
      total_episodes: 16,
      rating: 8.5
    });

    expect(normalized.id).toBe(1);
    expect(normalized.title).toBe('Test Drama');
    expect(normalized.year).toBe(2024);
  });

  it('should normalize episode data', () => {
    const normalized = adapter._normalizeEpisode({
      episode_number: 1,
      title: 'Episode 1',
      url: 'http://test.mp4',
      duration_seconds: 3600,
      quality: '720p'
    });

    expect(normalized.episode_number).toBe(1);
    expect(normalized.title).toBe('Episode 1');
    expect(normalized.url).toBe('http://test.mp4');
  });
});

describe('AdapterRegistry', () => {
  let registry;
  let adapter1, adapter2;

  beforeAll(() => {
    registry = new AdapterRegistry();
    adapter1 = new BaseAdapter('Adapter1', { baseUrl: 'http://test1.local' });
    adapter2 = new BaseAdapter('Adapter2', { baseUrl: 'http://test2.local' });
  });

  it('should register adapters', () => {
    const result = registry.register(adapter1, 'full');
    expect(result).toBe(true);
  });

  it('should track adapter groups', () => {
    registry.register(adapter1, 'full');
    registry.register(adapter2, 'search');

    const summary = registry.getSummary();
    expect(summary.total).toBeGreaterThan(0);
  });

  it('should retrieve registered adapter', () => {
    registry.register(adapter1, 'full');
    const retrieved = registry.getAdapter('Adapter1');
    expect(retrieved).toBeDefined();
    expect(retrieved.name).toBe('Adapter1');
  });

  it('should list all adapters', () => {
    const adapters = registry.listAdapters();
    expect(Array.isArray(adapters)).toBe(true);
  });
});

describe('ReferralService', () => {
  let db;
  let service;

  beforeAll(() => {
    // Create in-memory test database
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Initialize schema
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        telegram_id INTEGER,
        username TEXT,
        vip_tier TEXT DEFAULT 'free'
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
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    service = new ReferralService(db);

    // Insert test users
    db.prepare('INSERT INTO users (id, telegram_id, username) VALUES (?, ?, ?)').run(1, 123, 'user1');
    db.prepare('INSERT INTO users (id, telegram_id, username) VALUES (?, ?, ?)').run(2, 456, 'user2');
  });

  afterAll(() => {
    db.close();
  });

  it('should generate unique referral codes', async () => {
    const code1 = await service.getOrCreateCode(1);
    const code2 = await service.getOrCreateCode(2);

    expect(code1.code).toBeDefined();
    expect(code2.code).toBeDefined();
    expect(code1.code).not.toBe(code2.code);
  });

  it('should apply referral code', async () => {
    const code = await service.getOrCreateCode(1);
    const result = await service.applyReferralCode(2, code.code);

    expect(result.referrer_id).toBe(1);
  });

  it('should calculate referral stats', () => {
    const stats = service.getReferralStats(1);

    expect(stats).toHaveProperty('total_referred');
    expect(stats).toHaveProperty('total_earned');
    expect(stats).toHaveProperty('pending_balance');
  });

  it('should request withdrawal', async () => {
    // Award commission first
    db.prepare(`
      INSERT INTO referral_earnings (referrer_id, referred_user_id, amount, status)
      VALUES (?, ?, ?, 'earned')
    `).run(1, 2, 1.00);

    db.prepare(`
      UPDATE referral_codes SET pending_balance = 1.00 WHERE user_id = 1
    `).run();

    const withdrawal = await service.requestWithdrawal(1, 1.00, '0x123...');

    expect(withdrawal.status).toBe('pending');
    expect(withdrawal.amount).toBe(1.00);
  });
});

describe('Code Generation', () => {
  it('should generate unique referral codes', () => {
    const service = new ReferralService({});
    const codes = new Set();

    for (let i = 0; i < 100; i++) {
      const code = service.generateCode();
      expect(code).toHaveLength(8);
      expect(codes.has(code)).toBe(false);
      codes.add(code);
    }
  });
});
