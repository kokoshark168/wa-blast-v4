import { BaseDataSource } from '@/services/base';
import { cached } from '@/lib/redis';

const DEFAULT_BASE = 'https://api.llama.fi';
const PUBLIC_TTL = 120; // seconds

export interface Protocol {
  id: string;
  name: string;
  slug: string;
  symbol: string | null;
  chain: string;
  chains: string[];
  category: string;
  tvl: number;
  change_1d: number | null;
  change_7d: number | null;
}

export interface ProtocolTvl {
  id: string;
  name: string;
  slug: string;
  chainTvls: Record<string, unknown>;
  currentChainTvls: Record<string, number>;
  tvl: { date: number; totalLiquidityUSD: number }[];
}

export interface ChainTvlPoint {
  date: number;
  tvl: number;
}

export interface Stablecoin {
  id: string;
  name: string;
  symbol: string;
  pegType: string;
  circulating: Record<string, number>;
  price: number | null;
}

interface StablecoinsResponse {
  peggedAssets: Stablecoin[];
}

function base(): string {
  return process.env.DEFI_LLAMA_API_URL || DEFAULT_BASE;
}

/**
 * DefiLlama adapter. The TVL API is fully public. Base URL can be overridden
 * via `DEFI_LLAMA_API_URL`. All reads are cached ~120s.
 */
export class DefiLlamaService extends BaseDataSource {
  readonly name = 'defillama';

  constructor() {
    super(base());
  }

  /** Public API; always usable. */
  isConfigured(): boolean {
    return true;
  }

  protected async ping(): Promise<void> {
    await this.request({ url: '/protocols' });
  }

  /** All tracked protocols with current TVL and short-term change. */
  async getProtocols(): Promise<Protocol[]> {
    return cached('defillama:protocols', PUBLIC_TTL, () =>
      this.request<Protocol[]>({ url: '/protocols' })
    );
  }

  /** Historical TVL breakdown for a single protocol by slug. */
  async getProtocolTvl(slug: string): Promise<ProtocolTvl> {
    return cached(`defillama:protocol:${slug}`, PUBLIC_TTL, () =>
      this.request<ProtocolTvl>({ url: `/protocol/${slug}` })
    );
  }

  /** Historical aggregate TVL time series for a chain. */
  async getChainTvl(chain: string): Promise<ChainTvlPoint[]> {
    return cached(`defillama:chain:${chain.toLowerCase()}`, PUBLIC_TTL, () =>
      this.request<ChainTvlPoint[]>({ url: `/v2/historicalChainTvl/${chain}` })
    );
  }

  /** Current stablecoin circulating supplies and pegs. */
  async getStablecoins(): Promise<Stablecoin[]> {
    return cached('defillama:stablecoins', PUBLIC_TTL, async () => {
      const res = await this.request<StablecoinsResponse>({
        url: '/stablecoins',
        baseURL: 'https://stablecoins.llama.fi',
        params: { includePrices: true },
      });
      return res.peggedAssets;
    });
  }
}
