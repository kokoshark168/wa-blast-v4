# AlphaFlow Terminal — Data Sources

The platform integrates 10 external data sources, each implemented as an adapter
in `services/*` extending `BaseDataSource`. Every adapter exposes
`isConfigured()` and a uniform `health()` check, and degrades gracefully: a
missing credential disables only that one source, not the whole app.

| # | Source | Adapter | Keyed? | Env var(s) |
| - | ------ | ------- | ------ | ---------- |
| 1 | Binance | `services/binance.ts` | Optional | `BINANCE_API_KEY`, `BINANCE_API_SECRET` |
| 2 | Bybit | `services/bybit.ts` | Optional | `BYBIT_API_KEY`, `BYBIT_API_SECRET` |
| 3 | Hyperliquid | `services/hyperliquid.ts` | Mostly keyless | `HYPERLIQUID_API_KEY` |
| 4 | CoinGecko | `services/coingecko.ts` | Optional | `COINGECKO_API_KEY` |
| 5 | DeFiLlama | `services/defillama.ts` | Free | `DEFI_LLAMA_API_URL` |
| 6 | Ethereum RPC | `services/ethereum.ts` | Keyed (provider) | `ETHEREUM_RPC_URL` |
| 7 | Solana RPC | `services/solana.ts` | Free/keyed | `SOLANA_RPC_URL` |
| 8 | Twitter / X | `services/social/twitter.ts` | Keyed | `TWITTER_BEARER_TOKEN`, `TWITTER_API_KEY`, `TWITTER_API_SECRET` |
| 9 | Reddit | `services/social/reddit.ts` | Keyed | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` |
| 10 | Telegram | `services/social/telegram.ts` | Keyed | `TELEGRAM_BOT_TOKEN` |

---

## 1. Binance

- **Data:** Spot/perp prices, funding rates, open interest, volume.
- **Feeds:** Open Interest / squeeze, Alpha Score (funding, volume), Backtesting.
- **Free vs keyed:** Public market endpoints are keyless; keys raise weight
  limits and unlock account-scoped data.
- **Rate limits:** Weight-based (~1200 req-weight/min/IP). Respect `X-MBX-USED-WEIGHT`.
- **Degradation:** On 429/ban, back off and serve cached OI/funding; squeeze
  detection falls back to the last good snapshot window.

## 2. Bybit

- **Data:** Perp prices, funding, OI, long/short ratio.
- **Feeds:** Open Interest / squeeze, Alpha Score.
- **Free vs keyed:** Public data keyless; keys for private/account data.
- **Rate limits:** Per-endpoint IP limits (commonly ~120 req/s burst windows).
- **Degradation:** Cross-check Binance when Bybit is unavailable; cache LSR.

## 3. Hyperliquid

- **Data:** On-chain perp positions, clearinghouse state, mark/liq prices, funding.
- **Feeds:** Hyperliquid Positions, Liquidation Heatmap (notional/leverage inputs).
- **Free vs keyed:** Public info API is keyless; `HYPERLIQUID_API_KEY` reserved
  for elevated/authenticated use.
- **Rate limits:** IP-based on the info endpoint; batch where possible.
- **Degradation:** Skip the live positions panel; heatmap can still run from
  cached positions.

## 4. CoinGecko

- **Data:** Token metadata, market cap, price, volume, liquidity.
- **Feeds:** Token Discovery, Screener, Portfolio valuation.
- **Free vs keyed:** Free Demo tier works; `COINGECKO_API_KEY` (Pro) lifts limits.
- **Rate limits:** Free ~10–30 calls/min; Pro much higher.
- **Degradation:** Heavy caching of metadata; on throttle, reuse last-known
  market data and mark it stale.

## 5. DeFiLlama

- **Data:** TVL, protocol/chain liquidity, stablecoin flows, yields.
- **Feeds:** On-chain Intelligence (stable in/out-flow), Token Discovery (liquidity).
- **Free vs keyed:** Fully free, **no key** — base URL via `DEFI_LLAMA_API_URL`.
- **Rate limits:** Generous but unauthenticated; be polite (cache, avoid bursts).
- **Degradation:** Cache TVL/flows; on outage, on-chain impact uses last reading.

## 6. Ethereum RPC

- **Data:** Blocks, logs, ERC-20 transfers, balances — raw on-chain reads.
- **Feeds:** Whale Intelligence, On-chain Intelligence, Smart Money.
- **Free vs keyed:** Needs a provider URL (Alchemy/Infura/QuickNode) — keyed via
  the URL itself.
- **Rate limits:** Provider compute-unit/req limits per plan.
- **Degradation:** Fall back to a secondary RPC; reduce log-scan ranges and
  lengthen poll intervals under pressure.

## 7. Solana RPC

- **Data:** Accounts, transactions, SPL token transfers/balances.
- **Feeds:** Whale Intelligence (Solana), Token Discovery, On-chain (Solana).
- **Free vs keyed:** Public mainnet RPC is free but rate-limited; a keyed
  provider URL is recommended for production.
- **Rate limits:** Public endpoint is strict (per-method/per-IP).
- **Degradation:** Swap to a paid RPC URL; back off and serve cached transfers.

## 8. Twitter / X

- **Data:** Mentions, engagement, sentiment-classified posts by keyword.
- **Feeds:** Social Sentiment, Token Discovery (social growth).
- **Free vs keyed:** Requires `TWITTER_BEARER_TOKEN` (+ app key/secret).
- **Rate limits:** Tight per-endpoint windows (e.g. recent-search caps per 15 min).
- **Degradation:** If unconfigured/throttled, sentiment aggregates from Reddit +
  Telegram only; the `platform: 'aggregate'` signal still computes.

## 9. Reddit

- **Data:** Subreddit posts/comments, mention counts, sentiment.
- **Feeds:** Social Sentiment, emerging-trend detection.
- **Free vs keyed:** OAuth app credentials required (`REDDIT_CLIENT_ID`,
  `REDDIT_CLIENT_SECRET`, descriptive `REDDIT_USER_AGENT`).
- **Rate limits:** ~60 req/min per OAuth client.
- **Degradation:** Drop the Reddit slice from the aggregate; cache recent threads.

## 10. Telegram

- **Data:** Channel/chat messages via Bot API `getUpdates` (ingestion) **and**
  outbound notifications via `sendMessage`.
- **Feeds:** Social Sentiment (ingest), Alerts / Notifications (delivery).
- **Free vs keyed:** Requires `TELEGRAM_BOT_TOKEN`; notifications also need a
  target chat (`TELEGRAM_CHAT_ID` or a per-alert chat id).
- **Rate limits:** ~30 msg/s overall, ~1 msg/s per chat (Bot API).
- **Degradation:** Without a token the service is unconfigured — `getUpdates`
  returns `[]` and the notify `TelegramChannel.send()` returns `false` instead
  of throwing; other channels (Discord/e-mail) still deliver.

---

## Health & graceful degradation contract

- `dataSourceHealth()` (in `services/index.ts`) runs every adapter's `health()`
  in parallel, reporting `{ name, configured, reachable, ... }`. Surfaced at
  `GET /api/admin/health`.
- Engines are **pure** and never call sources directly, so a degraded source
  only thins the inputs passed in — analytics still run on whatever data is
  available, and cached results bridge transient outages.
- Notification channels mirror this: each `isConfigured()`-gates its own env and
  `send()` resolves `false` (never throws) on any failure, so a dispatch
  fan-out across channels is always safe.
```
