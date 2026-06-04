# AlphaFlow Terminal — REST API Reference

Base URL: `${NEXT_PUBLIC_API_URL}` (default `http://localhost:3000`). All routes
live under `/api/*` (Next.js App Router route handlers).

## Conventions

- **Format:** JSON request/response bodies; `Content-Type: application/json`.
- **Auth:** Protected routes require `Authorization: Bearer <JWT>` (issued by
  `/api/auth/login`). RBAC roles: `USER`, `ADMIN`.
- **Validation:** Query/body validated with zod; invalid input → `400`.
- **Errors:** `{ "error": string, "details"?: unknown }` with a non-2xx status
  (`400` bad input, `401` unauthenticated, `403` forbidden, `404` not found,
  `429` rate-limited, `500` server error).
- **Time:** Unix epoch **milliseconds** unless noted.
- **Caching:** Read endpoints may return cached results (short Redis TTL).

---

## Auth — `/api/auth/*`

### `POST /api/auth/register`
Body: `{ email, password }` → `201 { id, email }`.

### `POST /api/auth/login`
Body: `{ email, password }` → `200 { token, user: { id, email, role } }`.

### `POST /api/auth/logout`
Auth required → `200 { ok: true }`.

### `GET /api/auth/me`
Auth required → `200 { id, email, role, subscriptionTier }`.

---

## Wallets — `/api/wallets`

### `GET /api/wallets`
Auth. List the caller's tracked wallets.
Response: `[{ id, address, chain, label, createdAt }]`.

### `POST /api/wallets`
Auth. Body: `{ address, chain, label? }` → `201 { id, address, chain, label }`.

### `DELETE /api/wallets/:id`
Auth. → `200 { ok: true }`.

---

## Alerts — `/api/alerts`

### `GET /api/alerts`
Auth. List the caller's alert definitions + subscriptions.
Response:
```json
[{ "id": "alrt_1", "type": "WHALE_BUY", "title": "Big ETH accumulation",
   "severity": 7, "isActive": true,
   "subscriptions": [{ "channels": ["TELEGRAM","DISCORD"], "isActive": true }] }]
```

### `POST /api/alerts`
Auth. Create an alert + subscription.
Body:
```json
{ "type": "WHALE_BUY", "title": "Big ETH accumulation",
  "triggerConditions": { "whaleUsd": 1000000 },
  "channels": ["TELEGRAM"] }
```
Response: `201 { id, type, channels }`.

### `PATCH /api/alerts/:id`  — toggle/update (`{ isActive?, channels?, triggerConditions? }`).
### `DELETE /api/alerts/:id` — `200 { ok: true }`.

> Server-side, fresh data is run through `lib/alerts/engine.evaluateAndDispatch`,
> which evaluates the pure rule predicates and dispatches matches to each
> subscription's channels via `lib/notify`.

---

## Smart Money — `GET /api/smart-money`

Query: `by=7d|30d|90d` (default `30d`), `chain?`, `limit?` (default 50).
Response:
```json
[{ "address": "0x..", "name": "Wallet A", "chain": "ethereum",
   "roi": 42.5, "winRate": 0.68, "riskScore": 31, "profitFactor": 2.4,
   "performance7d": 5.1, "performance30d": 18.2, "performance90d": 44.0 }]
```
Engine: `computeWalletMetrics` + `rankWallets`.

---

## Whale — `GET /api/whale`

Query: `chain?`, `tier?=100k|1m|10m`, `classification?`, `limit?`.
Response:
```json
[{ "txHash": "0x..", "chain": "ethereum", "tokenSymbol": "ETH",
   "amount": 1500, "valueUsd": 5400000, "tier": "1m",
   "classification": "EXCHANGE_OUTFLOW", "timestamp": 1700000000000 }]
```
Engine: `buildWhaleTransaction`.

---

## Hyperliquid — `GET /api/hyperliquid`

Query: `wallet?`, `symbol?`, `minSizeUsd?`.
Response:
```json
[{ "wallet": "0x..", "symbol": "BTC", "side": "long", "leverage": 10,
   "entryPrice": 60000, "markPrice": 61000, "liquidationPrice": 54200,
   "positionSizeUsd": 1200000, "unrealizedPnl": 20000,
   "unrealizedPnlPercent": 1.67, "timestamp": 1700000000000 }]
```

---

## Open Interest — `GET /api/open-interest`

