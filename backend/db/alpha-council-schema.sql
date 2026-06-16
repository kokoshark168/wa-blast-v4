-- Alpha Council: Multi-Agent Investment Research System
-- PostgreSQL Schema (can also run on SQLite with minor adjustments)

-- ==================== AGENTS & REPUTATION ====================

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  expertise_areas TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'claude-opus-4',
  avatar_emoji TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS agent_reputation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  accuracy_score REAL DEFAULT 0.5,
  conviction_calibration REAL DEFAULT 0.5,
  debate_wins INTEGER DEFAULT 0,
  total_debates INTEGER DEFAULT 0,
  avg_confidence REAL DEFAULT 0.5,
  last_updated DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_memory_long (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  memory_key TEXT NOT NULL,
  memory_value TEXT NOT NULL,
  embedding TEXT,
  ttl_days INTEGER DEFAULT 90,
  last_accessed DATETIME DEFAULT (datetime('now', 'localtime')),
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, memory_key)
);

CREATE TABLE IF NOT EXISTS agent_memory_short (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  context_window TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- ==================== DEBATES ====================

CREATE TABLE IF NOT EXISTS debates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  company_name TEXT,
  debate_type TEXT DEFAULT 'stock' CHECK(debate_type IN ('stock', 'sector', 'macro', 'portfolio')),
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'initialized', 'round1', 'round2', 'round3', 'round4', 'round5', 'completed', 'aborted')),
  current_round INTEGER DEFAULT 0,
  research_brief TEXT,
  human_override BOOLEAN DEFAULT 0,
  override_reason TEXT,
  override_by_user_id TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  started_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS debate_rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  round_num INTEGER NOT NULL,
  round_type TEXT CHECK(round_type IN ('reports', 'cross_exam', 'attacks', 'revisions', 'voting')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed', 'timeout')),
  started_at DATETIME,
  completed_at DATETIME,
  timeout_at DATETIME,
  timeout_seconds INTEGER DEFAULT 300,
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  UNIQUE(debate_id, round_num)
);

CREATE TABLE IF NOT EXISTS debate_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  timeout_per_round_sec INTEGER DEFAULT 300,
  voting_method TEXT DEFAULT 'weighted_reputation',
  quorum_threshold REAL DEFAULT 0.75,
  include_devil_advocate BOOLEAN DEFAULT 1,
  max_parallel_agents INTEGER DEFAULT 14,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

-- ==================== AGENT CONTRIBUTIONS ====================

CREATE TABLE IF NOT EXISTS agent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  round_num INTEGER NOT NULL,
  report_type TEXT CHECK(report_type IN ('initial', 'challenge_response', 'revision')),
  reasoning TEXT NOT NULL,
  key_findings TEXT,
  confidence_score REAL,
  conviction_score REAL,
  evidence_cited TEXT,
  assumptions TEXT,
  reasoning_chain TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  vote_type TEXT NOT NULL CHECK(vote_type IN ('BUY', 'HOLD', 'SELL')),
  conviction_score INTEGER,
  confidence_score REAL,
  reasoning TEXT,
  vote_weight REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  challenger_id INTEGER NOT NULL,
  target_agent_id INTEGER NOT NULL,
  round_num INTEGER NOT NULL,
  claim_text TEXT NOT NULL,
  rebuttal TEXT,
  rebuttal_evidence TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'conceded')),
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  resolved_at DATETIME,
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (challenger_id) REFERENCES agents(id),
  FOREIGN KEY (target_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS agent_revisions (
  debate_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  round_num INTEGER NOT NULL,
  revision_type TEXT,
  changes_made TEXT,
  reason TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  PRIMARY KEY (debate_id, agent_id, round_num)
);

-- ==================== EVIDENCE & SOURCES ====================

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  source_type TEXT CHECK(source_type IN ('news', 'earnings', 'financial_statement', 'analyst_report', 'social_media', 'technical', 'macro_data')),
  headline TEXT NOT NULL,
  url TEXT,
  source_name TEXT,
  published_at DATETIME,
  content_snippet TEXT,
  credibility_score REAL DEFAULT 0.5,
  is_verified BOOLEAN DEFAULT 0,
  verification_status TEXT DEFAULT 'unverified',
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence_citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  evidence_id INTEGER NOT NULL,
  relevance_score REAL DEFAULT 0.5,
  interpretation TEXT,
  support_type TEXT CHECK(support_type IN ('supports', 'contradicts', 'neutral')),
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (report_id) REFERENCES agent_reports(id) ON DELETE CASCADE,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS source_verification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id INTEGER NOT NULL,
  verification_status TEXT DEFAULT 'pending',
  fact_check_result TEXT,
  flag_reason TEXT,
  verified_by TEXT,
  verified_at DATETIME,
  credibility_score REAL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id) ON DELETE CASCADE
);

-- ==================== OUTPUTS & RECOMMENDATIONS ====================

CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL UNIQUE,
  final_rating TEXT CHECK(final_rating IN ('BUY', 'HOLD', 'SELL')),
  conviction_score REAL,
  confidence_score REAL,
  bull_case TEXT,
  bear_case TEXT,
  key_risks TEXT,
  fair_value REAL,
  fair_value_low REAL,
  fair_value_high REAL,
  current_price REAL,
  upside_downside REAL,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS allocation_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL,
  asset_class TEXT,
  allocation_pct REAL,
  rationale TEXT,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS risk_factors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL,
  risk_type TEXT,
  severity_score REAL,
  description TEXT,
  mitigation_strategy TEXT,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voting_breakdown (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recommendation_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  vote_type TEXT,
  confidence REAL,
  reasoning_summary TEXT,
  conviction_score INTEGER,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- ==================== AUDIT & COST ====================

CREATE TABLE IF NOT EXISTS debate_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  api_cost REAL DEFAULT 0,
  compute_cost REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_breakdown TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS debate_transcript (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  debate_id INTEGER NOT NULL,
  speaker_id TEXT NOT NULL,
  speaker_type TEXT CHECK(speaker_type IN ('agent', 'system', 'human')),
  message_type TEXT CHECK(message_type IN ('report', 'challenge', 'rebuttal', 'vote', 'system')),
  content TEXT NOT NULL,
  round_num INTEGER,
  timestamp DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  user_id TEXT,
  resource_type TEXT,
  resource_id INTEGER,
  changes TEXT,
  timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- ==================== CONFIGURATION ====================

CREATE TABLE IF NOT EXISTS agent_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  param_key TEXT NOT NULL,
  param_value TEXT,
  updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
  UNIQUE(agent_id, param_key)
);

CREATE TABLE IF NOT EXISTS debate_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  agent_list TEXT,
  round_sequence TEXT,
  voting_rules TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
);

-- ==================== INDICES ====================

CREATE INDEX IF NOT EXISTS idx_debates_ticker_status ON debates(ticker, status);
CREATE INDEX IF NOT EXISTS idx_debates_created ON debates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reports_debate_agent ON agent_reports(debate_id, agent_id, round_num);
CREATE INDEX IF NOT EXISTS idx_agent_votes_debate ON agent_votes(debate_id);
CREATE INDEX IF NOT EXISTS idx_evidence_debate ON evidence(debate_id);
CREATE INDEX IF NOT EXISTS idx_transcript_debate ON debate_transcript(debate_id, round_num);
CREATE INDEX IF NOT EXISTS idx_agent_reputation_agent ON agent_reputation(agent_id);
CREATE INDEX IF NOT EXISTS idx_challenges_debate ON agent_challenges(debate_id, round_num);
