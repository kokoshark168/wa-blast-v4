# Alpha Council: Institutional-Grade Multi-Agent Investment Research System

An elite AI committee where 14 specialized agents debate investment opportunities before producing a final recommendation.

## 🎯 System Overview

Alpha Council implements a **supervisor orchestration pattern** with specialized agents covering:

- **CEO Agent** — Coordinates and synthesizes recommendations
- **Bull Analyst** — Identifies bullish catalysts and upside
- **Bear Analyst** — Identifies bearish catalysts and downside risks
- **Financial Analyst** — Deep-dive into financials, cash flow, debt
- **Valuation Analyst** — DCF, multiples, fair value estimation
- **Macro Analyst** — Interest rates, inflation, GDP, currency
- **Sector Specialist** — Industry trends, competition, market share
- **Quant Analyst** — Momentum, volatility, factor exposure
- **Technical Analyst** — Price action, support/resistance, trends
- **News Analyst** — Catalysts, earnings, management changes
- **Sentiment Analyst** — Social media, Reddit, analyst consensus
- **Risk Manager** — Tail risk, black swan events, hedging
- **Devil's Advocate** — Challenges every conclusion
- **Portfolio Manager** — Position sizing, risk allocation

## 🔄 5-Round Debate Process

### Round 1: Independent Reports (5 minutes)
All 14 agents provide independent analysis in parallel.
- **Output**: Initial reasoning, conviction scores (1-10), confidence (0-1)
- **Stored**: Full reports with key findings and evidence needs

### Round 2: Cross-Examination (4+ minutes)
Agents randomly challenge each other's assumptions.
- **Output**: Challenges and rebuttals recorded
- **Scoring**: Track challenge effectiveness (reputation impact)

### Round 3: Attack Weaknesses (3+ minutes)
Devil's Advocate, Risk Manager, and Bear double down on weaknesses.
- **Output**: Systematic attacks on consensus
- **Focus**: Materialization paths for risks

### Round 4: Revisions (2.5 minutes)
Agents can revise conviction scores based on challenges.
- **Output**: Updated positions with delta tracking
- **Audit**: Reason for each revision recorded

### Round 5: Voting (2 minutes)
Final votes: BUY, HOLD, or SELL with conviction scores.
- **Output**: Weighted recommendation (by agent reputation)
- **Breakdown**: Voting breakdown with full reasoning

## 📊 Output Recommendation

```json
{
  "final_rating": "BUY|HOLD|SELL",
  "conviction_score": 7.5,           // 1-10 scale
  "confidence_score": 0.82,          // 0-1 scale
  "bull_case": "...",
  "bear_case": "...",
  "key_risks": ["Risk 1", "Risk 2", "Risk 3"],
  "fair_value": 95.00,
  "fair_value_range": { "low": 85, "high": 105 },
  "suggested_allocation": "3-5% of portfolio",
  "voting_breakdown": {
    "BUY": 6,
    "HOLD": 5,
    "SELL": 3
  },
  "debate_transcript": [...],
  "cost": {
    "api_tokens": 120000,
    "estimated_cost": "$2.45"
  }
}
```

## 🚀 Quick Start

### Development (SQLite)

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` → Dashboard

### Docker Compose (Production)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop
docker-compose down
```

## 📡 API Endpoints

### Debate Management

```
POST /api/alpha-council/debates
  Create new debate
  Body: { ticker, company_name, briefing }

GET /api/alpha-council/debates
  List all debates (paginated)
  Query: ?limit=50&offset=0

GET /api/alpha-council/debates/:id
  Get debate details + all reports/votes

POST /api/alpha-council/debates/:id/start
  Initialize and run 5-round debate

GET /api/alpha-council/debates/:id/status
  Get current debate status

GET /api/alpha-council/debates/:id/reports
  Get all reports grouped by round

GET /api/alpha-council/debates/:id/votes
  Get voting summary

GET /api/alpha-council/debates/:id/recommendation
  Get final recommendation + breakdown

GET /api/alpha-council/debates/:id/transcript
  Get debate transcript (messages)

GET /api/alpha-council/debates/:id/cost
  Get API cost breakdown

POST /api/alpha-council/debates/:id/override
  Human override recommendation
  Body: { rating: "BUY|HOLD|SELL", reason, user_id }
```

### Agent Management

```
GET /api/alpha-council/agents
  List all 14 agents with reputation scores

GET /api/alpha-council/agents/:name
  Get specific agent profile + history
```

