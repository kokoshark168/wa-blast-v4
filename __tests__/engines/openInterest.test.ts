import { detectSqueeze } from '@/lib/engines/openInterest';
import type { OpenInterestSnapshot } from '@/types';

function snap(over: Partial<OpenInterestSnapshot>): OpenInterestSnapshot {
  return {
    symbol: 'BTC',
    exchange: 'BINANCE',
    openInterest: 1000,
    openInterestUsd: 1_000_000,
    fundingRate: 0,
    longShortRatio: 1,
    timestamp: 0,
    ...over,
  };
}

describe('openInterest.detectSqueeze', () => {
  it('returns NEUTRAL with probability 0 when history is insufficient', () => {
    const res = detectSqueeze([snap({})], 0);
    expect(res.type).toBe('NEUTRAL');
    expect(res.probability).toBe(0);
  });

  it('detects a LONG_SQUEEZE: hot positive funding + rising OI + crowded longs + stalling price', () => {
    const snapshots = [
      snap({ openInterestUsd: 1_000_000, fundingRate: 0.001, longShortRatio: 2.5, timestamp: 0 }),
      snap({
        openInterestUsd: 1_300_000,
        fundingRate: 0.001,
        longShortRatio: 2.5,
        timestamp: 8 * 3_600_000,
      }),
    ];
    const res = detectSqueeze(snapshots, 0.5);
    expect(res.type).toBe('LONG_SQUEEZE');
    expect(res.probability).toBeGreaterThan(0);
    expect(res.probability).toBeLessThanOrEqual(100);
    expect(res.rationale.length).toBeGreaterThan(0);
  });

  it('detects a SHORT_SQUEEZE: hot negative funding + crowded shorts', () => {
    const snapshots = [
      snap({ openInterestUsd: 1_000_000, fundingRate: -0.001, longShortRatio: 0.4, timestamp: 0 }),
      snap({
        openInterestUsd: 1_300_000,
        fundingRate: -0.001,
        longShortRatio: 0.4,
        timestamp: 8 * 3_600_000,
      }),
    ];
    const res = detectSqueeze(snapshots, 1);
    expect(res.type).toBe('SHORT_SQUEEZE');
    expect(res.probability).toBeGreaterThan(0);
    expect(res.probability).toBeLessThanOrEqual(100);
  });

  it('detects CROWDED when LSR is extreme but no clean trigger', () => {
    const snapshots = [
      snap({ openInterestUsd: 1_000_000, fundingRate: 0, longShortRatio: 3, timestamp: 0 }),
      snap({ openInterestUsd: 1_010_000, fundingRate: 0, longShortRatio: 3, timestamp: 8 * 3_600_000 }),
    ];
    const res = detectSqueeze(snapshots, 0.5);
    expect(res.type).toBe('CROWDED');
    expect(res.probability).toBeGreaterThan(0);
  });

  it('returns NEUTRAL for calm positioning', () => {
    const snapshots = [
      snap({ openInterestUsd: 1_000_000, fundingRate: 0, longShortRatio: 1, timestamp: 0 }),
      snap({ openInterestUsd: 1_010_000, fundingRate: 0, longShortRatio: 1, timestamp: 8 * 3_600_000 }),
    ];
    const res = detectSqueeze(snapshots, 0.5);
    expect(res.type).toBe('NEUTRAL');
    expect(res.probability).toBeGreaterThanOrEqual(0);
    expect(res.probability).toBeLessThanOrEqual(100);
  });

  it('always keeps probability within 0..100', () => {
    const snapshots = [
      snap({ openInterestUsd: 1_000_000, fundingRate: 0.05, longShortRatio: 10, timestamp: 0 }),
      snap({ openInterestUsd: 5_000_000, fundingRate: 0.05, longShortRatio: 10, timestamp: 8 * 3_600_000 }),
    ];
    const res = detectSqueeze(snapshots, 0);
    expect(res.probability).toBeGreaterThanOrEqual(0);
    expect(res.probability).toBeLessThanOrEqual(100);
  });
});
