import { BaseDataSource } from '@/services/base';
import { cached } from '@/lib/redis';
import type { OpenInterestSnapshot } from '@/types';

/** Binance public REST base for spot. */
const SPOT_BASE = 'https://api.binance.com';
/** Binance public REST base for USDⓈ-M futures. */
const FUTURES_BASE = 'https://fapi.binance.com';

const PUBLIC_TTL = 30; // seconds

/** Normalize a symbol to Binance form, e.g. `BTC` -> `BTCUSDT`. */
export function toBinanceSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-/_]/g, '');
  if (s.endsWith('USDT') || s.endsWith('USDC') || s.endsWith('BUSD')) return s;
  return `${s}USDT`;
}

interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

interface BinancePremiumIndex {
  symbol: string;
  markPrice: string;
  indexPrice: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
}

interface BinanceOpenInterestHist {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
}

interface BinanceLongShortRatio {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: number;
}

type RawKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base
  string, // taker buy quote
  string, // ignore
];

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Binance spot + USDⓈ-M futures adapter. All endpoints used here are public
 * and require no API key; an optional key/secret would only be needed for
 * private/account endpoints which are out of scope.
 */
export class BinanceService extends BaseDataSource {
  readonly name = 'binance';

  constructor() {
    super(SPOT_BASE);
  }

  /** Public market data needs no credentials. */
  isConfigured(): boolean {
    return true;
  }

  protected async ping(): Promise<void> {
    await this.request({ url: '/api/v3/ping', baseURL: SPOT_BASE });
  }

  /** 24h ticker statistics for a symbol (spot). */
  async getTicker(symbol: string): Promise<BinanceTicker> {
    const sym = toBinanceSymbol(symbol);
    return cached(`binance:ticker:${sym}`, PUBLIC_TTL, () =>
      this.request<BinanceTicker>({
        url: '/api/v3/ticker/24hr',
        baseURL: SPOT_BASE,
        params: { symbol: sym },
      })
    );
  }

  /**
   * Current funding rate (last settled) for a perpetual contract.
   * Returns the decimal rate, e.g. `0.0001` for 0.01%.
   */
  async getFundingRate(symbol: string): Promise<number> {
    const sym = toBinanceSymbol(symbol);
    const data = await cached(`binance:premium:${sym}`, PUBLIC_TTL, () =>
      this.request<BinancePremiumIndex>({
        url: '/fapi/v1/premiumIndex',
        baseURL: FUTURES_BASE,
        params: { symbol: sym },
      })
    );
    return Number(data.lastFundingRate);
  }

  /**
   * Open-interest snapshot for a perpetual contract, combining the latest
   * open-interest history bucket, funding rate and top long/short ratio.
   */
  async getOpenInterest(symbol: string): Promise<OpenInterestSnapshot> {
    const sym = toBinanceSymbol(symbol);
    return cached(`binance:oi:${sym}`, PUBLIC_TTL, async () => {
      const [oiHist, premium, ratio] = await Promise.all([
        this.request<BinanceOpenInterestHist[]>({
          url: '/futures/data/openInterestHist',
          baseURL: FUTURES_BASE,
          params: { symbol: sym, period: '5m', limit: 1 },
        }),
        this.request<BinancePremiumIndex>({
          url: '/fapi/v1/premiumIndex',
          baseURL: FUTURES_BASE,
          params: { symbol: sym },
        }),
        this.getTopLongShortRatio(symbol).catch(() => 1),
      ]);
      const latest = oiHist[oiHist.length - 1];
      return {
        symbol: sym,
        exchange: 'BINANCE',
        openInterest: latest ? Number(latest.sumOpenInterest) : 0,
        openInterestUsd: latest ? Number(latest.sumOpenInterestValue) : 0,
        fundingRate: Number(premium.lastFundingRate),
        longShortRatio: ratio,
        timestamp: latest ? latest.timestamp : premium.time,
      };
    });
  }

  /**
   * Top trader long/short account ratio for a perpetual contract.
   * Returns the latest ratio (long accounts / short accounts).
   */
  async getTopLongShortRatio(symbol: string): Promise<number> {
    const sym = toBinanceSymbol(symbol);
    const data = await cached(`binance:lsr:${sym}`, PUBLIC_TTL, () =>
      this.request<BinanceLongShortRatio[]>({
        url: '/futures/data/topLongShortAccountRatio',
        baseURL: FUTURES_BASE,
        params: { symbol: sym, period: '5m', limit: 1 },
      })
    );
    const latest = data[data.length - 1];
    return latest ? Number(latest.longShortRatio) : 1;
  }

  /** Candlestick / kline data for a spot symbol. */
  async getKlines(symbol: string, interval = '1h', limit = 100): Promise<Kline[]> {
    const sym = toBinanceSymbol(symbol);
    const raw = await cached(`binance:klines:${sym}:${interval}:${limit}`, PUBLIC_TTL, () =>
      this.request<RawKline[]>({
        url: '/api/v3/klines',
        baseURL: SPOT_BASE,
        params: { symbol: sym, interval, limit },
      })
    );
    return raw.map((k) => ({
      openTime: k[0],
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  }
}