### Health

```
GET /api/alpha-council/health
  Service health check
```

## 💾 Database Schema

### Core Tables

- **debates** — Debate metadata, status, briefing
- **agents** — Agent definitions, expertise areas, prompts
- **agent_reports** — Round 1-4 reports with reasoning
- **agent_votes** — Final votes + conviction scores
- **agent_challenges** — Cross-examination challenges/rebuttals
- **agent_revisions** — Position updates with deltas
- **recommendations** — Final recommendation + breakdown
- **debate_transcript** — Full debate message history
- **debate_costs** — Token usage, API costs
- **evidence** — Sources cited by agents
- **agent_reputation** — Accuracy, conviction calibration, win rate

### Indices

Fast queries on:
- `debates(ticker, status, created_at)`
- `agent_reports(debate_id, agent_id, round_num)`
- `agent_votes(debate_id)`
- `debate_transcript(debate_id, round_num)`

## 🔧 Configuration

### Environment Variables

```bash
NODE_ENV=production
PORT=3001
REDIS_URL=redis://localhost:6379
DB_PATH=./data/alphacouncil.db
ANTHROPIC_API_KEY=sk-ant-...  # For real Claude API calls
LOG_LEVEL=info
```

### Debate Settings

```javascript
{
  timeout_per_round_sec: 300,       // 5 minutes per round
  voting_method: "weighted_reputation",
  quorum_threshold: 0.75,           // 75% agent participation
  include_devil_advocate: true,
  max_parallel_agents: 14
}
```

## 🧪 Testing

```bash
# Run Alpha Council tests
npm run test:alpha-council

# Watch mode
npm run test:watch

# All tests
npm run test
```

Tests cover:
- Database schema integrity
- Agent management (upsert, retrieve)
- Debate lifecycle (create, update, complete)
- Report storage and retrieval
- Voting aggregation
- Orchestrator mock responses
- Foreign key constraints
- Cascade deletes

## 📈 Agent Reputation System

Agents earn reputation through:
- **Accuracy Score** — How often their conviction correctly predicted direction
- **Conviction Calibration** — Whether they express appropriate confidence
- **Debate Wins** — Challenges won / votes aligned with final rating
- **Total Debates** — Number of debates participated

**Reputation impacts:**
- Vote weight in final recommendation (weighted voting)
- Agent prioritization in next debate
- Confidence in agent recommendations

## 🔐 Security

- **Database**: Foreign key constraints, cascade deletes, audit logging
- **API**: Rate limiting (100 req/min), JWT auth on protected endpoints
- **Debate Integrity**: All changes timestamped, immutable transcript
- **Override Audit**: Human overrides logged with user ID + timestamp

## 📝 Example: Creating a Debate

### Step 1: Create Debate

```bash
curl -X POST http://localhost:3001/api/alpha-council/debates \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "AAPL",
    "company_name": "Apple Inc.",
    "briefing": {
      "current_price": 180.00,
      "market_cap": "2.8T",
      "sector": "Technology",
      "recent_news": "New AI features announced"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "debate_id": 42,
  "status": "draft"
}
```

### Step 2: Start Debate

```bash
curl -X POST http://localhost:3001/api/alpha-council/debates/42/start \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "status": "initialized",
  "message": "Debate started, running 5 rounds..."
}
```

### Step 3: Poll Status

```bash
curl http://localhost:3001/api/alpha-council/debates/42/status
```

**Response (Round 3):**
```json
{
  "status": "round3",
  "current_round": 3,
  "is_active": true
}
```

### Step 4: Get Recommendation (after completion)

```bash
curl http://localhost:3001/api/alpha-council/debates/42/recommendation
```

**Response:**
```json
{
  "recommendation": {
    "final_rating": "BUY",
    "conviction_score": 7.2,
    "confidence_score": 0.78,
    "bull_case": "Strong growth trajectory...",
    "bear_case": "Valuation concerns...",
    "key_risks": ["Competition", "Macro slowdown"]
  },
  "voting_breakdown": [
    { "agent_name": "Bull_Analyst", "vote_type": "BUY", "conviction": 9 },
    { "agent_name": "Bear_Analyst", "vote_type": "SELL", "conviction": 8 },
    ...
  ]
}
```

## 🏗️ Architecture

### Backend Structure

