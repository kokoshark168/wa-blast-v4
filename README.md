# AlphaFlow Terminal

Production-grade institutional crypto intelligence platform for discovering market-moving information before the majority of participants react.

## Stack

- **Frontend:** Next.js 15, TypeScript, React, Tailwind CSS, Shadcn UI
- **Backend:** Next.js API Routes, Node.js
- **Database:** PostgreSQL with Prisma ORM
- **Real-time:** Redis, WebSocket
- **Deployment:** Docker, Docker Compose
- **Auth:** JWT, bcryptjs

## Features

### 14 Core Modules

1. **Smart Money Tracker** - Track top-performing wallets with ROI, win rate, and performance metrics
2. **Whale Intelligence** - Detect transactions above $100k-$10M, classify movements, generate alerts
3. **Hyperliquid Whale Monitor** - Track long/short positions, leverage, liquidation prices
4. **Open Interest Intelligence** - Monitor OI/funding rate, detect squeeze setups
5. **Liquidation Heatmap** - Visual heatmap of liquidity zones, updated every minute
6. **Token Discovery Engine** - Scan tokens and score by volume/wallet/smart money growth
7. **Social Sentiment Engine** - Monitor Twitter/Reddit/Telegram, sentiment analysis
8. **On-chain Intelligence** - Track wallet creation, transfers, exchange reserves
9. **AI Research Assistant** - Hourly/daily/weekly reports with LLM analysis
10. **Alpha Scoring System** - Proprietary 0-100 score combining multiple signals
11. **Backtesting Engine** - Backtest signals, calculate Sharpe/Sortino ratios
12. **Alert Center** - Telegram/Discord/Email alerts for market events
13. **Portfolio Tracker** - Track holdings, PnL, risk exposure, rebalancing
14. **Screener** - Filter by market cap, liquidity, volume, alpha score

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Development Setup

```bash
# Clone the repository
git clone <repo-url>
cd alphaflow-terminal

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Start services (Docker)
docker-compose up -d

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

The application will be available at `http://localhost:3000`

### Docker Deployment

```bash
# Build and start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```
DATABASE_URL=postgresql://user:password@localhost:5432/alphaflow
REDIS_URL=redis://localhost:6379
# Required in production: at least 32 chars (e.g. `openssl rand -base64 48`)
JWT_SECRET=<generate-a-strong-32+-char-secret>
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Wallets
- `GET /api/wallets` - List user wallets
- `POST /api/wallets` - Add new wallet
- `GET /api/wallets/:id` - Get wallet details
- `DELETE /api/wallets/:id` - Remove wallet

### Alerts
- `GET /api/alerts` - List user alerts
- `POST /api/alerts` - Create alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert

### Transactions
- `GET /api/transactions` - List transactions
- `POST /api/transactions/analyze` - Analyze whale transactions

## Database Schema

Key tables:
- `User` - User accounts and authentication
- `Wallet` - Tracked wallets with metrics
- `Holding` - Current token holdings
- `Transaction` - On-chain transactions
- `Alert` - User alerts and triggers
- `Portfolio` - User portfolios
- `AuditLog` - All user actions
- `BacktestRun` - Strategy backtest results

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## Architecture

```
alphaflow-terminal/
├── app/                  # Next.js app directory
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   ├── globals.css       # Global styles
│   └── providers.tsx     # Client providers
├── pages/api/            # API routes
│   ├── auth/             # Authentication
│   ├── wallets/          # Wallet management
│   ├── alerts/           # Alert management
│   └── transactions/     # Transaction data
├── components/           # React components
│   ├── dashboard/        # Dashboard components
│   ├── modules/          # Feature modules
│   └── ui/               # UI components
├── lib/                  # Utilities
│   ├── auth/             # Auth helpers
│   └── prisma.ts         # Prisma client
├── hooks/                # React hooks
├── services/             # External API services
├── types/                # TypeScript types
├── prisma/               # Database schema
├── Dockerfile            # Docker image
├── docker-compose.yml    # Local dev environment
└── tailwind.config.ts    # Tailwind configuration
```

## Data Sources

- Binance API
- Bybit API
- Hyperliquid API
- CoinGecko API
- DefiLlama API
- Ethereum RPC
- Solana RPC
- Twitter/X API
- Reddit API
- Telegram API

## Enterprise Features

- ✅ Multi-user support with role-based access
- ✅ JWT authentication with secure password hashing
- ✅ Comprehensive audit logging
- ✅ Subscription tier system
- ✅ Admin dashboard
- ✅ Real-time WebSocket updates
- ✅ Microservice-ready architecture
- ✅ Full test coverage
- ✅ Docker deployment
- ✅ Production-ready code

## Security

- Passwords are hashed with bcryptjs (12 rounds)
- JWT tokens with configurable expiry
- CORS and security headers configured
- SQL injection protection via Prisma
- Environment variable isolation
- Audit logging for all sensitive actions

## Performance

- Redis caching for frequently accessed data
- Database query optimization with indexes
- Connection pooling via Prisma
- WebSocket for real-time updates
- Nginx reverse proxy with gzip compression

## Contributing

1. Create a feature branch
2. Make your changes
3. Add tests for new features
4. Submit a pull request

## License

Proprietary - AlphaFlow Terminal

## Support

For issues and support, contact: support@alphaflow.io
