import { BaseDataSource } from '@/services/base';

const BASE = 'https://api.twitter.com/2';

/** A single tweet from the recent-search endpoint. */
export interface Tweet {
  id: string;
  text: string;
  authorId?: string;
  createdAt?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
}

interface RawTweet {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
  };
}

interface RecentSearchResponse {
  data?: RawTweet[];
  meta?: { result_count: number; next_token?: string };
}

function bearer(): string | undefined {
  return process.env.TWITTER_BEARER_TOKEN;
}

/**
 * Twitter / X v2 adapter. Requires a `TWITTER_BEARER_TOKEN`. When the token is
 * absent the service reports unconfigured and search calls resolve to `[]` so
 * sentiment pipelines degrade gracefully rather than throwing.
 */
export class TwitterService extends BaseDataSource {
  readonly name = 'twitter';

  constructor() {
    const token = bearer();
    super(BASE, token ? { Authorization: `Bearer ${token}` } : {});
  }

  /** True only when a bearer token is present. */
  isConfigured(): boolean {
    return Boolean(bearer());
  }

  protected async ping(): Promise<void> {
    await this.searchRecent('crypto', 10);
  }

  /**
   * Recent (last 7 days) tweets matching a query. Returns `[]` when the service
   * is not configured.
   * @param query Twitter search query (operators supported).
   * @param maxResults 10..100 results per call (default 25).
   */
  async searchRecent(query: string, maxResults = 25): Promise<Tweet[]> {
    if (!this.isConfigured()) return [];
    const res = await this.request<RecentSearchResponse>({
      url: '/tweets/search/recent',
      params: {
        query,
        max_results: Math.min(Math.max(maxResults, 10), 100),
        'tweet.fields': 'created_at,public_metrics,author_id',
      },
    });
    return (res.data ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      createdAt: t.created_at,
      retweetCount: t.public_metrics?.retweet_count,
      replyCount: t.public_metrics?.reply_count,
      likeCount: t.public_metrics?.like_count,
      quoteCount: t.public_metrics?.quote_count,
    }));
  }
}
