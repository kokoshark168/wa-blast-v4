# AlphaFlow Terminal — Architecture

AlphaFlow Terminal is a Next.js 15 (App Router) + TypeScript crypto intelligence
platform. It ingests market, on-chain and social data, runs it through a set of
pure analytics **engines**, exposes results over a REST API + WebSocket stream,
and renders them in a React dashboard. Alerting fans matched signals out to
Telegram / Discord / e-mail.

## Layered overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  UI  (app/* — React 19, App Router, React Query, Zustand, Recharts)    │
└───────────────▲───────────────────────────────▲───────────────────────┘
                │ REST (fetch / React Query)     │ WebSocket (live ticks)
┌───────────────┴───────────────────────────────┴───────────────────────┐
│  API  (app/api/**/route.ts — auth, validation (zod), caching, RBAC)    │
└───────────────▲───────────────────────────────▲───────────────────────┘
                │ pure function calls            │ publish
┌───────────────┴───────────────┐   ┌────────────┴───────────────────────┐
│  Engines  (lib/engines/*)      │   │  Notify / Alerts                    │
│  pure, deterministic analytics │   │  lib/alerts/* + lib/notify/*        │
│  smartMoney whale openInterest │   │  rules → engine → dispatch          │
│  liquidation tokenDiscovery    │   └────────────▲───────────────────────┘
│  sentiment onchain alphaScore  │                │
│  backtest aiResearch           │                │
└───────────────▲────────────────┘                │
                │ normalized domain types          │
┌───────────────┴──────────────────────────────────┴────────────────────┐
│  Services  (services/* — data-source adapters, BaseDataSource)         │
│  binance bybit hyperliquid coingecko defillama ethereum solana         │
│  social/{twitter,reddit,telegram}                                      │
└───────────────▲────────────────────────────────────────────────────────┘
                │ HTTP / RPC / WS
┌───────────────┴────────────────────────────────────────────────────────┐
│  External sources  (CEX APIs, RPCs, DeFiLlama, CoinGecko, socials)     │
└────────────────────────────────────────────────────────────────────────┘

         Postgres (Prisma)  ◀── persistence ──▶  Redis (cache + pub/sub)
```

## Design principles

- **Pure engines.** Everything in `lib/engines/*` and `lib/quant.ts` is a pure,
  side-effect-free function over the domain types in `types/index.ts`. No
  network, no clock dependence beyond `Date.now()` stamps. This makes the
  analytics fully unit-testable offline (see `__tests__/`).
- **Adapters isolate I/O.** All external calls live in `services/*`, each
  extending `BaseDataSource` and reporting a uniform `health()` /
  `isConfigured()`. Engines never call the network directly — the API layer
  fetches, normalizes to domain types, then calls engines.
- **Self-contained delivery.** `lib/notify/*` channels read their own env (or
  accept config) and use `fetch` (Telegram/Discord) or lazy nodemailer (e-mail),
  so they have no hard coupling to the ingestion services.
- **Graceful degradation.** A missing API key disables exactly one source;
  `isConfigured()` gates it and the rest of the system keeps running.

## Data flow (request path)

1. **Ingest** — A route (or a background job) calls one or more `services/*`
   adapters to pull raw data.
2. **Normalize** — Raw payloads are mapped to domain types (`WhaleTransaction`,
   `OpenInterestSnapshot`, `SentimentSignal`, …).
3. **Analyze** — The relevant engine function transforms inputs into a result
   type (`SqueezeSignal`, `AlphaScore`, `LiquidationHeatmap`, …).
4. **Cache** — Hot results are cached in Redis with a short TTL keyed by
   symbol/params.
5. **Serve** — The route returns JSON; React Query caches it client-side.
6. **Alert** — Fresh data also runs through `lib/alerts/engine`
   (`evaluateAndDispatch`), which evaluates pure rule predicates and dispatches
   matched alerts via `lib/notify`.

## Real-time (WebSocket)

- A WebSocket server (built on `ws`) pushes `WsMessage<T>` envelopes
  (`{ channel, event, data, ts }`) on the channels enumerated by `WsChannel`
  (`whale`, `smart-money`, `hyperliquid`, `open-interest`, `liquidations`,
  `sentiment`, `alpha`, `alerts`).
- Upstream exchange WS feeds (e.g. Hyperliquid, Binance) are consumed by the
  service layer, transformed by engines, and re-broadcast to subscribed clients.
- In a multi-instance deployment, instances publish to a **Redis pub/sub**
  channel; every WS node subscribes and relays to its locally-connected clients,
  so a tick computed on one node reaches clients connected to any node.

## Caching with Redis

- **Read cache:** computed engine results (alpha scores, heatmaps, OI signals)
  cached with per-endpoint TTLs (seconds → a few minutes).
- **Rate-limit buckets:** token buckets per source / per user.
- **Pub/sub fan-out:** the real-time bus described above.
- **Session/JWT denylist:** optional revocation set for logout-all.

## Multi-instance notes

- App nodes are **stateless** — all shared state lives in Postgres (durable) and
  Redis (ephemeral/coordination), so you can run N replicas behind Nginx.
- WebSocket fan-out is decoupled via Redis pub/sub (above); sticky sessions are
  *not* required for correctness, though they reduce reconnect churn.
- Background alert evaluation should run as a **single leader** (or partitioned
  by symbol) to avoid duplicate notifications — coordinate with a Redis lock.
- Migrations run once per deploy (`prisma migrate deploy`) before rolling nodes.

## Key directories

| Path             | Responsibility                                       |
| ---------------- | ---------------------------------------------------- |
| `app/`           | App Router pages, layouts, and `app/api/**` routes   |
| `lib/engines/`   | Pure analytics engines (the 14 modules)              |
| `lib/quant.ts`   | Shared quantitative/statistical helpers              |
| `lib/notify/`    | Notification channels + `dispatch` facade            |
| `lib/alerts/`    | Alert rule predicates + orchestration engine         |
| `lib/logger.ts`  | Pino structured logging (`childLogger(name)`)        |
| `services/`      | External data-source adapters                        |
| `types/`         | Shared domain types                                  |
| `prisma/`        | Database schema + migrations                         |
| `__tests__/`     | Jest unit tests                                      |
| `docs/`          | This documentation                                   |
```
