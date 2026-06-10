# AlphaFlow Terminal — Deployment

The platform ships as a Docker Compose stack: the Next.js app, Postgres, Redis,
and an Nginx reverse proxy. This guide covers local bring-up, environment
configuration, database migrations, TLS, and scaling.

## 1. Quick start (Docker Compose)

```bash
cp .env.example .env          # then fill in secrets / API keys
docker compose build
docker compose up -d          # postgres, redis, app, nginx
docker compose logs -f app
```

Services (from `docker-compose.yml`):

| Service    | Image              | Port(s)      | Notes                                  |
| ---------- | ------------------ | ------------ | -------------------------------------- |
| `postgres` | `postgres:16-alpine` | `5432`     | volume `postgres_data`, healthchecked  |
| `redis`    | `redis:7-alpine`   | `6379`       | AOF persistence, volume `redis_data`   |
| `app`      | built from `Dockerfile` | `3000`  | Next.js; depends on healthy pg + redis |
| `nginx`    | `nginx:alpine`     | `80`, `443`  | reverse proxy (`./nginx.conf`)         |

The app container waits for Postgres/Redis healthchecks before starting.

## 2. Environment variables

| Variable | Required | Default | Purpose |
| -------- | :------: | ------- | ------- |
| `DATABASE_URL` | ✅ | `postgresql://alphaflow:alphaflow123@postgres:5432/alphaflow` | Postgres DSN (Prisma) |
| `REDIS_URL` | ✅ | `redis://redis:6379` | Cache + pub/sub |
| `JWT_SECRET` | ✅ | — | Token signing secret, **min 32 chars — app refuses to boot in production without it** |
| `JWT_EXPIRY` | — | `7d` | Access-token lifetime |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | — | — | Binance market data |
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | — | — | Bybit market data |
| `HYPERLIQUID_API_KEY` | — | — | Hyperliquid (public works keyless) |
| `COINGECKO_API_KEY` | — | — | Higher CoinGecko rate limits |
| `DEFI_LLAMA_API_URL` | — | `https://api.llama.fi` | DeFiLlama base URL (keyless) |
| `ETHEREUM_RPC_URL` | — | Alchemy placeholder | Ethereum JSON-RPC |
| `SOLANA_RPC_URL` | — | `https://api.mainnet-beta.solana.com` | Solana RPC |
| `TWITTER_BEARER_TOKEN` (+ key/secret) | — | — | Twitter/X sentiment |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` / `REDDIT_USER_AGENT` | — | — | Reddit sentiment |
| `TELEGRAM_BOT_TOKEN` | — | — | Telegram ingestion **and** notifications |
| `TELEGRAM_CHAT_ID` | — | — | Default notification chat |
| `DISCORD_WEBHOOK_URL` | — | — | Discord notifications |
| `SMTP_HOST` | — | `smtp.gmail.com` | E-mail transport host |
| `SMTP_PORT` | — | `587` | SMTP port |
| `SMTP_USER` | — | — | SMTP username (gates e-mail `isConfigured`) |
| `SMTP_PASS` | — | — | SMTP password |
| `SMTP_FROM` | — | `noreply@alphaflow.io` | From address |
| `SMTP_SECURE` | — | `false` | `true` for implicit TLS (port 465) |
| `SMTP_TO` | — | — | Default recipient |
| `NODE_ENV` | — | `development` | `production` for prod builds |
| `NEXT_PUBLIC_API_URL` | — | `http://localhost:3000` | Client-side API base |
| `NEXT_PUBLIC_WS_URL` | — | `ws://localhost:3000` | Client-side WS base |
| `ENABLE_WHALE_TRACKING` / `ENABLE_SMART_MONEY` / `ENABLE_HYPERLIQUID` / `ENABLE_BACKTESTING` / `ENABLE_ALERTS` | — | `true` | Feature flags |
| `LOG_LEVEL` | — | `info` | Pino log level |

> A missing optional key disables exactly one data source/channel
> (`isConfigured()` returns `false`); the rest of the app keeps running.

## 3. Database (Prisma)

```bash
# Generate the client (also runs in the Docker build).
npx prisma generate

# Development: create + apply a migration.
npx prisma migrate dev --name <change>

# Production: apply committed migrations only (no schema drift).
npx prisma migrate deploy

# Inspect data.
npx prisma studio
```

In containers, run migrations once per release **before** rolling app nodes:

```bash
docker compose run --rm app npx prisma migrate deploy
```

## 4. Production build

The `Dockerfile` is multi-stage: it `npm ci` + `npm run build` in a builder
stage, then copies `.next`, `public`, and `prisma` into a slim runtime image
that installs production deps, runs `prisma generate`, and `npm start`.

For production compose, override the dev settings:
- set `NODE_ENV=production`, remove the `command: npm run dev` override and the
  bind-mount volumes (`.:/app`, `/app/node_modules`) so the built image is used;
- point `NEXT_PUBLIC_*` at your real domain (`https://…`, `wss://…`).

## 5. Nginx + TLS

Nginx terminates TLS and proxies HTTP + WebSocket upgrades to the app:

```nginx
server {
  listen 443 ssl http2;
  server_name app.example.com;
  ssl_certificate     /etc/letsencrypt/live/app.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;

  location / {
    proxy_pass http://app:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;          # WebSocket
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server { listen 80; server_name app.example.com; return 301 https://$host$request_uri; }
```

**Certificates** — either:
- **certbot:** `certbot certonly --webroot -w /var/www/certbot -d app.example.com`
  and mount `/etc/letsencrypt` into the nginx container; auto-renew via cron/timer; or
- **Caddy:** swap nginx for Caddy to get automatic ACME TLS with a one-line
  `app.example.com { reverse_proxy app:3000 }`.

## 6. Production hardening

- **Rotate secrets.** Replace the default `JWT_SECRET` and DB password; load
  secrets from a manager (Docker/K8s secrets, Vault, SSM) — never bake into images.
- **TLS everywhere.** Force HTTPS/WSS; enable HSTS at the proxy.
- **Least privilege.** Don't expose `5432`/`6379` publicly; keep them on the
  internal `alphaflow-net` only.
- **Rate limiting.** Enforce per-IP/per-user limits at Nginx and in-app (Redis
  token buckets).
- **Backups.** Schedule `pg_dump`; snapshot the `postgres_data` volume. Treat
  Redis as ephemeral cache (AOF aids warm restarts).
- **Observability.** Ship Pino JSON logs to a collector; alert on data-source
  `health()` failures and elevated error rates.
- **Migrations gate deploys.** `prisma migrate deploy` must succeed before
  traffic shifts to new nodes.

## 7. Scaling

- **Stateless app nodes.** Run N replicas behind Nginx; all shared state is in
  Postgres + Redis, so no sticky sessions are required for correctness.
- **WebSocket fan-out.** Use Redis pub/sub so a tick computed on one node reaches
  clients on every node.
- **Single-leader alerting.** Run alert evaluation as a leader (Redis lock) or
  partition by symbol to avoid duplicate notifications.
- **Connection pooling.** Front Postgres with PgBouncer when replica count grows.
- **Cache aggressively.** Tune per-endpoint Redis TTLs to shed load from upstream
  data sources and stay within their rate limits.
```
