// Alpha Council: Integration Tests

const { DebateOrchestrator } = require('../engine/debateOrchestrator');
const { DebateService } = require('../engine/debateService');
const { AGENTS } = require('../engine/agents');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Test database setup
const testDbPath = path.join(__dirname, '../data/test-alphacouncil.db');

function setupTestDb() {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new Database(testDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Load schema
  const schema = fs.readFileSync(
    path.join(__dirname, '../db/alpha-council-schema.sql'),
    'utf8'
  );

  const statements = schema.split(';').filter(s => s.trim());
  statements.forEach(stmt => {
    try {
      db.exec(stmt);
    } catch (err) {
      // Table may already exist
    }
  });

  return db;
}

describe('Alpha Council - Debate System', () => {
  let db;
  let debateService;

  beforeAll(() => {
    db = setupTestDb();
    debateService = new DebateService(db);
  });

  afterAll(() => {
    if (db) db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Database Schema', () => {
    test('All required tables should exist', () => {
      const tables = [
        'agents',
        'agent_reputation',
        'debates',
        'debate_rounds',
        'agent_reports',
        'agent_votes',
        'recommendations'
      ];

      tables.forEach(table => {
        const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`);
        const result = stmt.get(table);
        expect(result).toBeDefined();
      });
    });
  });

  describe('Agent Management', () => {
    test('Should upsert all 14 agents', () => {
      debateService.upsertAgents(AGENTS);
      const agents = debateService.getAgents();
      expect(agents.length).toBe(14);
    });

    test('Should retrieve agents by type', () => {
      const agents = debateService.getAgents();
      const bullAgent = agents.find(a => a.type === 'Bull');
      const bearAgent = agents.find(a => a.type === 'Bear');

      expect(bullAgent).toBeDefined();
      expect(bullAgent.type).toBe('Bull');
      expect(bearAgent).toBeDefined();
      expect(bearAgent.type).toBe('Bear');
    });

    test('Should have unique agent names', () => {
      const agents = debateService.getAgents();
      const names = agents.map(a => a.name);
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(agents.length);
    });
  });

  describe('Debate Lifecycle', () => {
    let debateId;

    test('Should create a debate', () => {
      const briefing = {
        ticker: 'AAPL',
        company_name: 'Apple Inc.',
        current_price: 180.00,
        market_cap: '2.8T',
        sector: 'Technology'
      };

      debateId = debateService.createDebate('AAPL', 'Apple Inc.', briefing);
      expect(debateId).toBeGreaterThan(0);
    });

    test('Should retrieve debate', () => {
      const debate = debateService.getDebate(debateId);
      expect(debate).toBeDefined();
      expect(debate.ticker).toBe('AAPL');
      expect(debate.status).toBe('draft');
    });

    test('Should update debate status', () => {
      debateService.updateDebateStatus(debateId, 'initialized');
      const debate = debateService.getDebate(debateId);
      expect(debate.status).toBe('initialized');
    });

    test('Should start round', () => {
      debateService.startRound(debateId, 1, 'reports');
      const rounds = db.prepare(
        'SELECT * FROM debate_rounds WHERE debate_id = ? AND round_num = ?'
      ).get(debateId, 1);

      expect(rounds).toBeDefined();
      expect(rounds.status).toBe('active');
    });

    test('Should complete round', () => {
      debateService.completeRound(debateId, 1);
      const round = db.prepare(
        'SELECT * FROM debate_rounds WHERE debate_id = ? AND round_num = ?'
      ).get(debateId, 1);

      expect(round.status).toBe('completed');
    });
  });

  describe('Agent Reports', () => {
    let debateId;

    beforeAll(() => {
      debateId = debateService.createDebate('MSFT', 'Microsoft', {});
    });

    test('Should save agent report', () => {
      const report = {
        agent_id: 1,
        round: 1,
        report_type: 'initial',
        reasoning: 'Strong fundamentals with good growth prospects',
        confidence_score: 0.85,
        conviction_score: 7,
        key_findings: ['Revenue growth 10%', 'Margins expanding'],
        evidence_needed: ['Q3 earnings guidance']
      };

      debateService.saveAgentReport(debateId, report);

      const reports = debateService.getDebateReports(debateId, 1);
      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0].reasoning).toBe(report.reasoning);
    });

    test('Should fetch reports by round', () => {
      const report = {
        agent_id: 2,
        round: 2,
        report_type: 'challenge_response',
        reasoning: 'Disagree with growth assumptions',
        confidence_score: 0.75,
        conviction_score: 4
      };

      debateService.saveAgentReport(debateId, report);

      const round1Reports = debateService.getDebateReports(debateId, 1);
      const round2Reports = debateService.getDebateReports(debateId, 2);

      expect(round1Reports.length).toBe(1);
      expect(round2Reports.length).toBe(1);
    });
  });

  describe('Voting', () => {
    let debateId;

    beforeAll(() => {
      debateId = debateService.createDebate('TSLA', 'Tesla', {});
    });

    test('Should save agent votes', () => {
      const votes = [
        {
          agent_id: 1,
          vote_type: 'BUY',
          conviction_score: 8,
          confidence_score: 0.9,
          reasoning: 'Strong upside catalysts'
        },
        {
          agent_id: 2,
          vote_type: 'SELL',
          conviction_score: 7,
          confidence_score: 0.85,
          reasoning: 'Valuation stretched'
        },
        {
          agent_id: 3,
          vote_type: 'HOLD',
          conviction_score: 5,
          confidence_score: 0.7,
          reasoning: 'Balanced risk/reward'
        }
      ];

      votes.forEach(vote => debateService.saveVote(debateId, vote));

      const savedVotes = debateService.getDebateVotes(debateId);
      expect(savedVotes.length).toBe(3);
    });

    test('Should count votes by type', () => {
      const votes = debateService.getDebateVotes(debateId);
      const counts = { BUY: 0, HOLD: 0, SELL: 0 };

      votes.forEach(v => counts[v.vote_type]++);

      expect(counts.BUY).toBe(1);
      expect(counts.SELL).toBe(1);
      expect(counts.HOLD).toBe(1);
    });
  });

  describe('Recommendations', () => {
    let debateId;

    beforeAll(() => {
      debateId = debateService.createDebate('GOOG', 'Google', {});
    });

    test('Should save recommendation', () => {
      const recommendation = {
        final_rating: 'BUY',
        conviction_score: 7.5,
        confidence_score: 0.82,
        vote_details: [
          { agent_id: 1, vote_type: 'BUY', conviction_score: 8, confidence_score: 0.9 },
          { agent_id: 2, vote_type: 'BUY', conviction_score: 7, confidence_score: 0.75 }
        ]
      };

      debateService.saveRecommendation(debateId, recommendation);

      const saved = debateService.getRecommendation(debateId);
      expect(saved).toBeDefined();
      expect(saved.final_rating).toBe('BUY');
      expect(saved.conviction_score).toBe(7.5);
    });

    test('Should retrieve voting breakdown', () => {
      const breakdown = debateService.getVotingBreakdown(debateId);
      expect(breakdown.length).toBe(2);
      expect(breakdown[0].vote_type).toBe('BUY');
    });
  });

  describe('Cost Tracking', () => {
    let debateId;

    beforeAll(() => {
      debateId = debateService.createDebate('META', 'Meta', {});
    });

    test('Should track debate costs', () => {
      const cost = {
        api_cost: 2.45,
        compute_cost: 0.50,
        input_tokens: 45000,
        output_tokens: 12000
      };

      debateService.saveCost(debateId, cost);

      const saved = debateService.getCost(debateId);
      expect(saved).toBeDefined();
      expect(saved.input_tokens).toBe(45000);
      expect(saved.output_tokens).toBe(12000);
    });
  });

  describe('Debate Orchestrator', () => {
    test('Should initialize orchestrator', () => {
      const debateId = debateService.createDebate('AMZN', 'Amazon', {});
      const agents = debateService.getAgents();

      const orchestrator = new DebateOrchestrator(
        debateId,
        agents,
        null,
        debateService
      );

      expect(orchestrator.debateId).toBe(debateId);
      expect(orchestrator.state).toBe('draft');
    });

    test('Should mock agent responses', () => {
      const agent = { name: 'Bull_Analyst', id: 1 };
      const debateId = 1;
      const agents = [agent];

      const orchestrator = new DebateOrchestrator(debateId, agents, null, debateService);

      const response = orchestrator.mockAgentResponse(agent, 'Test prompt');
      const parsed = JSON.parse(response);

      expect(parsed.reasoning).toBeDefined();
      expect(parsed.vote_type).toBeDefined();
      expect(['BUY', 'HOLD', 'SELL']).toContain(parsed.vote_type);
    });
  });

  describe('Data Integrity', () => {
    test('Foreign keys should be enforced', () => {
      const debateId = debateService.createDebate('TEST', 'Test', {});

      // Try to insert report with invalid agent_id (should fail with foreign key constraint)
      const stmt = db.prepare(`
        INSERT INTO agent_reports
        (debate_id, agent_id, round_num, report_type, reasoning)
        VALUES (?, ?, ?, ?, ?)
      `);

      expect(() => {
        stmt.run(debateId, 99999, 1, 'initial', 'test');
      }).toThrow();
    });

    test('Debate deletion should cascade', () => {
      const debateId = debateService.createDebate('CASCA', 'Cascade Test', {});

      const report = {
        agent_id: 1,
        round: 1,
        report_type: 'initial',
        reasoning: 'Test cascade'
      };

      debateService.saveAgentReport(debateId, report);

      // Verify report exists
      let reports = debateService.getDebateReports(debateId);
      expect(reports.length).toBeGreaterThan(0);

      // Delete debate
      const deleteStmt = db.prepare('DELETE FROM debates WHERE id = ?');
      deleteStmt.run(debateId);

      // Verify reports are deleted
      reports = debateService.getDebateReports(debateId);
      expect(reports.length).toBe(0);
    });
  });
});

// ==================== Helper Test Data ====================

module.exports = {
  setupTestDb,
  testDbPath
};
