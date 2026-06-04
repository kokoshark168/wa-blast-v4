import { runBacktest, summarizeSignalBacktest } from '@/lib/engines/backtest';
import type { BacktestTrade } from '@/types';

const DAY = 86_400_000;

/** Build a trade spanning `dayIndex`..`dayIndex+1` with a given return. */
function trade(dayIndex: number, returnPct: number): BacktestTrade {
  return {
    entryTime: dayIndex * DAY,
    exitTime: (dayIndex + 1) * DAY,
    entryPrice: 100,
    exitPrice: 100 * (1 + returnPct),
    returnPct,
  };
}

describe('backtest.runBacktest', () => {
  it('returns a flat curve and zeroed metrics for no trades', () => {
    const res = runBacktest([]);
    expect(res.totalTrades).toBe(0);
    expect(res.equityCurve).toEqual([10000]);
    expect(res.winRate).toBe(0);
    expect(res.sharpeRatio).toBe(0);
    expect(res.maxDrawdown).toBe(0);
  });

  it('compounds returns into an equity curve seeded at startValue', () => {
    const trades = [trade(0, 0.1), trade(1, 0.1)];
    const res = runBacktest(trades, { startValue: 1000 });
    expect(res.equityCurve[0]).toBe(1000);
    expect(res.equityCurve[1]).toBeCloseTo(1100, 6);
    expect(res.equityCurve[2]).toBeCloseTo(1210, 6);
    expect(res.totalTrades).toBe(2);
  });

  it('computes winRate from the trade returns', () => {
    const trades = [trade(0, 0.05), trade(1, -0.02), trade(2, 0.03), trade(3, -0.01)];
    const res = runBacktest(trades);
    expect(res.winRate).toBeCloseTo(0.5, 6);
  });

  it('yields a positive Sharpe for a steady uptrend', () => {
    const trades = [
      trade(0, 0.01),
      trade(1, 0.012),
      trade(2, 0.011),
      trade(3, 0.013),
      trade(4, 0.009),
    ];
    const res = runBacktest(trades);
    expect(res.sharpeRatio).toBeGreaterThan(0);
    expect(res.winRate).toBe(1);
  });

  it('captures maxDrawdown across a known dip', () => {
    // +20% then -50% then +10%: peak 12000 -> trough 6000 => dd = 0.5
    const trades = [trade(0, 0.2), trade(1, -0.5), trade(2, 0.1)];
    const res = runBacktest(trades, { startValue: 10000 });
    expect(res.maxDrawdown).toBeCloseTo(0.5, 6);
  });

  it('computes positive cagr for a profitable year-long run', () => {
    const trades = [
      { entryTime: 0, exitTime: 365 * DAY, entryPrice: 100, exitPrice: 120, returnPct: 0.2 },
    ];
    const res = runBacktest(trades, { startValue: 10000 });
    expect(res.cagr).toBeGreaterThan(0);
  });
});

describe('backtest.summarizeSignalBacktest', () => {
  it('tags the strategy and drops the equity curve', () => {
    const trades = [trade(0, 0.05), trade(1, -0.02)];
    const summary = summarizeSignalBacktest('whale-follow', trades);
    expect(summary.strategy).toBe('whale-follow');
    expect(summary.totalTrades).toBe(2);
    expect('equityCurve' in summary).toBe(false);
  });
});
