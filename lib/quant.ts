/**
 * Shared quantitative helpers used by the backtesting engine, alpha scoring,
 * and risk metrics. Pure functions — fully unit-testable.
 */

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/** Downside deviation: std dev of returns below a target (default 0). */
export function downsideDeviation(returns: number[], target = 0): number {
  const downside = returns.map((r) => Math.min(0, r - target) ** 2);
  if (downside.length === 0) return 0;
  return Math.sqrt(mean(downside));
}

/**
 * Annualized Sharpe ratio.
 * @param returns periodic returns (as decimals, e.g. 0.01 = 1%)
 * @param periodsPerYear e.g. 365 for daily, 252 for trading days
 * @param riskFreeRate annual risk-free rate
 */
export function sharpeRatio(returns: number[], periodsPerYear = 365, riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const rfPerPeriod = riskFreeRate / periodsPerYear;
  const excess = returns.map((r) => r - rfPerPeriod);
  const sd = stdDev(excess);
  if (sd === 0) return 0;
  return (mean(excess) / sd) * Math.sqrt(periodsPerYear);
}

/** Annualized Sortino ratio (uses downside deviation). */
export function sortinoRatio(returns: number[], periodsPerYear = 365, riskFreeRate = 0): number {
  if (returns.length < 2) return 0;
  const rfPerPeriod = riskFreeRate / periodsPerYear;
  const excess = returns.map((r) => r - rfPerPeriod);
  const dd = downsideDeviation(excess);
  if (dd === 0) return 0;
  return (mean(excess) / dd) * Math.sqrt(periodsPerYear);
}

/**
 * Maximum drawdown from an equity curve. Returns a positive fraction
 * (0.2 == a 20% peak-to-trough decline).
 */
export function maxDrawdown(equityCurve: number[]): number {
  let peak = -Infinity;
  let maxDd = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/**
 * Compound annual growth rate.
 * @param startValue / endValue equity values
 * @param days duration of the period in days
 */
export function cagr(startValue: number, endValue: number, days: number): number {
  if (startValue <= 0 || days <= 0) return 0;
  const years = days / 365;
  return (endValue / startValue) ** (1 / years) - 1;
}

/** Win rate from a list of trade returns. */
export function winRate(returns: number[]): number {
  if (returns.length === 0) return 0;
  return returns.filter((r) => r > 0).length / returns.length;
}

/** Profit factor = gross profit / gross loss. */
export function profitFactor(returns: number[]): number {
  const grossProfit = returns.filter((r) => r > 0).reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(returns.filter((r) => r < 0).reduce((a, b) => a + b, 0));
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/** Clamp a value into [min, max]. */
export function clamp(x: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, x));
}

/** Min-max normalize a value into 0..100 given an expected range. */
export function normalize(value: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp(((value - lo) / (hi - lo)) * 100);
}

/** Weighted average where weights need not sum to 1. */
export function weightedAverage(pairs: { value: number; weight: number }[]): number {
  const totalWeight = pairs.reduce((a, p) => a + p.weight, 0);
  if (totalWeight === 0) return 0;
  return pairs.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight;
}
