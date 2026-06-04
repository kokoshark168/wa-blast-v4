/**
 * Alpha Score engine — blends seven 0..100 component signals into a single
 * 0..100 conviction score and a discrete rating. Pure & deterministic.
 */
import type { AlphaRating, AlphaScore, AlphaScoreComponents } from '@/types';
import { childLogger } from '@/lib/logger';
import { clamp, weightedAverage } from '@/lib/quant';

const log = childLogger('engine:alphaScore');

/**
 * Component weights (sum to 1.00). Smart-money leads because tracked-wallet
 * positioning is the highest-signal, hardest-to-fake input; whale flow and
 * on-chain follow. Funding & sentiment are kept lighter (noisier / mean-reverting).
 *
 *   smartMoney .20 | whale .18 | onchain .15 | volume .15 | openInterest .12
 *   funding .10 | sentiment .10
 */
export const ALPHA_WEIGHTS: Record<keyof AlphaScoreComponents, number> = {
  smartMoneyActivity: 0.2,
  whaleActivity: 0.18,
  onChain: 0.15,
  volume: 0.15,
  openInterest: 0.12,
  funding: 0.1,
  sentiment: 0.1,
};

/** Map a 0..100 score to a discrete rating. */
export function ratingFor(score: number): AlphaRating {
  if (score >= 80) return 'STRONG_OPPORTUNITY';
  if (score >= 60) return 'WATCHLIST';
  if (score >= 40) return 'NEUTRAL';
  return 'AVOID';
}

/**
 * Compute the composite alpha score for a symbol.
 *
 * Each component is expected in 0..100; the result is a weighted average using
 * ALPHA_WEIGHTS, clamped to 0..100. Rating thresholds: >=80 STRONG_OPPORTUNITY,
 * 60-79 WATCHLIST, 40-59 NEUTRAL, <40 AVOID.
 */
export function computeAlphaScore(
  symbol: string,
  components: AlphaScoreComponents,
): AlphaScore {
  const score = clamp(
    weightedAverage([
      { value: clamp(components.smartMoneyActivity), weight: ALPHA_WEIGHTS.smartMoneyActivity },
      { value: clamp(components.whaleActivity), weight: ALPHA_WEIGHTS.whaleActivity },
      { value: clamp(components.onChain), weight: ALPHA_WEIGHTS.onChain },
      { value: clamp(components.volume), weight: ALPHA_WEIGHTS.volume },
      { value: clamp(components.openInterest), weight: ALPHA_WEIGHTS.openInterest },
      { value: clamp(components.funding), weight: ALPHA_WEIGHTS.funding },
      { value: clamp(components.sentiment), weight: ALPHA_WEIGHTS.sentiment },
    ]),
  );

  const rating = ratingFor(score);
  log.debug({ symbol, score, rating }, 'alpha score computed');

  return {
    symbol,
    score,
    rating,
    components,
    generatedAt: Date.now(),
  };
}
