/**
 * Whale Intelligence engine — classifies and tiers large on-chain transfers.
 * Pure & deterministic: the API layer resolves address labels and passes them
 * in via `WhaleContext` so this stays unit-testable with no I/O.
 */
import type { Chain, WhaleClassification, WhaleTier, WhaleTransaction } from '@/types';

/** $10m threshold above which an EOA->EOA move is treated as treasury-scale. */
const TREASURY_THRESHOLD_USD = 10_000_000;

/** Context for label/heuristic lookups, injected by the caller. */
export interface WhaleContext {
  /** True if the address is a known CEX/DEX deposit/hot wallet. */
  isExchangeAddress: (addr: string) => boolean;
  /** True if the address belongs to a tracked smart-money entity. */
  isSmartMoney: (addr: string) => boolean;
}

/** Raw transfer shape the API layer normalizes from chain providers. */
export interface RawWhaleTransfer {
  txHash: string;
  chain: Chain;
  from: string;
  to: string;
  tokenSymbol: string;
  tokenAddress: string;
  amount: number;
  valueUsd: number;
  timestamp: number;
}

/**
 * Classify a transfer by counterparties and size.
 *
 * - to an exchange  => EXCHANGE_INFLOW  (supply hitting order books, often bearish)
 * - from an exchange => EXCHANGE_OUTFLOW (accumulation/withdrawal, often bullish)
 * - smart-money receiving (buy/accumulate) => SMART_MONEY_ACCUMULATION
 * - large EOA->EOA: >= $10m => TREASURY_MOVEMENT, else OTC_MOVEMENT
 * - otherwise UNKNOWN
 * Exchange edges take priority over EOA heuristics.
 */
export function classifyTransaction(
  tx: Pick<RawWhaleTransfer, 'from' | 'to' | 'valueUsd'>,
  ctx: WhaleContext,
): WhaleClassification {
  const fromEx = ctx.isExchangeAddress(tx.from);
  const toEx = ctx.isExchangeAddress(tx.to);

  if (toEx && !fromEx) return 'EXCHANGE_INFLOW';
  if (fromEx && !toEx) return 'EXCHANGE_OUTFLOW';

  // EOA <-> EOA (neither side is an exchange, or both are — treat as transfer).
  if (!fromEx && !toEx) {
    if (ctx.isSmartMoney(tx.to)) return 'SMART_MONEY_ACCUMULATION';
    if (tx.valueUsd >= TREASURY_THRESHOLD_USD) return 'TREASURY_MOVEMENT';
    return 'OTC_MOVEMENT';
  }

  return 'UNKNOWN';
}

/**
 * Map a USD value to a whale tier. Returns null below the $100k floor so the
 * caller can drop sub-whale noise.
 */
export function tierFor(valueUsd: number): WhaleTier | null {
  if (valueUsd >= 10_000_000) return '10m';
  if (valueUsd >= 1_000_000) return '1m';
  if (valueUsd >= 100_000) return '100k';
  return null;
}

/**
 * Build a fully-classified WhaleTransaction from a raw transfer. Returns null
 * when the transfer is below whale tier ($100k) so callers can filter cleanly.
 */
export function buildWhaleTransaction(
  raw: RawWhaleTransfer,
  ctx: WhaleContext,
): WhaleTransaction | null {
  const tier = tierFor(raw.valueUsd);
  if (tier === null) return null;

  return {
    txHash: raw.txHash,
    chain: raw.chain,
    from: raw.from,
    to: raw.to,
    tokenSymbol: raw.tokenSymbol,
    tokenAddress: raw.tokenAddress,
    amount: raw.amount,
    valueUsd: raw.valueUsd,
    tier,
    classification: classifyTransaction(raw, ctx),
    timestamp: raw.timestamp,
  };
}
