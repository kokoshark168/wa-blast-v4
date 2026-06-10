# AlphaFlow Terminal — Modules

The platform is organized into 14 functional modules. Each is backed by a pure
engine in `lib/engines/*` (or a cross-cutting library), consumes normalized
domain types from `types/index.ts`, and is surfaced by a REST endpoint under
`/api`. Engine signatures below are the authoritative, unit-tested contracts.

---

## 1. Smart Money

- **Purpose:** Derive performance/risk metrics for tracked wallets and rank them
  by a lookback window.
- **Inputs:** `WalletTrade[]` (valueUsd, pnl, openedAt, closedAt); `RankableWallet[]`.
- **Outputs:** `WalletMetrics`, `RankedWallet[]`.
- **API:** `GET /api/smart-money`
- **Key fns:** `computeWalletMetrics(trades)`, `rankWallets(wallets, by)` in
  `lib/engines/smartMoney.ts`.

## 2. Whale Intelligence

- **Purpose:** Classify and tier large on-chain transfers (inflow/outflow/OTC/
  treasury/smart-money accumulation).
- **Inputs:** `RawWhaleTransfer`, `WhaleContext` (address-label predicates).
- **Outputs:** `WhaleTransaction | null`, `WhaleTier | null`, `WhaleClassification`.
- **API:** `GET /api/whale`
- **Key fns:** `classifyTransaction(tx, ctx)`, `tierFor(valueUsd)`,
  `buildWhaleTransaction(raw, ctx)` in `lib/engines/whale.ts`.

## 3. Hyperliquid Positions

- **Purpose:** Track large perp positions and surface entry/mark/liq/PnL.
- **Inputs:** Hyperliquid account/clearinghouse state (via `services/hyperliquid`).
- **Outputs:** `HyperliquidPosition[]`.
- **API:** `GET /api/hyperliquid`
- **Key fn:** service-driven normalization into `HyperliquidPosition` (feeds the
  liquidation engine).

## 4. Open Interest / Squeeze

- **Purpose:** Infer squeeze regimes from OI snapshots + recent price action.
- **Inputs:** `OpenInterestSnapshot[]` (ascending by ts), `priceChangePct`.
- **Outputs:** `SqueezeSignal` (`type`, `probability` 0..100, `rationale[]`).
- **API:** `GET /api/open-interest`
- **Key fn:** `detectSqueeze(snapshots, priceChangePct)` in
  `lib/engines/openInterest.ts`.

## 5. Liquidation Heatmap

- **Purpose:** Estimate liquidation prices, cluster notional into price levels,
  flag magnet levels and stop-hunt zones.
- **Inputs:** `LiquidationPosition[]` (entryPrice, leverage, side, notionalUsd),
  `currentPrice`.
- **Outputs:** `LiquidationHeatmap` (`levels`, `magnetLevels`, `stopHuntZones`).
- **API:** `GET /api/liquidations`
- **Key fns:** `liquidationPrice(p)`, `buildHeatmap(symbol, price, positions)` in
  `lib/engines/liquidation.ts`.

## 6. Token Discovery

- **Purpose:** Score new/low-cap tokens for early-gem potential, risk, momentum.
- **Inputs:** `TokenDiscoveryInput` (volume/wallet/smartMoney/social/liquidity growth).
- **Outputs:** `TokenScore` (earlyGemScore, riskScore, momentumScore — all 0..100).
- **API:** `GET /api/tokens/discover`
- **Key fn:** `scoreToken(input)` in `lib/engines/tokenDiscovery.ts`.

## 7. Social Sentiment

- **Purpose:** Turn mention counts + sentiment tallies into velocity/polarity/
  acceleration signals; surface emerging trends.
- **Inputs:** `SentimentInput` (mentionsNow/Prev, positive/negative/neutral, platform).
- **Outputs:** `SentimentSignal` (mentionVelocity, sentimentScore -1..1, flags).
- **API:** `GET /api/sentiment`
- **Key fns:** `analyzeSentiment(input)`, `detectEmergingTrends(signals)` in
  `lib/engines/sentiment.ts`.

