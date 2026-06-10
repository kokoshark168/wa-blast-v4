import type { DataSourceHealth } from '@/services/base';
import { BinanceService } from '@/services/binance';
import { BybitService } from '@/services/bybit';
import { HyperliquidService } from '@/services/hyperliquid';
import { CoinGeckoService } from '@/services/coingecko';
import { DefiLlamaService } from '@/services/defillama';
import { EthereumRpcService } from '@/services/ethereum';
import { SolanaRpcService } from '@/services/solana';
import { TwitterService } from '@/services/social/twitter';
import { RedditService } from '@/services/social/reddit';
import { TelegramService } from '@/services/social/telegram';

export type { DataSourceHealth } from '@/services/base';
export { BinanceService } from '@/services/binance';
export { BybitService } from '@/services/bybit';
export { HyperliquidService } from '@/services/hyperliquid';
export { CoinGeckoService } from '@/services/coingecko';
export { DefiLlamaService } from '@/services/defillama';
export { EthereumRpcService } from '@/services/ethereum';
export { SolanaRpcService } from '@/services/solana';
export { TwitterService } from '@/services/social/twitter';
export { RedditService } from '@/services/social/reddit';
export { TelegramService } from '@/services/social/telegram';

/**
 * Lazily build a memoized singleton. Adapters are only constructed on first
 * access so that an unconfigured source (e.g. missing RPC URL) never blocks
 * module load and credentials are read from the environment at call time.
 */
function singleton<T>(factory: () => T): () => T {
  let instance: T | undefined;
  return () => (instance ??= factory());
}

const getBinance = singleton(() => new BinanceService());
const getBybit = singleton(() => new BybitService());
const getHyperliquid = singleton(() => new HyperliquidService());
const getCoingecko = singleton(() => new CoinGeckoService());
const getDefillama = singleton(() => new DefiLlamaService());
const getEthereum = singleton(() => new EthereumRpcService());
const getSolana = singleton(() => new SolanaRpcService());
const getTwitter = singleton(() => new TwitterService());
const getReddit = singleton(() => new RedditService());
const getTelegram = singleton(() => new TelegramService());

/**
 * The data-source registry. Each property is a getter that returns the shared
 * singleton instance, instantiating it on first use.
 */
export const sources = {
  get binance(): BinanceService {
    return getBinance();
  },
  get bybit(): BybitService {
    return getBybit();
  },
  get hyperliquid(): HyperliquidService {
    return getHyperliquid();
  },
  get coingecko(): CoinGeckoService {
    return getCoingecko();
  },
  get defillama(): DefiLlamaService {
    return getDefillama();
  },
  get ethereum(): EthereumRpcService {
    return getEthereum();
  },
  get solana(): SolanaRpcService {
    return getSolana();
  },
  get twitter(): TwitterService {
    return getTwitter();
  },
  get reddit(): RedditService {
    return getReddit();
  },
  get telegram(): TelegramService {
    return getTelegram();
  },
} as const;

// Convenience named singleton exports.
export const binance = sources.binance;
export const bybit = sources.bybit;
export const hyperliquid = sources.hyperliquid;
export const coingecko = sources.coingecko;
export const defillama = sources.defillama;
export const ethereum = sources.ethereum;
export const solana = sources.solana;
export const twitter = sources.twitter;
export const reddit = sources.reddit;
export const telegram = sources.telegram;

/**
 * Run the uniform health check across every registered data source in parallel.
 * Each entry reports whether the source is configured and currently reachable.
 */
export async function dataSourceHealth(): Promise<DataSourceHealth[]> {
  const all = [
    binance,
    bybit,
    hyperliquid,
    coingecko,
    defillama,
    ethereum,
    solana,
    twitter,
    reddit,
    telegram,
  ];
  return Promise.all(all.map((s) => s.health()));
}
