import {
  cagr,
  clamp,
  downsideDeviation,
  maxDrawdown,
  mean,
  normalize,
  profitFactor,
  sharpeRatio,
  sortinoRatio,
  stdDev,
  weightedAverage,
  winRate,
} from '@/lib/quant';

describe('quant.mean', () => {
  it('averages a list', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it('returns 0 for an empty array', () => {
    expect(mean([])).toBe(0);
  });
  it('handles a single element', () => {
    expect(mean([7])).toBe(7);
  });
});

describe('quant.stdDev', () => {
  it('computes sample std dev', () => {
    // sample sd of [2,4,4,4,5,5,7,9] = 2.138...
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 2);
  });
  it('returns 0 for fewer than 2 elements', () => {
    expect(stdDev([])).toBe(0);
    expect(stdDev([5])).toBe(0);
  });
  it('returns 0 for zero variance', () => {
    expect(stdDev([3, 3, 3, 3])).toBe(0);
  });
});

describe('quant.downsideDeviation', () => {
  it('only counts returns below target', () => {
    // returns [0.1, -0.2, 0.0, -0.1]; downside sq = [0,0.04,0,0.01]; mean=0.0125; sqrt~0.1118
    expect(downsideDeviation([0.1, -0.2, 0.0, -0.1])).toBeCloseTo(0.1118, 3);
  });
  it('is 0 when nothing is below target', () => {
    expect(downsideDeviation([0.1, 0.2, 0.3])).toBe(0);
  });
});

describe('quant.sharpeRatio', () => {
  it('is positive for a steadily positive return stream', () => {
    expect(sharpeRatio([0.01, 0.012, 0.011, 0.009, 0.013], 365)).toBeGreaterThan(0);
  });
  it('matches a hand-computed value', () => {
    const returns = [0.01, 0.02, 0.03];
    const m = mean(returns); // 0.02
    const sd = stdDev(returns); // 0.01
    const expected = (m / sd) * Math.sqrt(252);
    expect(sharpeRatio(returns, 252)).toBeCloseTo(expected, 6);
  });
  it('returns 0 for zero variance', () => {
    expect(sharpeRatio([0.01, 0.01, 0.01])).toBe(0);
  });
  it('returns 0 for fewer than 2 returns', () => {
    expect(sharpeRatio([0.01])).toBe(0);
  });
});

describe('quant.sortinoRatio', () => {
  it('is positive for a stream with positive mean and some downside', () => {
    expect(sortinoRatio([0.02, -0.01, 0.03, -0.005, 0.04], 365)).toBeGreaterThan(0);
  });
  it('returns 0 when there is no downside deviation', () => {
    expect(sortinoRatio([0.01, 0.02, 0.03])).toBe(0);
  });
  it('returns 0 for fewer than 2 returns', () => {
    expect(sortinoRatio([0.05])).toBe(0);
  });
});

describe('quant.maxDrawdown', () => {
  it('computes a known peak-to-trough decline', () => {
    // peak 120 -> trough 90 => dd = 30/120 = 0.25
    expect(maxDrawdown([100, 120, 90, 110])).toBeCloseTo(0.25, 6);
  });
  it('is 0 for a monotonically rising curve', () => {
    expect(maxDrawdown([100, 110, 120, 130])).toBe(0);
  });
  it('is 0 for an empty curve', () => {
    expect(maxDrawdown([])).toBe(0);
  });
});

describe('quant.cagr', () => {
  it('computes annualized growth over a year', () => {
    expect(cagr(10000, 12000, 365)).toBeCloseTo(0.2, 6);
  });
  it('returns 0 for non-positive start or zero days', () => {
    expect(cagr(0, 100, 365)).toBe(0);
    expect(cagr(100, 200, 0)).toBe(0);
  });
});

describe('quant.winRate', () => {
  it('is the fraction of positive returns', () => {
    expect(winRate([1, -1, 2, -3, 4])).toBeCloseTo(3 / 5, 6);
  });
  it('returns 0 for an empty array', () => {
    expect(winRate([])).toBe(0);
  });
  it('treats zero as a non-win', () => {
    expect(winRate([0, 0, 1])).toBeCloseTo(1 / 3, 6);
  });
});

describe('quant.profitFactor', () => {
  it('is gross profit over gross loss', () => {
    // profit 6, loss 4 => 1.5
    expect(profitFactor([2, 4, -1, -3])).toBeCloseTo(1.5, 6);
  });
  it('is Infinity when there are only wins', () => {
    expect(profitFactor([1, 2, 3])).toBe(Infinity);
  });
  it('is 0 when there are no returns', () => {
    expect(profitFactor([])).toBe(0);
  });
});

describe('quant.clamp', () => {
  it('clamps below min and above max', () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(42, 0, 100)).toBe(42);
  });
  it('defaults to 0..100', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(101)).toBe(100);
  });
});

describe('quant.normalize', () => {
  it('maps a value into 0..100 across a range', () => {
    expect(normalize(5, 0, 10)).toBe(50);
    expect(normalize(0, 0, 10)).toBe(0);
    expect(normalize(10, 0, 10)).toBe(100);
  });
  it('clamps out-of-range values', () => {
    expect(normalize(-5, 0, 10)).toBe(0);
    expect(normalize(20, 0, 10)).toBe(100);
  });
  it('returns 0 for a zero-width range', () => {
    expect(normalize(5, 5, 5)).toBe(0);
  });
});

describe('quant.weightedAverage', () => {
  it('weights values by their weights', () => {
    expect(
      weightedAverage([
        { value: 100, weight: 1 },
        { value: 0, weight: 1 },
      ]),
    ).toBe(50);
  });
  it('honors uneven weights', () => {
    expect(
      weightedAverage([
        { value: 100, weight: 3 },
        { value: 0, weight: 1 },
      ]),
    ).toBe(75);
  });
  it('returns 0 when total weight is 0', () => {
    expect(weightedAverage([{ value: 100, weight: 0 }])).toBe(0);
  });
});
