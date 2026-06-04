import { BaseDataSource } from '@/services/base';

const PUBLIC_BASE = 'https://www.reddit.com';
const OAUTH_BASE = 'https://oauth.reddit.com';
const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const USER_AGENT = 'alphaflow-terminal/1.0 (+https://alphaflow.local)';

/** A normalized Reddit post. */
export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  author: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  createdUtc: number;
  selftext: string;
}

interface RedditChild {
  kind: string;
  data: {
    id: string;
    title: string;
    subreddit: string;
    author: string;
    url: string;
    permalink: string;
    score: number;
    num_comments: number;
    created_utc: number;
    selftext: string;
  };
}

interface RedditListing {
  data: { children: RedditChild[]; after: string | null };
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

function clientId(): string | undefined {
  return process.env.REDDIT_CLIENT_ID;
}
function clientSecret(): string | undefined {
  return process.env.REDDIT_CLIENT_SECRET;
}

/**
 * Reddit adapter. When `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` are present it
 * uses OAuth (app-only / client-credentials) against `oauth.reddit.com` for
 * higher rate limits; otherwise it falls back to the public JSON endpoints on
 * `www.reddit.com`. Either way the public methods work without credentials.
 */
export class RedditService extends BaseDataSource {
  readonly name = 'reddit';
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor() {
    super(PUBLIC_BASE, { 'User-Agent': USER_AGENT });
  }

  /** Reports configured when OAuth credentials are present (public fallback always works). */
  isConfigured(): boolean {
    return Boolean(clientId() && clientSecret());
  }

  protected async ping(): Promise<void> {
    await this.subredditHot('CryptoCurrency', 1);
  }

  /** Obtain (and cache) an app-only OAuth token, or `null` if unconfigured. */
  private async getToken(): Promise<string | null> {
    if (!this.isConfigured()) return null;
    if (this.token && Date.now() < this.tokenExpiry) return this.token;

    const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
    const res = await this.request<TokenResponse>({
      url: TOKEN_URL,
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      data: 'grant_type=client_credentials',
    });
    this.token = res.access_token;
    this.tokenExpiry = Date.now() + (res.expires_in - 60) * 1000;
    return this.token;
  }

  /** Resolve the base URL and auth header for the current credential state. */
  private async authConfig(): Promise<{ baseURL: string; headers: Record<string, string> }> {
    const token = await this.getToken().catch(() => null);
    if (token) {
      return {
        baseURL: OAUTH_BASE,
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': USER_AGENT },
      };
    }
    return { baseURL: PUBLIC_BASE, headers: { 'User-Agent': USER_AGENT } };
  }

  private mapListing(listing: RedditListing): RedditPost[] {
    return listing.data.children
      .filter((c) => c.kind === 't3')
      .map((c) => ({
        id: c.data.id,
        title: c.data.title,
        subreddit: c.data.subreddit,
        author: c.data.author,
        url: c.data.url,
        permalink: `https://www.reddit.com${c.data.permalink}`,
        score: c.data.score,
        numComments: c.data.num_comments,
        createdUtc: c.data.created_utc,
        selftext: c.data.selftext,
      }));
  }

  /**
   * Search Reddit posts matching a query (sorted by relevance, recent first).
   * @param query Free-text search query.
   * @param limit Maximum posts to return (default 25).
   */
  async search(query: string, limit = 25): Promise<RedditPost[]> {
    const { baseURL, headers } = await this.authConfig();
    const path = baseURL === PUBLIC_BASE ? '/search.json' : '/search';
    const listing = await this.request<RedditListing>({
      url: path,
      baseURL,
      headers,
      params: { q: query, limit, sort: 'new', type: 'link' },
    });
    return this.mapListing(listing);
  }

  /**
   * Hot posts from a subreddit.
   * @param sub Subreddit name (without the `r/` prefix).
   * @param limit Maximum posts to return (default 25).
   */
  async subredditHot(sub: string, limit = 25): Promise<RedditPost[]> {
    const { baseURL, headers } = await this.authConfig();
    const path = baseURL === PUBLIC_BASE ? `/r/${sub}/hot.json` : `/r/${sub}/hot`;
    const listing = await this.request<RedditListing>({
      url: path,
      baseURL,
      headers,
      params: { limit },
    });
    return this.mapListing(listing);
  }
}
