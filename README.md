# WA Blast Backoffice v4

Multi-number WhatsApp blasting system with breeding, auto-reply, link tracking, and proxy management.

## Features

- 📱 **Multi-Number Management** — Connect 50+ WhatsApp numbers simultaneously
- 🚀 **Bulk Messaging** — Campaign-based blast with scheduling and throttling
- 🐣 **Number Breeding** — Automated warm-up conversations between numbers
- 🤖 **Auto-Reply** — Keyword rules + AI sentiment analysis (OpenAI)
- 🔗 **Link Tracking** — Short links with click analytics
- 🛡️ **Proxy Support** — SOCKS5 proxy per number for Indonesia IP
- 📊 **Dashboard** — Real-time stats, health scores, delivery tracking
- 🔒 **Email OTP Auth** — Secure login with OTP

## Tech Stack

- **Backend:** Node.js + Express + SQLite + Baileys (WhatsApp Web API)
- **Frontend:** React 19 + Vite 7 + TailwindCSS + shadcn/ui
- **Proxy:** SOCKS5 (IPRoyal or any residential proxy)

## Quick Start

### Backend
```bash
cd backend
cp ../.env.example .env  # Edit with your settings
npm install
node server.js
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Production
```bash
# Frontend build
cd frontend && npm run build

# Backend with PM2
pm2 start ecosystem.config.js
```

## Proxy Setup

The system requires SOCKS5 proxies for WhatsApp connections (Indonesia IP recommended).

Add proxies via the admin panel or directly in the database:
- Host: your proxy host
- Port: proxy port
- Type: socks5
- Username/Password: proxy credentials

## Configuration

All settings configurable via Settings page:
- Message delays (global + per-campaign)
- Anti-ban profiles
- Auto-reply rules & AI settings
- Proxy assignment (max numbers per proxy)
- Breeding schedules

## Architecture

```
backend/
  server.js          # Main server (Express + WebSocket)
  engine/
    index.js         # WAEngine — Baileys session manager
    breeding.js      # Breeding worker
    breeding-conversations.js  # Conversation templates (661 lines)
    scheduler.js     # Campaign scheduler
  routes/            # API routes (33 files)
  db/init.js         # SQLite schema
  middleware/        # Auth, API keys
  utils/             # Mailer, helpers

frontend/
  src/
    components/pages/  # 32 pages
    components/ui/     # shadcn components
    lib/api.js         # Axios instance
```

## License

MIT
