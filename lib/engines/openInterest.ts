/**
 * Open Interest engine — reads a time-ordered series of OI snapshots plus the
 * recent price move and infers a squeeze regime. Pure & deterministic.
 */
import type { OpenInterestSnapshot, SqueezeSignal, SqueezeType } from '@/types';
import { childLogger } from '@/lib/logger';
import { clamp, mean } from '@/lib/quant';

const log = childLogger('engine:openInterest');

/** Funding rate (per-interval, e.g. 8h) considered "extreme". */
const HIGH_FUNDING = 0.0005; // 0.05%
/** Long/short ratio thresholds for crowding (LSR > 2 crowded long, < 0.5 crowded short). */
const CROWDED_LONG_LSR = 2;
const CROWDED_SHORT_LSR = 0.5;
/** OI must rise/fall at least this fraction over the window to count as a trend. */
const OI_TREND_PCT = 0.05;
/** |priceChangePct| under this is treated as "stalling/flat". */
const PRICE_STALL_PCT = 1.5;

/**
 * Detect a squeeze regime from OI snapshots + recent price action.
 *
 * Heuristics (first matching, highest-conviction wins):
 * - LONG_SQUEEZE: high positive funding + rising OI + crowded longs + price stalling
 *   → over-leveraged longs vulnerable to a flush down.
 * - SHORT_SQUEEZE: high negative funding + crowded shorts (+ rising OI) → shorts
 *   vulnerable to a flush up.
 * - EXHAUSTION: OI rolling over (falling) after a parabolic price run → leverage unwinding.
 * - CROWDED: extreme LSR with no clean directional setup → fragile positioning.
 * - NEUTRAL: nothing notable.
 *
 * probability (0..100) scales with how many supporting conditions fire and how
 * extreme funding/LSR are. `snapshots` must be ascending by timestamp.
 */
export function detectSqueeze(
  snapshots: OpenInterestSnapshot[],
  priceChangePct: number,
): SqueezeSignal {
  const symbol = snapshots[0]?.symbol ?? 'UNKNOWN';

  if (snapshots.length < 2) {
    return {
      symbol,
      type: 'NEUTRAL',
      probability: 0,
      rationale: ['Insufficient OI history to evaluate squeeze conditions.'],
    };
  }

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const oiChange = first.openInterestUsd > 0
    ? (last.openInterestUsd - first.openInterestUsd) / first.openInterestUsd
    : 0;
  const oiRising = oiChange > OI_TREND_PCT;
  const oiFalling = oiChange < -OI_TREND_PCT;

  const avgFunding = mean(snapshots.map((s) => s.fundingRate));
  const lsr = last.longShortRatio;

  const crowdedLong = lsr >= CROWDED_LONG_LSR;
  const crowdedShort = lsr <= CROWDED_SHORT_LSR && lsr > 0;
  const fundingHotPos = avgFunding >= HIGH_FUNDING;
  const fundingHotNeg = avgFunding <= -HIGH_FUNDING;
  const priceStalling = Math.abs(priceChangePct) <= PRICE_STALL_PCT;
  const priceParabolic = priceChangePct >= 8;

  const rationale: string[] = [];
  let type: SqueezeType = 'NEUTRAL';
  let probability = 0;

  if (fundingHotPos && oiRising && crowdedLong) {
    type = 'LONG_SQUEEZE';
    rationale.push(
      `Funding hot positive (${(avgFunding * 100).toFixed(3)}%) — longs paying to hold.`,
      `OI up ${(oiChange * 100).toFixed(1)}% — leverage building.`,
      `Long/short ratio ${lsr.toFixed(2)} — longs crowded.`,
    );
    if (priceStalling) rationale.push('Price stalling despite crowded longs — squeeze setup.');
    probability =
      40 +
      Math.min(20, (avgFunding / HIGH_FUNDING) * 10) +
      Math.min(20, oiChange * 100) +
      (priceStalling ? 15 : 5);
  } else if (fundingHotNeg && crowdedShort) {
    type = 'SHORT_SQUEEZE';
    rationale.push(
      `Funding hot negative (${(avgFunding * 100).toFixed(3)}%) — shorts paying to hold.`,
      `Long/short ratio ${lsr.toFixed(2)} — shorts crowded.`,
    );
    if (oiRising) rationale.push(`OI up ${(oiChange * 100).toFixed(1)}% — short leverage building.`);
    probability =
      40 +
      Math.min(25, (Math.abs(avgFunding) / HIGH_FUNDING) * 12) +
      (oiRising ? 15 : 5) +
      10;
  } else if (oiFalling && priceParabolic) {
    type = 'EXHAUSTION';
    rationale.push(
      `OI rolling over (${(oiChange * 100).toFixed(1)}%) after a +${priceChangePct.toFixed(1)}% run — leverage unwinding.`,
    );
    probability = 35 + Math.min(30, Math.abs(oiChange) * 100) + Math.min(20, priceChangePct);
  } else if (crowdedLong || crowdedShort) {
    type = 'CROWDED';
    rationale.push(
      `Long/short ratio ${lsr.toFixed(2)} is extreme — positioning fragile, no clean trigger yet.`,
    );
    const skew = crowdedLong ? lsr - CROWDED_LONG_LSR : CROWDED_SHORT_LSR - lsr;
    probability = 25 + Math.min(30, Math.abs(skew) * 20);
  } else {
    rationale.push('Funding, OI trend and positioning within normal ranges.');
    probability = 5;
  }

  probability = clamp(probability, 0, 100);
  log.debug({ symbol, type, probability }, 'squeeze evaluated');
  return { symbol, type, probability, rationale };
}