## 8. On-chain Intelligence

- **Purpose:** Map a raw on-chain metric to a directional market-impact estimate.
- **Inputs:** `OnChainSignal` minus `marketImpactEstimate` (chain, metricType, value, ts).
- **Outputs:** `OnChainSignal` with `marketImpactEstimate` in `[-1, 1]`.
- **API:** `GET /api/onchain`
- **Key fn:** `estimateMarketImpact(signal)` in `lib/engines/onchain.ts`.

## 9. AI Research / Reports

- **Purpose:** Generate periodic market reports (summary + bull/bear/risk factors
  + key levels).
- **Inputs:** Aggregated signals across modules; `ReportPeriod`.
- **Outputs:** `MarketReport`.
- **API:** `GET /api/reports`
- **Key fn:** `generateReport(...)` in `lib/engines/aiResearch.ts`.

## 10. Alpha Score

- **Purpose:** Blend seven 0..100 component signals into one conviction score +
  discrete rating.
- **Inputs:** `AlphaScoreComponents` (whale, smartMoney, OI, funding, onChain,
  sentiment, volume).
- **Outputs:** `AlphaScore` (`score` 0..100, `rating`).
- **API:** `GET /api/alpha`
- **Key fns:** `computeAlphaScore(symbol, components)`, `ratingFor(score)`,
  `ALPHA_WEIGHTS` in `lib/engines/alphaScore.ts`. Weights sum to 1.0; thresholds
  ≥80 STRONG_OPPORTUNITY, 60–79 WATCHLIST, 40–59 NEUTRAL, <40 AVOID.

## 11. Backtesting

- **Purpose:** Turn closed trades into an equity curve + performance/risk metrics.
- **Inputs:** `BacktestTrade[]`, `BacktestOptions` (startValue, periodsPerYear).
- **Outputs:** `BacktestMetrics & { equityCurve }`; `SignalBacktestSummary`.
- **API:** `POST /api/backtest`
- **Key fns:** `runBacktest(trades, opts)`, `summarizeSignalBacktest(name, trades)`
  in `lib/engines/backtest.ts`.

## 12. Alerts

- **Purpose:** Decide when an alert should fire and route it to subscriber channels.
- **Inputs:** `AlertInputs` (whale/funding/OI/sentiment/smartMoney), `AlertSubscription[]`.
- **Outputs:** `EvaluateResult` (`fired[]`, `deliveries[]`).
- **API:** `GET/POST /api/alerts`
- **Key fns:** rule predicates + `formatAlert` in `lib/alerts/rules.ts`;
  `evaluate` / `evaluateAndDispatch` in `lib/alerts/engine.ts`; delivery via
  `lib/notify` (`dispatch`, `allChannels`).

## 13. Portfolio

- **Purpose:** Track holdings, positions and realized/unrealized PnL per user.
- **Inputs:** `Wallet` / `Holding` / `Position` rows (Prisma).
- **Outputs:** Portfolio valuation + per-asset breakdown.
- **API:** `GET /api/portfolio`
- **Key data:** quant helpers (`profitFactor`, `winRate`) over position history.

## 14. Screener

- **Purpose:** Filter the asset universe by composite criteria.
- **Inputs:** `ScreenerFilters` (marketCap/liquidity/volume/smartMoney/alpha/narrative).
- **Outputs:** Filtered, ranked candidate list (often joined with Alpha Score).
- **API:** `GET /api/screener`
- **Key data:** combines Alpha Score + Token Discovery + market data.

---

### Cross-cutting libraries

| Library         | Role                                                         |
| --------------- | ------------------------------------------------------------ |
| `lib/quant.ts`  | mean, stdDev, sharpe/sortino, maxDrawdown, cagr, winRate, profitFactor, clamp, normalize, weightedAverage |
| `lib/notify/*`  | `TelegramChannel`, `DiscordChannel`, `EmailChannel`, `dispatch`, `allChannels` |
| `lib/alerts/*`  | rule predicates, `formatAlert`, `evaluateAndDispatch`        |
| `lib/logger.ts` | Pino structured logging via `childLogger(name)`              |
```
