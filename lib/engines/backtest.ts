/**
 * Backtesting engine — turns a list of closed trades into an equity curve and
 * standard performance/risk metrics. Pure & deterministic; all math via lib/quant.
 */
import type { BacktestMetrics, BacktestTrade } from '@/types';
import { childLogger } from '@/lib/logger';
import {
  cagr as quantCagr,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  winRate as quantWinRate,
} from '@/lib/quant';

const log = childLogger('engine:backtest');

const DEFAULT_START_VALUE = 10_000;
const DEFAULT_PERIODS_PER_YEAR = 365;

export interface BacktestOptions {
  /** Starting equity used to seed the curve. Defaults to 10,000. */
  startValue?: number;
  /** Periods/year for annualizing Sharpe/Sortino. Defaults to 365 (daily). */
  periodsPerYear?: number;
}

/**
 * Run a backtest over a sequence of trades (assumed time-ordered).
 *
 * - Returns are taken from each trade's `returnPct` (a decimal, e.g. 0.02 = +2%).
 * - equityCurve compounds those returns from `startValue`: eq[i] = eq[i-1] * (1+r).
 * - winRate, sharpeRatio, sortinoRatio, maxDrawdown, cagr all come from lib/quant.
 * - cagr spans the first entryTime → last exitTime in days.
 */
export function runBacktest(
  trades: BacktestTrade[],
  opts: BacktestOptions = {},
): BacktestMetrics & { equityCurve: number[] } {
  const startValue = opts.startValue ?? DEFAULT_START_VALUE;
  const periodsPerYear = opts.periodsPerYear ?? DEFAULT_PERIODS_PER_YEAR;

  if (trades.length === 0) {
    return {
      winRate: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      cagr: 0,
      totalTrades: 0,
      equityCurve: [startValue],
    };
  }

  const returns = trades.map((t) => t.returnPct);

  // Compound the returns into an equity curve seeded at startValue.
  const equityCurve: number[] = [startValue];
  for (const r of returns) {
    const prev = equityCurve[equityCurve.length - 1];
    equityCurve.push(prev * (1 + r));
  }

  const endValue = equityCurve[equityCurve.length - 1];
  const startTime = trades[0].entryTime;
  const endTime = trades[trades.length - 1].exitTime;
  const days = Math.max((endTime - startTime) / 86_400_000, 0);

  const metrics: BacktestMetrics & { equityCurve: number[] } = {
    winRate: quantWinRate(returns),
    sharpeRatio: sharpeRatio(returns, periodsPerYear),
    sortinoRatio: sortinoRatio(returns, periodsPerYear),
    maxDrawdown: maxDrawdown(equityCurve),
    cagr: days > 0 ? quantCagr(startValue, endValue, days) : 0,
    totalTrades: trades.length,
    equityCurve,
  };

  log.debug(
    { trades: trades.length, cagr: metrics.cagr, maxDrawdown: metrics.maxDrawdown },
    'backtest run',
  );

  return metrics;
}

/** A named-strategy backtest summary (metrics only, no equity curve). */
export interface SignalBacktestSummary extends BacktestMetrics {
  strategy: string;
}

/**
 * Convenience wrapper: run a backtest for a named strategy and return only the
 * BacktestMetrics (drops the equity curve) tagged with the strategy name.
 */
export function summarizeSignalBacktest(
  strategy: string,
  trades: BacktestTrade[],
  opts: BacktestOptions = {},
): SignalBacktestSummary {
  const { equityCurve: _equityCurve, ...metrics } = runBacktest(trades, opts);
  return { strategy, ...metrics };
}
