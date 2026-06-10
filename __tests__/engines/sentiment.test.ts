import {
  analyzeSentiment,
  detectEmergingTrends,
  type SentimentInput,
} from '@/lib/engines/sentiment';
import type { SentimentSignal } from '@/types';

function input(over: Partial<SentimentInput>): SentimentInput {
  return {
    keyword: 'btc',
    mentionsNow: 10,
    mentionsPrev: 10,
    positive: 5,
    negative: 5,
    neutral: 0,
    platform: 'aggregate',
    ...over,
  };
}

describe('sentiment.analyzeSentiment', () => {
  it('is positive when positives outweigh negatives', () => {
    const s = analyzeSentiment(input({ positive: 8, negative: 2, neutral: 0 }));
    expect(s.sentimentScore).toBeGreaterThan(0);
    expect(s.sentimentScore).toBeCloseTo(0.6, 6);
  });

  it('is negative when negatives outweigh positives', () => {
    const s = analyzeSentiment(input({ positive: 2, negative: 8, neutral: 0 }));
    expect(s.sentimentScore).toBeLessThan(0);
    expect(s.sentimentScore).toBeCloseTo(-0.6, 6);
  });

  it('is 0 when there are no classified mentions', () => {
    const s = analyzeSentiment(input({ positive: 0, negative: 0, neutral: 0 }));
    expect(s.sentimentScore).toBe(0);
  });

  it('computes mention velocity per hour', () => {
    const s = analyzeSentiment(input({ mentionsNow: 120, mentionsPrev: 20, windowHours: 2 }));
    expect(s.mentionVelocity).toBe(50);
  });

  it('flags viral when velocity clears the threshold', () => {
    const s = analyzeSentiment(input({ mentionsNow: 200, mentionsPrev: 10, windowHours: 1 }));
    expect(s.isViral).toBe(true);
  });

  it('flags a narrative shift on a spike with clear polarity', () => {
    const s = analyzeSentiment(
      input({ mentionsNow: 60, mentionsPrev: 10, positive: 9, negative: 1, neutral: 0 }),
    );
    expect(s.isNarrativeShift).toBe(true);
  });

  it('does not flag a narrative shift when polarity is muddy', () => {
    const s = analyzeSentiment(
      input({ mentionsNow: 60, mentionsPrev: 10, positive: 5, negative: 5, neutral: 0 }),
    );
    expect(s.isNarrativeShift).toBe(false);
  });
});

describe('sentiment.detectEmergingTrends', () => {
  it('keeps viral / accelerating signals and sorts by heat', () => {
    const hot = analyzeSentiment(input({ keyword: 'hot', mentionsNow: 300, mentionsPrev: 10 }));
    const warm = analyzeSentiment(input({ keyword: 'warm', mentionsNow: 80, mentionsPrev: 20 }));
    const cold = analyzeSentiment(
      input({ keyword: 'cold', mentionsNow: 10, mentionsPrev: 10 }),
    );
    const trends = detectEmergingTrends([cold, warm, hot]);
    const keywords = trends.map((t: SentimentSignal) => t.keyword);
    expect(keywords).toContain('hot');
    expect(keywords).not.toContain('cold');
    // hottest first
    expect(keywords[0]).toBe('hot');
  });
});
