/**
 * Smart Money engine — derives performance/risk metrics for tracked wallets and
 * ranks them by a chosen lookback window. Pure & deterministic: feed in raw
 * trade rows and ranking inputs, get computed domain types back.
 */
import type { Chain, RankedWallet, WalletMetrics } from '@/types';
import { childLogger } from '@/lib/logger';
import {
  clamp,
  maxDrawdown,
  profitFactor as quantProfitFactor,
  stdDev,
  winRate as quantWinRate,
} from '@/lib/quant';

const log = childLogger('engine:smartMoney');

/** A single closed/open position used to derive wallet metrics. */
export interface WalletTrade {
  /** Capital deployed in USD (used as cost basis for ROI). */
  valueUsd: number;
  /** Realized profit/loss in USD for this trade. */
  pnl: number;
  /** Unix ms timestamp the position was opened. */
  openedAt: number;
  /** Unix ms timestamp the position was closed; null if still open. */
  closedAt: number | null;
}

/**
 * Compute aggregate performance & risk metrics for a wallet from its trades.
 *
 * - roi = total realized pnl / total deployed capital, as a percent.
 * - winRate = fraction of trades with pnl > 0 (0..1).
 * - avgHoldingPeriod = mean(closedAt - openedAt) in hours over closed trades.
 * - profitFactor = gross profit / gross loss (via lib/quant).
 * - riskScore (0..100): blends pnl-return volatility and the equity drawdown of
 *   the cumulative pnl curve. Higher = riskier. Volatility is normalized against
 *   mean deployed capital so a wallet swinging large $ relative to its size
 *   scores hotter; drawdown contributes the remaining weight.
 */
export function computeWalletMetrics(trades: WalletTrade[]): WalletMetrics {
  if (trades.length === 0) {
    return {
      roi: 0,
      winRate: 0,
      avgHoldingPeriod: 0,
      riskScore: 0,
      profitFactor: 0,
      totalTrades: 0,
      realizedPnl: 0,
    };
  }

  const totalCapital = trades.reduce((a, t) => a + Math.max(0, t.valueUsd), 0);
  const realizedPnl = trades.reduce((a, t) => a + t.pnl, 0);
  const roi = totalCapital > 0 ? (realizedPnl / totalCapital) * 100 : 0;

  const pnls = trades.map((t) => t.pnl);
  const winRate = quantWinRate(pnls);
  const profitFactor = quantProfitFactor(pnls);

  const closed = trades.filter((t) => t.closedAt !== null);
  const avgHoldingPeriod =
    closed.length > 0
      ? closed.reduce((a, t) => a + ((t.closedAt as number) - t.openedAt), 0) /
        closed.length /
        3_600_000
      : 0;

  // Risk: per-trade pnl volatility normalized by mean deployed size, plus the
  // peak-to-trough drawdown of the cumulative pnl (equity) curve.
  const meanCapital = totalCapital / trades.length || 1;
  const pnlVol = stdDev(pnls) / meanCapital; // ~ fraction of position size
  const volComponent = clamp(pnlVol * 100, 0, 100); // 1.0 vol => 100

  let cum = 0;
  const equity = pnls.map((p) => (cum += p));
  // Offset so the curve is strictly positive for drawdown math.
  const floor = Math.min(0, ...equity);
  const equityCurve = equity.map((e) => e - floor + meanCapital);
  const ddComponent = clamp(maxDrawdown(equityCurve) * 100, 0, 100);

  const riskScore = clamp(0.6 * volComponent + 0.4 * ddComponent, 0, 100);

  return {
    roi,
    winRate,
    avgHoldingPeriod,
    riskScore,
    profitFactor,
    totalTrades: trades.length,
    realizedPnl,
  };
}

/** Ranking input: a wallet's identity, metrics, and windowed performance. */
export interface RankableWallet {
  address: string;
  name: string;
  chain: Chain;
  metrics: WalletMetrics;
  perf7d: number;
  perf30d: number;
  perf90d: number;
}

/**
 * Rank wallets descending by the chosen performance window. Stable: ties keep
 * input order. Returns RankedWallet rows (metrics flattened in).
 */
export function rankWallets(
  wallets: RankableWallet[],
  by: '7d' | '30d' | '90d',
): RankedWallet[] {
  const key =
    by === '7d' ? 'perf7d' : by === '30d' ? 'perf30d' : 'perf90d';

  const ranked = [...wallets]
    .sort((a, b) => b[key] - a[key])
    .map<RankedWallet>((w) => ({
      ...w.metrics,
      address: w.address,
      name: w.name,
      chain: w.chain,
      performance7d: w.perf7d,
      performance30d: w.perf30d,
      performance90d: w.perf90d,
    }));

  log.debug({ count: ranked.length, by }, 'ranked wallets');
  return ranked;
}