```
backend/
├── db/
│   ├── alpha-council-schema.sql    # Full schema
│   ├── init.js                     # DB initialization
├── engine/
│   ├── agents.js                   # 14 agent definitions
│   ├── debateOrchestrator.js       # 5-round orchestration
│   ├── debateService.js            # Database layer
├── routes/
│   ├── alpha-council.js            # REST API (40+ endpoints)
├── tests/
│   ├── alpha-council.test.js       # Integration tests
└── server.js                        # Express app
```

### Database Architecture

- **SQLite** (development) — Zero config, great for prototyping
- **PostgreSQL** (production) — Ready for scale, pgvector for embeddings
- **Redis** (optional) — Message queue for agent coordination

### API Architecture

- **Synchronous rounds** (Phase 0) — Simple, deterministic, testable
- **Async events** (Phase 1+) — Real-time updates, WebSocket integration
- **Message queue** (Phase 2+) — Inter-agent communication, scaling to 100+ agents

## 📊 Phase Roadmap

### Phase 0: Foundation ✅
- [x] Schema + core tables
- [x] 14 agent definitions
- [x] 5-round orchestration (mock LLM)
- [x] REST API
- [x] Database service layer
- [x] Docker Compose
- [x] Tests

### Phase 1: Multi-Agent (Weeks 3-4)
- [ ] Real Claude API integration
- [ ] Evidence tracking + citations
- [ ] Agent reputation scoring
- [ ] Memory system (semantic search)
- [ ] Message queue (Redis pub/sub)

### Phase 2: Advanced (Weeks 5-6)
- [ ] React UI (debate viewer, agent profiles, voting dashboard)
- [ ] Evidence explorer + source verification
- [ ] Real-time updates (WebSocket)
- [ ] Backtesting engine

### Phase 3: Production (Week 7+)
- [ ] PostgreSQL migration
- [ ] Kubernetes deployment
- [ ] Monitoring (Prometheus, Grafana)
- [ ] Cost tracking + billing
- [ ] Admin dashboard

## 🎨 Frontend Components (Coming in Phase 1)

```
/debates
├─ DebatesListPage
│  ├─ DebatesTable (filterable, sortable)
│  └─ CreateDebateModal

/debates/:id
├─ DebateViewerPage
│  ├─ RoundStatus (progress, time remaining)
│  ├─ AgentReportsPanel (expandable cards)
│  ├─ EvidenceExplorer (sidebar with sources)
│  ├─ VotingDashboard (live vote tally)
│  └─ TranscriptViewer (debate messages)

/debates/:id/recommendation
├─ RecommendationPage
│  ├─ RatingCard (BUY/HOLD/SELL)
│  ├─ BullBearCases (expandable)
│  ├─ RisksPanel
│  └─ VotingBreakdown

/agents
├─ AgentProfilesPage
│  ├─ AgentGrid (all 14 with reputation)
│  └─ AgentDetailModal (history, memory)
```

## 📈 Metrics & Monitoring

Track:
- Debate duration by round
- Agent timeout frequency
- API cost per debate
- Recommendation accuracy (vs actual stock moves)
- Agent reputation trends
- Vote distribution (BUY/HOLD/SELL bias)

## 🔗 Integration Points

- **Anthropic Claude API** — Real agent reasoning
- **Financial Data APIs** — IEX, Yahoo Finance, Polygon
- **Vector DB** — pgvector or Pinecone (Phase 2)
- **WebSocket** — Real-time UI updates

## 🛠️ Troubleshooting

### Debate stuck in "round1"
- Check logs: `docker-compose logs backend`
- Verify Anthropic API key in `.env`
- Increase timeout: `timeout_per_round_sec: 600` (10 min)

### Database locked
- SQLite is single-writer. Kill other processes:
  ```bash
  pkill -f "node server.js"
  rm backend/data/alphacouncil.db-shm  # Remove lock file
  ```

### Tests failing
- Ensure `npm install` completed
- Run: `npm run test:alpha-council -- --verbose`

## 📚 Further Reading

- [5-Round Debate Design](./docs/debate-design.md)
- [Agent System Prompts](./backend/engine/agents.js)
- [API Documentation](./API_DOCS.md)
- [Schema Diagram](./docs/schema.md)

## 📄 License

MIT

---

**Built with:** Node.js, Express, SQLite/PostgreSQL, Claude API, React (coming)

**Status:** Phase 0 Complete → Phase 1 Ready for Implementation