Query: `symbol` (required), `exchange?`, `window?` (#snapshots).
Response:
```json
{ "symbol": "BTC", "type": "LONG_SQUEEZE", "probability": 72,
  "rationale": ["Funding hot positive ...", "OI up 30.0% ...", "..."] }
```
Engine: `detectSqueeze`.

---

## Liquidations — `GET /api/liquidations`

Query: `symbol` (required), `buckets?` (default 50).
Response:
```json
{ "symbol": "BTC", "generatedAt": 1700000000000,
  "levels": [{ "price": 58000, "notional": 4200000, "side": "long", "intensity": 1 }],
  "magnetLevels": [58000, 62000],
  "stopHuntZones": [{ "low": 60000, "high": 60100 }] }
```
Engine: `buildHeatmap` / `liquidationPrice`.

---

## Token Discovery — `GET /api/tokens/discover`

Query: `chain?`, `minGemScore?`, `limit?`.
Response:
```json
[{ "symbol": "GEM", "address": "0x..", "chain": "base",
   "earlyGemScore": 81, "riskScore": 35, "momentumScore": 64,
   "volumeGrowth": 1.2, "walletGrowth": 0.9, "smartMoneyBuying": 0.6,
   "socialGrowth": 1.4, "liquidityGrowth": 0.7 }]
```
Engine: `scoreToken`.

---

## Sentiment — `GET /api/sentiment`

Query: `keyword?`, `platform?=twitter|reddit|telegram|aggregate`, `emerging?=true`.
Response:
```json
[{ "keyword": "pepe", "platform": "aggregate", "mentionVelocity": 230,
   "sentimentScore": 0.62, "trendAcceleration": 4.1,
   "isNarrativeShift": true, "isViral": true }]
```
Engine: `analyzeSentiment` / `detectEmergingTrends`.

---

## On-chain — `GET /api/onchain`

Query: `chain`, `metricType`, `value`.
Response:
```json
{ "chain": "ethereum", "metricType": "EXCHANGE_RESERVE", "value": -50000000,
  "marketImpactEstimate": 0.46, "timestamp": 1700000000000 }
```
Engine: `estimateMarketImpact`.

---

## Reports — `GET /api/reports`

Query: `period=hourly|daily|weekly` (default `daily`).
Response:
```json
{ "period": "daily", "generatedAt": 1700000000000,
  "summary": "...", "bullishFactors": ["..."], "bearishFactors": ["..."],
  "riskFactors": ["..."], "keyLevels": [{ "symbol": "BTC", "support": 58000, "resistance": 64000 }] }
```
Engine: `generateReport`.

---

## Alpha — `GET /api/alpha`

Query: `symbol` (required).
Response:
```json
{ "symbol": "BTC", "score": 78, "rating": "WATCHLIST",
  "components": { "whaleActivity": 80, "smartMoneyActivity": 90, "openInterest": 60,
                  "funding": 50, "onChain": 75, "sentiment": 70, "volume": 85 },
  "generatedAt": 1700000000000 }
```
Engine: `computeAlphaScore` (`ratingFor`, `ALPHA_WEIGHTS`).

---

## Backtest — `POST /api/backtest`

Body:
```json
{ "strategy": "whale-follow", "startValue": 10000, "periodsPerYear": 365,
  "trades": [{ "entryTime": 0, "exitTime": 86400000,
               "entryPrice": 100, "exitPrice": 105, "returnPct": 0.05 }] }
```
Response:
```json
{ "strategy": "whale-follow", "winRate": 0.6, "sharpeRatio": 1.8,
  "sortinoRatio": 2.4, "maxDrawdown": 0.12, "cagr": 0.34, "totalTrades": 10,
  "equityCurve": [10000, 10500, "..."] }
```
Engine: `runBacktest` / `summarizeSignalBacktest`.

---

## Screener — `GET /api/screener`

Query (all optional): `minMarketCap`, `maxMarketCap`, `minLiquidity`,
`minVolume`, `minSmartMoneyActivity`, `minAlphaScore`, `narrative`.
Response: ranked candidates, each joined with its Alpha Score.

---

## Portfolio — `GET /api/portfolio`

Auth. Query: `walletId?`.
Response:
```json
{ "totalValueUsd": 125000, "realizedPnl": 18000, "unrealizedPnl": 4200,
  "holdings": [{ "symbol": "ETH", "amount": 12.5, "valueUsd": 41000, "pnl": 6200 }] }
```

---

## Admin — `/api/admin/*` (role `ADMIN`)

| Method & path                | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `GET /api/admin/users`       | List users (paginated).                  |
| `PATCH /api/admin/users/:id` | Update role / subscription tier.         |
| `GET /api/admin/health`      | Data-source health (`dataSourceHealth`). |
| `GET /api/admin/audit`       | Audit log (`AuditLog`).                  |
| `GET /api/admin/metrics`     | System metrics (cache hit-rate, queue).  |

Health response (`/api/admin/health`):
```json
[{ "name": "binance", "configured": true, "reachable": true, "latencyMs": 42 }]
```

---

## WebSocket

Connect to `${NEXT_PUBLIC_WS_URL}` and subscribe to channels. Each message is a
`WsMessage<T>` envelope:
```json
{ "channel": "whale", "event": "transaction", "data": { /* WhaleTransaction */ }, "ts": 1700000000000 }
```
Channels: `whale`, `smart-money`, `hyperliquid`, `open-interest`,
`liquidations`, `sentiment`, `alpha`, `alerts`.
```
