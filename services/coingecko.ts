import { BaseDataSource } from '@/services/base';
import { cached } from '@/lib/redis';

const BASE = 'https://api.coingecko.com/api/v3';
const PUBLIC_TTL = 60; // seconds

export interface CoinMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
}

interface TrendingItem {
  item: { id: string; coin_id: number; name: string; symbol: string; market_cap_rank: number };
}

export interface TrendingResponse {
  coins: TrendingItem[];
}

export interface GlobalResponse {
  data: {
    active_cryptocurrencies: number;
    total_market_cap: Record<string, number>;
    total_volume: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

export interface SearchResponse {
  coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[];
}

// Coin detail is large and loosely-typed; expose a permissive record.
export type CoinDetail = Record<string, unknown> & {
  id: string;
  symbol: string;
  name: string;
};

function apiKey(): string | undefined {
  return process.env.COINGECKO_API_KEY;
}

/**
 * CoinGecko adapter (free/demo tier). If `COINGECKO_API_KEY` is set it is sent
 * as the `x-cg-demo-api-key` header; otherwise the public rate-limited
 * endpoints are used. All reads are cached ~60s.
 */
export class CoinGeckoService extends BaseDataSource {
  readonly name = 'coingecko';

  constructor() {
    const key = apiKey();
    super(BASE, key ? { 'x-cg-demo-api-key': key } : {});
  }

  /** Always usable: an API key only raises rate limits. */
  isConfigured(): boolean {
    return true;
  }

  protected async ping(): Promise<void> {
    await this.request({ url: '/ping' });
  }

  /** Paginated market data for the top coins by market cap (USD). */
  async getMarkets(perPage = 100, page = 1): Promise<CoinMarket[]> {
    return cached(`coingecko:markets:${perPage}:${page}`, PUBLIC_TTL, () =>
      this.request<CoinMarket[]>({
        url: '/coins/markets',
        params: {
          vs_currency: 'usd',
          order: 'market_cap_desc',
          per_page: perPage,
          page,
          sparkline: false,
          price_change_percentage: '24h',
        },
      })
    );
  }

  /** Full detail for a single coin by CoinGecko id. */
  async getCoin(id: string): Promise<CoinDetail> {
    return cached(`coingecko:coin:${id}`, PUBLIC_TTL, () =>
      this.request<CoinDetail>({
        url: `/coins/${id}`,
        params: {
          localization: false,
          tickers: false,
          market_data: true,
          community_data: true,
          developer_data: false,
        },
      })
    );
  }

  /** Currently trending coins (search popularity over the last 24h). */
  async getTrending(): Promise<TrendingResponse> {
    return cached('coingecko:trending', PUBLIC_TTL, () =>
      this.request<TrendingResponse>({ url: '/search/trending' })
    );
  }

  /** Global market overview (total market cap, dominance, etc). */
  async getGlobal(): Promise<GlobalResponse> {
    return cached('coingecko:global', PUBLIC_TTL, () =>
      this.request<GlobalResponse>({ url: '/global' })
    );
  }

  /** Free-text token search across CoinGecko's listing. */
  async searchToken(query: string): Promise<SearchResponse> {
    return cached(`coingecko:search:${query.toLowerCase()}`, PUBLIC_TTL, () =>
      this.request<SearchResponse>({ url: '/search', params: { query } })
    );
  }
}
