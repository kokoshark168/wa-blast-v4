import {
  buildWhaleTransaction,
  classifyTransaction,
  tierFor,
  type RawWhaleTransfer,
  type WhaleContext,
} from '@/lib/engines/whale';

const EX = '0xexchange';
const SMART = '0xsmart';
const EOA_A = '0xalice';
const EOA_B = '0xbob';

const ctx: WhaleContext = {
  isExchangeAddress: (a) => a === EX,
  isSmartMoney: (a) => a === SMART,
};

describe('whale.tierFor boundaries', () => {
  it('returns null below $100k', () => {
    expect(tierFor(99_000)).toBeNull();
    expect(tierFor(0)).toBeNull();
  });
  it('returns 100k at exactly $100k', () => {
    expect(tierFor(100_000)).toBe('100k');
    expect(tierFor(999_999)).toBe('100k');
  });
  it('returns 1m at exactly $1m', () => {
    expect(tierFor(1_000_000)).toBe('1m');
    expect(tierFor(9_999_999)).toBe('1m');
  });
  it('returns 10m at exactly $10m', () => {
    expect(tierFor(10_000_000)).toBe('10m');
    expect(tierFor(50_000_000)).toBe('10m');
  });
});

describe('whale.classifyTransaction', () => {
  it('flags EXCHANGE_INFLOW when sending to an exchange', () => {
    expect(classifyTransaction({ from: EOA_A, to: EX, valueUsd: 200_000 }, ctx)).toBe(
      'EXCHANGE_INFLOW',
    );
  });
  it('flags EXCHANGE_OUTFLOW when receiving from an exchange', () => {
    expect(classifyTransaction({ from: EX, to: EOA_A, valueUsd: 200_000 }, ctx)).toBe(
      'EXCHANGE_OUTFLOW',
    );
  });
  it('flags SMART_MONEY_ACCUMULATION for EOA->smart-money', () => {
    expect(classifyTransaction({ from: EOA_A, to: SMART, valueUsd: 500_000 }, ctx)).toBe(
      'SMART_MONEY_ACCUMULATION',
    );
  });
  it('flags TREASURY_MOVEMENT for >=$10m EOA->EOA', () => {
    expect(classifyTransaction({ from: EOA_A, to: EOA_B, valueUsd: 12_000_000 }, ctx)).toBe(
      'TREASURY_MOVEMENT',
    );
  });
  it('flags OTC_MOVEMENT for sub-$10m EOA->EOA', () => {
    expect(classifyTransaction({ from: EOA_A, to: EOA_B, valueUsd: 500_000 }, ctx)).toBe(
      'OTC_MOVEMENT',
    );
  });
  it('flags UNKNOWN for exchange->exchange', () => {
    expect(classifyTransaction({ from: EX, to: EX, valueUsd: 500_000 }, ctx)).toBe('UNKNOWN');
  });
});

describe('whale.buildWhaleTransaction', () => {
  const raw: RawWhaleTransfer = {
    txHash: '0xhash',
    chain: 'ethereum',
    from: EX,
    to: EOA_A,
    tokenSymbol: 'ETH',
    tokenAddress: '0xtoken',
    amount: 100,
    valueUsd: 250_000,
    timestamp: 1_700_000_000_000,
  };

  it('builds a fully-classified, tiered transaction', () => {
    const tx = buildWhaleTransaction(raw, ctx);
    expect(tx).not.toBeNull();
    expect(tx?.tier).toBe('100k');
    expect(tx?.classification).toBe('EXCHANGE_OUTFLOW');
    expect(tx?.txHash).toBe('0xhash');
  });

  it('returns null for sub-whale transfers', () => {
    expect(buildWhaleTransaction({ ...raw, valueUsd: 50_000 }, ctx)).toBeNull();
  });
});
