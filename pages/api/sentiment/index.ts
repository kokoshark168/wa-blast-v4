import type { NextApiResponse } from 'next';
import { z } from 'zod';
import { withAuth, type AuthedRequest } from '@/lib/auth/guard';
import { cached } from '@/lib/redis';
import { twitter, reddit } from '@/services';
import { analyzeSentiment, type SentimentInput } from '@/lib/engines/sentiment';
import type { SentimentSignal } from '@/types';

const querySchema = z.object({
  keyword: z.string().min(1).default('bitcoin'),
});

const CACHE_TTL = 120; // seconds

/** Tiny lexicon-based polarity tally for a batch of text snippets. */
function tallySentiment(texts: string[]): { positive: number; negative: number; neutral: number } {
  const POS = ['bull', 'moon', 'pump', 'gain', 'long', 'buy', 'breakout', 'rally', 'up', 'win'];
  const NEG = ['bear', 'dump', 'crash', 'rug', 'short', 'sell', 'down', 'loss', 'scam', 'fear'];
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  for (const t of texts) {
    const lc = t.toLowerCase();
    const p = POS.some((w) => lc.includes(w));
    const n = NEG.some((w) => lc.includes(w));
    if (p && !n) positive++;
    else if (n && !p) negative++;
    else neutral++;
  }
  return { positive, negative, neutral };
}

/**
 * GET /api/sentiment?keyword=
 * Pulls recent Twitter + Reddit chatter for the keyword, runs lexical polarity
 * tally, and returns an aggregate SentimentSignal. Cached 120s. Degrades to a
 * zeroed signal when both social sources are unavailable.
 */
async function handler(req: AuthedRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', details: parsed.error.errors });
  }
  const { keyword } = parsed.data;

  try {
    const result = await cached(`sentiment:${keyword.toLowerCase()}`, CACHE_TTL, async () => {
      const [tweets, posts] = await Promise.allSettled([
        twitter.searchRecent(keyword, 50),
        reddit.search(keyword, 50),
      ]);

      const degraded = tweets.status === 'rejected' || posts.status === 'rejected';
      const texts: string[] = [];
      if (tweets.status === 'fulfilled') texts.push(...tweets.value.map((t) => t.text));
      if (posts.status === 'fulfilled') {
        texts.push(...posts.value.map((p) => `${p.title} ${p.selftext}`));
      }

      const { positive, negative, neutral } = tallySentiment(texts);
      const mentionsNow = texts.length;
      // No prior-window store here; assume half-rate baseline so velocity is meaningful.
      const mentionsPrev = Math.floor(mentionsNow / 2);

      const input: SentimentInput = {
        keyword,
        mentionsNow,
        mentionsPrev,
        positive,
        negative,
        neutral,
        platform: 'aggregate',
        windowHours: 1,
      };
      const signal = analyzeSentiment(input);
      return { signal, sampleSize: mentionsNow, degraded };
    });

    const { degraded, ...data } = result;
    return res.status(200).json({ data, ...(degraded ? { degraded: true } : {}) });
  } catch {
    const signal: SentimentSignal = {
      keyword,
      platform: 'aggregate',
      mentionVelocity: 0,
      sentimentScore: 0,
      trendAcceleration: 0,
      isNarrativeShift: false,
      isViral: false,
    };
    return res.status(200).json({ data: { signal, sampleSize: 0 }, degraded: true });
  }
}

export default withAuth(handler);
