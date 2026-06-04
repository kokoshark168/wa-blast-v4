// Shared domain types for AlphaFlow Terminal

export type Chain = 'ethereum' | 'solana' | 'bsc' | 'arbitrum' | 'base';
export type Exchange = 'BINANCE' | 'BYBIT' | 'HYPERLIQUID' | 'OTHER';
export type Side = 'long' | 'short';

// ── Module 1: Smart Money ────────────────────────────────
export interface WalletMetrics {
  roi: number;            // percent
  winRate: number;        // 0..1
  avgHoldingPeriod: number; // hours
  riskScore: number;      // 0..100
  profitFactor: number;   // gross profit / gross loss
  totalTrades: number;
  realizedPnl: number;
}

export interface RankedWallet extends WalletMetrics {
  address: string;
  name: string;
  chain: Chain;
  performance7d: number;
  performance30d: number;
  performance90d: number;
}

// ── Module 2: Whale Intelligence ─────────────────────────
export type WhaleTier = '100k' | '1m' | '10m';
export type WhaleClassification =
  | 'EXCHANGE_INFLOW'
  | 'EXCHANGE_OUTFLOW'
  | 'OTC_MOVEMENT'
  | 'TREASURY_MOVEMENT'
  | 'SMART_MONEY_ACCUMULATION'
  | 'UNKNOWN';

export interface WhaleTransaction {
  txHash: string;
  chain: Chain;
  from: string;
  to: string;
  tokenSymbol: string;
  tokenAddress: string;
  amount: number;
  valueUsd: number;
  tier: WhaleTier;
  classification: WhaleClassification;
  timestamp: number;
}

// ── Module 3: Hyperliquid ────────────────────────────────
export interface HyperliquidPosition {
  wallet: string;
  symbol: string;
  side: Side;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  positionSizeUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  timestamp: number;
}

// ── Module 4: Open Interest ──────────────────────────────
export type SqueezeType = 'SHORT_SQUEEZE' | 'LONG_SQUEEZE' | 'CROWDED' | 'EXHAUSTION' | 'NEUTRAL';

export interface OpenInterestSnapshot {
  symbol: string;
  exchange: Exchange;
  openInterest: number;
  openInterestUsd: number;
  fundingRate: number;
  longShortRatio: number;
  timestamp: number;
}

export interface SqueezeSignal {
  symbol: string;
  type: SqueezeType;
  probability: number; // 0..100
  rationale: string[];
}

// ── Module 5: Liquidation Heatmap ────────────────────────
export interface LiquidationLevel {
  price: number;
  notional: number;     // total liquidation notional clustered at this price
  side: Side;           // which side gets liquidated
  intensity: number;    // 0..1 normalized
}

export interface LiquidationHeatmap {
  symbol: string;
  levels: LiquidationLevel[];
  magnetLevels: number[];
  stopHuntZones: { low: number; high: number }[];
  generatedAt: number;
}

// ── Module 6: Token Discovery ────────────────────────────
export interface TokenScore {
  symbol: string;
  address: string;
  chain: Chain;
  earlyGemScore: number;  // 0..100
  riskScore: number;      // 0..100
  momentumScore: number;  // 0..100
  volumeGrowth: number;
  walletGrowth: number;
  smartMoneyBuying: number;
  socialGrowth: number;
  liquidityGrowth: number;
}

// ── Module 7: Social Sentiment ───────────────────────────
export type SocialPlatform = 'twitter' | 'reddit' | 'telegram';

export interface SentimentSignal {
  keyword: string;
  platform: SocialPlatform | 'aggregate';
  mentionVelocity: number;  // mentions/hour delta
  sentimentScore: number;   // -1..1
  trendAcceleration: number;
  isNarrativeShift: boolean;
  isViral: boolean;
}

// ── Module 8: On-chain Intelligence ──────────────────────
export interface OnChainSignal {
  chain: Chain;
  metricType:
    | 'NEW_WALLETS'
    | 'LARGE_TRANSFER'
    | 'EXCHANGE_RESERVE'
    | 'STABLE_INFLOW'
    | 'STABLE_OUTFLOW';
  value: number;
  marketImpactEstimate: number; // -1..1 (bearish..bullish)
  timestamp: number;
}

// ── Module 9: AI Research ────────────────────────────────
export type ReportPeriod = 'hourly' | 'daily' | 'weekly';
export interface MarketReport {
  period: ReportPeriod;
  generatedAt: number;
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  riskFactors: string[];
  keyLevels: { symbol: string; support: number; resistance: number }[];
}

// ── Module 10: Alpha Score ───────────────────────────────
export interface AlphaScoreComponents {
  whaleActivity: number;
  smartMoneyActivity: number;
  openInterest: number;
  funding: number;
  onChain: number;
  sentiment: number;
  volume: number;
}

export type AlphaRating = 'STRONG_OPPORTUNITY' | 'WATCHLIST' | 'NEUTRAL' | 'AVOID';

export interface AlphaScore {
  symbol: string;
  score: number; // 0..100
  rating: AlphaRating;
  components: AlphaScoreComponents;
  generatedAt: number;
}

// ── Module 11: Backtesting ───────────────────────────────
export interface BacktestMetrics {
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  cagr: number;
  totalTrades: number;
}

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
}

// ── Module 14: Screener ──────────────────────────────────
export interface ScreenerFilters {
  minMarketCap?: number;
  maxMarketCap?: number;
  minLiquidity?: number;
  minVolume?: number;
  minSmartMoneyActivity?: number;
  minAlphaScore?: number;
  narrative?: string;
}

// ── WebSocket message envelope ───────────────────────────
export type WsChannel =
  | 'whale'
  | 'smart-money'
  | 'hyperliquid'
  | 'open-interest'
  | 'liquidations'
  | 'sentiment'
  | 'alpha'
  | 'alerts';

export interface WsMessage<T = unknown> {
  channel: WsChannel;
  event: string;
  data: T;
  ts: number;
}
