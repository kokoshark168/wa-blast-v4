/**
 * On-chain Intelligence engine — maps a raw on-chain metric to a directional
 * market-impact estimate in -1..1 (bearish..bullish). Pure & deterministic.
 */
import type { OnChainSignal } from '@/types';
import { childLogger } from '@/lib/logger';
import { clamp } from '@/lib/quant';

const log = childLogger('engine:onchain');

/**
 * Saturation constants — the `value` magnitude (in the metric's native unit,
 * typically USD for flows/transfers, a count for wallets) at which impact
 * reaches its full ±1. Magnitudes are squashed with tanh so the function is
 * smooth and bounded for any input.
 */
const SATURATION: Record<OnChainSignal['metricType'], number> = {
  NEW_WALLETS: 10_000, // 10k net-new wallets => saturating adoption
  LARGE_TRANSFER: 50_000_000, // $50m transfer => saturating
  EXCHANGE_RESERVE: 100_000_000, // $100m reserve change => saturating
  STABLE_INFLOW: 250_000_000, // $250m stable inflow => saturating
  STABLE_OUTFLOW: 250_000_000,
};

/**
 * Estimate the directional market impact of an on-chain signal.
 *
 * Sign convention (impact > 0 bullish, < 0 bearish):
 * - NEW_WALLETS: more new wallets => adoption => bullish (sign follows value).
 * - STABLE_INFLOW: stablecoins flowing onto exchanges => dry powder / buying
 *   pressure building => bullish.
 * - STABLE_OUTFLOW: stablecoins leaving exchanges => capital parking off-venue,
 *   buying pressure draining => bearish.
 * - EXCHANGE_RESERVE: change in the *coin* reserve held on exchanges. A drop
 *   (negative value) => withdrawal/accumulation, less sell-side supply => bullish;
 *   a rise => more coin available to sell => bearish. So impact has the OPPOSITE
 *   sign of the value.
 * - LARGE_TRANSFER: a large transfer *to* an exchange (positive value, sell-side
 *   intent) => bearish; *from* an exchange (negative value) => accumulation =>
 *   bullish. Impact has the opposite sign of the value (value signed +to / -from).
 *
 * Magnitude is tanh-squashed against the metric's saturation constant so the
 * output stays in (-1, 1) regardless of input scale.
 */
export function estimateMarketImpact(
  signal: Omit<OnChainSignal, 'marketImpactEstimate'>,
): OnChainSignal {
  const sat = SATURATION[signal.metricType] || 1;
  const magnitude = Math.tanh(signal.value / sat); // -1..1, preserves value sign

  let impact: number;
  switch (signal.metricType) {
    case 'NEW_WALLETS':
    case 'STABLE_INFLOW':
      impact = magnitude; // bullish in the direction of value
      break;
    case 'STABLE_OUTFLOW':
      // value is an outflow magnitude (positive => draining) => bearish.
      impact = -Math.abs(magnitude);
      break;
    case 'EXCHANGE_RESERVE':
      impact = -magnitude; // reserve drop (negative value) => bullish
      break;
    case 'LARGE_TRANSFER':
      impact = -magnitude; // +value = to-exchange (bearish), -value = from-exchange (bullish)
      break;
    default:
      impact = 0;
  }

  impact = clamp(impact, -1, 1);
  log.debug({ metricType: signal.metricType, value: signal.value, impact }, 'impact estimated');

  return { ...signal, marketImpactEstimate: impact };
}
