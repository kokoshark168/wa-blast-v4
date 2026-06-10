import { BaseDataSource } from '@/services/base';
import { cached } from '@/lib/redis';
import type { OpenInterestSnapshot } from '@/types';
import type { Kline } from '@/services/binance';

const BASE = 'https://api.bybit.com';
const PUBLIC_TTL = 30; // seconds

/** Normalize a symbol to Bybit linear-perp form, e.g. `BTC` -> `BTCUSDT`. */
export function toBybitSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-/_]/g, '');
  if (s.endsWith('USDT') || s.endsWith('USDC')) return s;
  return `${s}USDT`;
}

interface BybitEnvelope<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

interface BybitTicker {
  symbol: string;
  lastPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  turnover24h: string;
  price24hPcnt: string;
  openInterest: string;
  openInterestValue: string;
  fundingRate: string;
  markPrice: string;
}

interface BybitTickerResult {
  category: string;
  list: BybitTicker[];
}

interface BybitKlineResult {
  symbol: string;
  category: string;
  // [start, open, high, low, close, volume, turnover]
  list: [string, string, string, string, string, string, string][];
}

/** Maps a generic interval like `1h`/`1d` to Bybit's numeric/letter intervals. */
function toBybitInterval(interval: string): string {
  const map: Record<string, string> = {
    '1m': '1',
    '3m': '3',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '2h': '120',
    '4h': '240',
    '6h': '360',
    '12h': '720',
    '1d': 'D',
    '1w': 'W',
    '1M': 'M',
  };
  return map[interval] ?? interval;
}

/**
 * Bybit v5 public market-data adapter (linear perpetuals). No credentials are
 * required for the endpoints used here.
 */
export class BybitService extends BaseDataSource {
  readonly name = 'bybit';

  constructor() {
    super(BASE);
  }

  /** Public market data needs no credentials. */
  isConfigured(): boolean {
    return true;
  }

  protected async ping(): Promise<void> {
    await this.request({ url: '/v5/market/time' });
  }

  private unwrap<T>(env: BybitEnvelope<T>): T {
    if (env.retCode !== 0) {
      throw new Error(`bybit error ${env.retCode}: ${env.retMsg}`);
    }
    return env.result;
  }

  /** Latest ticker for a linear perpetual. */
  async getTicker(symbol: string): Promise<BybitTicker> {
    const sym = toBybitSymbol(symbol);
    return cached(`bybit:ticker:${sym}`, PUBLIC_TTL, async () => {
      const env = await this.request<BybitEnvelope<BybitTickerResult>>({
        url: '/v5/market/tickers',
        params: { category: 'linear', symbol: sym },
      });
      const res = this.unwrap(env);
      const t = res.list[0];
      if (!t) throw new Error(`bybit: no ticker for ${sym}`);
      return t;
    });
  }

  /**
   * Open-interest snapshot. Bybit's ticker already carries OI, funding and
   * mark price, so we derive most fields from a single ticker call.
   */
  async getOpenInterest(symbol: string): Promise<OpenInterestSnapshot> {
    const sym = toBybitSymbol(symbol);
    return cached(`bybit:oi:${sym}`, PUBLIC_TTL, async () => {
      const t = await this.getTicker(symbol);
      return {
        symbol: sym,
        exchange: 'BYBIT',
        openInterest: Number(t.openInterest),
        openInterestUsd: Number(t.openInterestValue),
        fundingRate: Number(t.fundingRate),
        longShortRatio: 1, // Bybit does not expose account L/S ratio publicly
        timestamp: Date.now(),
      };
    });
  }

  /** Current funding rate (decimal) for a linear perpetual. */
  async getFundingRate(symbol: string): Promise<number> {
    const sym = toBybitSymbol(symbol);
    const t = await this.getTicker(sym);
    return Number(t.fundingRate);
  }

  /** Candlestick / kline data for a linear perpetual. */
  async getKlines(symbol: string, interval = '1h', limit = 100): Promise<Kline[]> {
    const sym = toBybitSymbol(symbol);
    const bin = toBybitInterval(interval);
    return cached(`bybit:klines:${sym}:${bin}:${limit}`, PUBLIC_TTL, async () => {
      const env = await this.request<BybitEnvelope<BybitKlineResult>>({
        url: '/v5/market/kline',
        params: { category: 'linear', symbol: sym, interval: bin, limit },
      });
      const res = this.unwrap(env);
      // Bybit returns newest-first; reverse to chronological.
      return res.list
        .map((k) => ({
          openTime: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: Number(k[5]),
        }))
        .reverse();
    });
  }
}
