/**
 * Social Sentiment engine — turns raw mention counts and sentiment tallies into
 * a SentimentSignal (velocity, polarity, acceleration, narrative-shift / viral
 * flags), and filters a set of signals down to emerging trends.
 * Pure & deterministic.
 */
import type { SentimentSignal, SocialPlatform } from '@/types';
import { childLogger } from '@/lib/logger';
import { clamp } from '@/lib/quant';

const log = childLogger('engine:sentiment');

/** Mentions/hour delta above which a keyword is treated as "viral". */
const VIRAL_VELOCITY = 50;
/** Relative spike (current vs previous mentions) flagged as a velocity spike. */
const SPIKE_RATIO = 2;
/** Minimum |sentimentScore| considered a clear polarity (for shift detection). */
const POLARITY_FLOOR = 0.2;

/** Raw social aggregation for a single keyword over the latest window. */
export interface SentimentInput {
  keyword: string;
  /** Mentions in the current window. */
  mentionsNow: number;
  /** Mentions in the previous comparable window. */
  mentionsPrev: number;
  /** Count of positive-classified mentions in the current window. */
  positive: number;
  /** Count of negative-classified mentions in the current window. */
  negative: number;
  /** Count of neutral-classified mentions in the current window. */
  neutral: number;
  platform: SocialPlatform | 'aggregate';
  /** Window length in hours used to compute velocity. Defaults to 1h. */
  windowHours?: number;
}

/**
 * Analyze a keyword's social footprint.
 *
 * - mentionVelocity = (mentionsNow - mentionsPrev) / windowHours  (mentions/hour delta).
 * - sentimentScore  = (positive - negative) / (positive + negative + neutral) in -1..1.
 * - trendAcceleration = mentionVelocity normalized by the prior level: how fast the
 *   conversation is compounding (ratio-based, so it's scale-free).
 * - isNarrativeShift = a velocity spike AND a meaningful polarity (the story is both
 *   accelerating and clearly directional — a regime change in the conversation).
 * - isViral = mentionVelocity exceeds the viral threshold.
 */
export function analyzeSentiment(input: SentimentInput): SentimentSignal {
  const windowHours = input.windowHours && input.windowHours > 0 ? input.windowHours : 1;
  const total = input.positive + input.negative + input.neutral;

  const mentionVelocity = (input.mentionsNow - input.mentionsPrev) / windowHours;
  const sentimentScore =
    total > 0 ? clamp((input.positive - input.negative) / total, -1, 1) : 0;

  // Scale-free acceleration: growth relative to the prior base. A 2x in mentions
  // yields ~1.0; guarded against divide-by-zero when there's no prior chatter.
  const base = Math.max(1, input.mentionsPrev);
  const trendAcceleration = (input.mentionsNow - input.mentionsPrev) / base;

  const spiked =
    input.mentionsNow >= input.mentionsPrev * SPIKE_RATIO && mentionVelocity > 0;
  const isViral = mentionVelocity >= VIRAL_VELOCITY;
  const isNarrativeShift = spiked && Math.abs(sentimentScore) >= POLARITY_FLOOR;

  log.debug(
    { keyword: input.keyword, mentionVelocity, sentimentScore, isViral, isNarrativeShift },
    'sentiment analyzed',
  );

  return {
    keyword: input.keyword,
    platform: input.platform,
    mentionVelocity,
    sentimentScore,
    trendAcceleration,
    isNarrativeShift,
    isViral,
  };
}

/**
 * Surface emerging trends: keep signals that are viral OR strongly accelerating
 * (a narrative shift), then sort by a combined heat score (velocity weighted by
 * acceleration) descending.
 */
export function detectEmergingTrends(signals: SentimentSignal[]): SentimentSignal[] {
  return signals
    .filter((s) => s.isViral || s.isNarrativeShift || s.trendAcceleration >= 1)
    .sort(
      (a, b) =>
        b.mentionVelocity * (1 + Math.max(0, b.trendAcceleration)) -
        a.mentionVelocity * (1 + Math.max(0, a.trendAcceleration)),
    );
}
