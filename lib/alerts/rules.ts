/**
 * Alert rule predicates — pure functions that decide whether an alert should
 * fire given a slice of fresh data, plus `formatAlert` which turns a trigger
 * into a `NotificationPayload`. No I/O, fully unit-testable.
 */
import type { SentimentSignal, WhaleTransaction } from '@/types';
import { clamp } from '@/lib/quant';
import type { NotificationPayload } from '@/lib/notify/types';

/**
 * A whale BUY fires when a transaction looks like accumulation/withdrawal off an
 * exchange (EXCHANGE_OUTFLOW or SMART_MONEY_ACCUMULATION) and clears the USD
 * `threshold`.
 */
export function whaleBuyTriggered(tx: WhaleTransaction, threshold: number): boolean {
  const isBuy =
    tx.classification === 'EXCHANGE_OUTFLOW' ||
    tx.classification === 'SMART_MONEY_ACCUMULATION';
  return isBuy && tx.valueUsd >= threshold;
}

/**
 * A whale SELL fires when supply is moving onto an exchange (EXCHANGE_INFLOW)
 * and clears the USD `threshold`.
 */
export function whaleSellTriggered(tx: WhaleTransaction, threshold: number): boolean {
  return tx.classification === 'EXCHANGE_INFLOW' && tx.valueUsd >= threshold;
}

/**
 * Funding is "extreme" when its absolute per-interval rate meets `threshold`
 * (default 0.05 = 5%). Sign-agnostic: both crowded-long and crowded-short fire.
 */
export function fundingExtremeTriggered(fundingRate: number, threshold = 0.05): boolean {
  return Math.abs(fundingRate) >= threshold;
}

/**
 * An OI spike fires when open interest grows by at least `pct` (default 0.2 =
 * +20%) from `prevOi` to `curOi`. Requires a positive prior to avoid div-by-zero.
 */
export function oiSpikeTriggered(prevOi: number, curOi: number, pct = 0.2): boolean {
  if (prevOi <= 0) return false;
  return (curOi - prevOi) / prevOi >= pct;
}

/**
 * A sentiment explosion fires when a signal is viral or its mention velocity
 * meets `velocityThreshold` (mentions/hour).
 */
export function sentimentExplosionTriggered(
  signal: SentimentSignal,
  velocityThreshold: number,
): boolean {
  return signal.isViral || signal.mentionVelocity >= velocityThreshold;
}

/**
 * Smart-money ENTRY fires when net buying (USD) into a name meets `threshold`.
 * @param netFlowUsd Net smart-money flow in USD (positive = buying).
 */
export function smartMoneyEntryTriggered(netFlowUsd: number, threshold: number): boolean {
  return netFlowUsd >= threshold;
}

/**
 * Smart-money EXIT fires when net selling (USD) out of a name meets `threshold`.
 * @param netFlowUsd Net smart-money flow in USD (negative = selling).
 */
export function smartMoneyExitTriggered(netFlowUsd: number, threshold: number): boolean {
  return netFlowUsd <= -Math.abs(threshold);
}

/** Severity heuristic by alert type; clamped to 0..100. */
function severityFor(type: string, data: unknown): number {
  const d = (data ?? {}) as Record<string, unknown>;
  switch (type) {
    case 'whale_buy':
    case 'whale_sell': {
      const v = typeof d.valueUsd === 'number' ? d.valueUsd : 0;
      // $100k → ~40, $10m+ → 100 on a log scale.
      return clamp(40 + (Math.log10(Math.max(v, 1)) - 5) * 30, 0, 100);
    }
    case 'funding_extreme': {
      const r = typeof d.fundingRate === 'number' ? Math.abs(d.fundingRate) : 0;
      return clamp(50 + r * 400, 0, 100);
    }
    case 'oi_spike':
      return 60;
    case 'sentiment_explosion':
      return 55;
    case 'smart_money_entry':
      return 70;
    case 'smart_money_exit':
      return 75;
    default:
      return 50;
  }
}

/**
 * Build a human-readable `NotificationPayload` from a fired trigger. `data` is
 * the relevant object for the type (a WhaleTransaction, SentimentSignal, or a
 * small record); unknown shapes degrade gracefully to a generic message.
 */
export function formatAlert(type: string, data: unknown): NotificationPayload {
  const d = (data ?? {}) as Record<string, unknown>;
  const severity = severityFor(type, data);
  const metadata: Record<string, unknown> = { type, data };

  switch (type) {
    case 'whale_buy':
    case 'whale_sell': {
      const tx = data as WhaleTransaction;
      const verb = type === 'whale_buy' ? 'BUY' : 'SELL';
      return {
        title: `Whale ${verb}: ${tx.tokenSymbol ?? '?'} ($${fmtUsd(tx.valueUsd)})`,
        body: `${tx.classification ?? 'UNKNOWN'} on ${tx.chain ?? '?'} — ${fmtAmount(
          tx.amount,
        )} ${tx.tokenSymbol ?? ''} (${tx.tier ?? '?'} tier).`,
        severity,
        metadata,
      };
    }
    case 'funding_extreme': {
      const rate = typeof d.fundingRate === 'number' ? d.fundingRate : 0;
      const sym = typeof d.symbol === 'string' ? d.symbol : 'market';
      return {
        title: `Extreme funding: ${sym} ${(rate * 100).toFixed(3)}%`,
        body: `Funding rate ${rate >= 0 ? 'positive' : 'negative'} at ${(rate * 100).toFixed(
          3,
        )}% — crowded ${rate >= 0 ? 'longs' : 'shorts'}.`,
        severity,
        metadata,
      };
    }
    case 'oi_spike': {
      const sym = typeof d.symbol === 'string' ? d.symbol : 'market';
      const prev = typeof d.prevOi === 'number' ? d.prevOi : 0;
      const cur = typeof d.curOi === 'number' ? d.curOi : 0;
      const pct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
      return {
        title: `OI spike: ${sym} +${pct.toFixed(1)}%`,
        body: `Open interest jumped from ${fmtUsd(prev)} to ${fmtUsd(cur)} (+${pct.toFixed(1)}%).`,
        severity,
        metadata,
      };
    }
    case 'sentiment_explosion': {
      const s = data as SentimentSignal;
      return {
        title: `Sentiment spike: ${s.keyword ?? '?'}`,
        body: `${(s.mentionVelocity ?? 0).toFixed(0)} mentions/hr, sentiment ${(
          s.sentimentScore ?? 0
        ).toFixed(2)}${s.isViral ? ' — VIRAL' : ''}.`,
        severity,
        metadata,
      };
    }
    case 'smart_money_entry':
    case 'smart_money_exit': {
      const sym = typeof d.symbol === 'string' ? d.symbol : 'market';
      const flow = typeof d.netFlowUsd === 'number' ? d.netFlowUsd : 0;
      const verb = type === 'smart_money_entry' ? 'entering' : 'exiting';
      return {
        title: `Smart money ${verb}: ${sym}`,
        body: `Tracked wallets net ${flow >= 0 ? '+' : '-'}$${fmtUsd(Math.abs(flow))} ${verb} ${sym}.`,
        severity,
        metadata,
      };
    }
    default:
      return {
        title: `Alert: ${type}`,
        body: typeof d.message === 'string' ? d.message : `Triggered: ${type}`,
        severity,
        metadata,
      };
  }
}

/** Compact USD formatter (e.g. 1.2M, 950k). */
function fmtUsd(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return v.toFixed(0);
}

/** Compact token-amount formatter. */
function fmtAmount(v: number): string {
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
