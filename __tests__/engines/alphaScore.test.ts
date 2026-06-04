import {
  ALPHA_WEIGHTS,
  computeAlphaScore,
  ratingFor,
} from '@/lib/engines/alphaScore';
import type { AlphaScoreComponents } from '@/types';

const uniform = (v: number): AlphaScoreComponents => ({
  whaleActivity: v,
  smartMoneyActivity: v,
  openInterest: v,
  funding: v,
  onChain: v,
  sentiment: v,
  volume: v,
});

describe('alphaScore.ALPHA_WEIGHTS', () => {
  it('sums to 1.0', () => {
    const total = Object.values(ALPHA_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });
  it('has a weight for every component', () => {
    const keys: (keyof AlphaScoreComponents)[] = [
      'whaleActivity',
      'smartMoneyActivity',
      'openInterest',
      'funding',
      'onChain',
      'sentiment',
      'volume',
    ];
    for (const k of keys) expect(ALPHA_WEIGHTS[k]).toBeGreaterThan(0);
  });
});

describe('alphaScore.ratingFor thresholds', () => {
  it('59 -> NEUTRAL, 60 -> WATCHLIST', () => {
    expect(ratingFor(59)).toBe('NEUTRAL');
    expect(ratingFor(60)).toBe('WATCHLIST');
  });
  it('79 -> WATCHLIST, 80 -> STRONG_OPPORTUNITY', () => {
    expect(ratingFor(79)).toBe('WATCHLIST');
    expect(ratingFor(80)).toBe('STRONG_OPPORTUNITY');
  });
  it('39 -> AVOID, 40 -> NEUTRAL', () => {
    expect(ratingFor(39)).toBe('AVOID');
    expect(ratingFor(40)).toBe('NEUTRAL');
  });
});

describe('alphaScore.computeAlphaScore', () => {
  it('returns the same value when all components are equal', () => {
    const res = computeAlphaScore('BTC', uniform(50));
    expect(res.score).toBeCloseTo(50, 6);
    expect(res.rating).toBe('NEUTRAL');
  });

  it('produces a perfect score for all-100 inputs', () => {
    const res = computeAlphaScore('ETH', uniform(100));
    expect(res.score).toBe(100);
    expect(res.rating).toBe('STRONG_OPPORTUNITY');
  });

  it('produces 0 for all-0 inputs and rates AVOID', () => {
    const res = computeAlphaScore('SOL', uniform(0));
    expect(res.score).toBe(0);
    expect(res.rating).toBe('AVOID');
  });

  it('keeps the score within 0..100 even with out-of-range inputs', () => {
    const res = computeAlphaScore('X', uniform(1000));
    expect(res.score).toBeLessThanOrEqual(100);
    expect(res.score).toBeGreaterThanOrEqual(0);
  });

  it('blends components by weight (smartMoney dominates)', () => {
    const base = uniform(0);
    const smartHeavy: AlphaScoreComponents = { ...base, smartMoneyActivity: 100 };
    const fundingHeavy: AlphaScoreComponents = { ...base, funding: 100 };
    const smartScore = computeAlphaScore('A', smartHeavy).score;
    const fundingScore = computeAlphaScore('B', fundingHeavy).score;
    // smartMoney weight (.20) > funding weight (.10)
    expect(smartScore).toBeGreaterThan(fundingScore);
    expect(smartScore).toBeCloseTo(20, 6);
    expect(fundingScore).toBeCloseTo(10, 6);
  });

  it('echoes symbol and components back', () => {
    const comps = uniform(70);
    const res = computeAlphaScore('PEPE', comps);
    expect(res.symbol).toBe('PEPE');
    expect(res.components).toEqual(comps);
    expect(typeof res.generatedAt).toBe('number');
  });
});
