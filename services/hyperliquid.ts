import { BaseDataSource } from '@/services/base';
import type { HyperliquidPosition } from '@/types';

const BASE = 'https://api.hyperliquid.xyz';

/** Raw `clearinghouseState` shape (subset we consume). */
interface ClearinghouseState {
  assetPositions: AssetPosition[];
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
}

interface AssetPosition {
  type: string;
  position: {
    coin: string;
    szi: string; // signed size; negative = short
    entryPx: string | null;
    positionValue: string;
    unrealizedPnl: string;
    returnOnEquity: string;
    leverage: { type: string; value: number };
    liquidationPx: string | null;
    marginUsed: string;
  };
}

type AllMids = Record<string, string>;

interface MetaUniverse {
  universe: { name: string; szDecimals: number; maxLeverage: number }[];
}

/**
 * Hyperliquid adapter. The public API is per-wallet (POST `/info` with a typed
 * body). There is no global "all positions" endpoint, so aggregate views are
 * built by querying a supplied set of wallet addresses.
 */
export class HyperliquidService extends BaseDataSource {
  readonly name = 'hyperliquid';

  constructor() {
    super(BASE, { 'Content-Type': 'application/json' });
  }

  /** Public info endpoint needs no credentials. */
  isConfigured(): boolean {
    return true;
  }

  protected async ping(): Promise<void> {
    await this.getAllMids();
  }

  /** Generic POST to the `/info` endpoint with a typed request body. */
  private info<T>(body: Record<string, unknown>): Promise<T> {
    return this.request<T>({ url: '/info', method: 'POST', data: body });
  }

  /** Full clearinghouse (margin) state for a wallet. */
  async getClearinghouseState(wallet: string): Promise<ClearinghouseState> {
    return this.info<ClearinghouseState>({ type: 'clearinghouseState', user: wallet });
  }

  /** Map of coin -> mid price across all listed perps. */
  async getAllMids(): Promise<AllMids> {
    return this.info<AllMids>({ type: 'allMids' });
  }

  /** Exchange metadata (the perp universe and per-asset config). */
  async getMeta(): Promise<MetaUniverse> {
    return this.info<MetaUniverse>({ type: 'meta' });
  }

  /**
   * Open positions for a single wallet, normalized into {@link HyperliquidPosition}.
   * Side is derived from the sign of `szi`; entry/mark/liquidation prices and
   * PnL come from the clearinghouse state (mark price is pulled from allMids).
   */
  async getUserPositions(wallet: string): Promise<HyperliquidPosition[]> {
    const [state, mids] = await Promise.all([
      this.getClearinghouseState(wallet),
      this.getAllMids().catch<AllMids>(() => ({})),
    ]);
    const now = Date.now();

    return state.assetPositions
      .filter((ap) => Number(ap.position.szi) !== 0)
      .map((ap) => {
        const p = ap.position;
        const szi = Number(p.szi);
        const side = szi >= 0 ? 'long' : 'short';
        const entryPrice = p.entryPx != null ? Number(p.entryPx) : 0;
        const markPrice = mids[p.coin] != null ? Number(mids[p.coin]) : entryPrice;
        const positionSizeUsd = Math.abs(Number(p.positionValue));
        const unrealizedPnl = Number(p.unrealizedPnl);
        const roe = Number(p.returnOnEquity);
        const liquidationPrice = p.liquidationPx != null ? Number(p.liquidationPx) : 0;
        return {
          wallet,
          symbol: p.coin,
          side,
          leverage: p.leverage?.value ?? 0,
          entryPrice,
          markPrice,
          liquidationPrice,
          positionSizeUsd,
          unrealizedPnl,
          unrealizedPnlPercent: Number.isFinite(roe) ? roe * 100 : 0,
          timestamp: now,
        } satisfies HyperliquidPosition;
      });
  }

  /**
   * Aggregate the largest open positions across the supplied wallet addresses,
   * sorted by USD notional descending. Wallets that error are skipped.
   * @param wallets Wallet addresses to inspect (Hyperliquid has no global feed).
   */
  async getLargestPositions(wallets: string[] = []): Promise<HyperliquidPosition[]> {
    const results = await Promise.allSettled(wallets.map((w) => this.getUserPositions(w)));
    const positions: HyperliquidPosition[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') positions.push(...r.value);
    }
    return positions.sort((a, b) => b.positionSizeUsd - a.positionSizeUsd);
  }
}
