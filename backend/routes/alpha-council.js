// Alpha Council: REST API Routes

const express = require('express');
const router = express.Router();
const { DebateOrchestrator } = require('../engine/debateOrchestrator');
const { DebateService } = require('../engine/debateService');
const { AGENTS } = require('../engine/agents');

let debateService;
let activeDebates = {}; // Store active debate orchestrators in memory

function initAlphaCounsilRoutes(db) {
  debateService = new DebateService(db);

  // Initialize agents in database
  debateService.upsertAgents(AGENTS);

  // ==================== DEBATES ====================

  // Create new debate
  router.post('/debates', async (req, res) => {
    try {
      const { ticker, company_name, briefing } = req.body;

      if (!ticker || !company_name) {
        return res.status(400).json({
          error: 'Missing required fields: ticker, company_name'
        });
      }

      const debateId = debateService.createDebate(
        ticker,
        company_name,
        briefing || { ticker, company_name }
      );

      res.status(201).json({
        success: true,
        debate_id: debateId,
        status: 'draft',
        message: 'Debate created successfully'
      });
    } catch (err) {
      console.error('Error creating debate:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // List debates
  router.get('/debates', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const debates = debateService.listDebates(limit, offset);

      res.json({
        success: true,
        debates,
        count: debates.length,
        limit,
        offset
      });
    } catch (err) {
      console.error('Error listing debates:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get debate details
  router.get('/debates/:id', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const debate = debateService.getDebate(debateId);

      if (!debate) {
        return res.status(404).json({ error: 'Debate not found' });
      }

      const reports = debateService.getDebateReports(debateId);
      const votes = debateService.getDebateVotes(debateId);
      const recommendation = debateService.getRecommendation(debateId);
      const transcript = debateService.getTranscript(debateId);
      const cost = debateService.getCost(debateId);

      res.json({
        success: true,
        debate,
        reports,
        votes,
        recommendation,
        transcript: transcript.slice(-50), // Last 50 messages
        cost,
        is_active: activeDebates[debateId] ? true : false
      });
    } catch (err) {
      console.error('Error getting debate:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Start debate (initialize and run)
  router.post('/debates/:id/start', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const debate = debateService.getDebate(debateId);

      if (!debate) {
        return res.status(404).json({ error: 'Debate not found' });
      }

      if (activeDebates[debateId]) {
        return res.status(409).json({
          error: 'Debate already running',
          status: debate.status
        });
      }

      // Parse briefing
      const briefing = debate.research_brief ? JSON.parse(debate.research_brief) : { ticker: debate.ticker };

      // Get agents
      const agents = debateService.getAgents();

      // Create orchestrator
      const orchestrator = new DebateOrchestrator(
        debateId,
        agents,
        null, // messageQueue not used in Phase 0
        debateService
      );

      activeDebates[debateId] = orchestrator;

      // Initialize
      await orchestrator.initialize(briefing);

      // Run all 5 rounds sequentially
      const runDebate = async () => {
        try {
          for (let round = 1; round <= 5; round++) {
            console.log(`\nStarting Round ${round}...`);
            const success = await orchestrator.executeRound(round);

            if (!success && round < 5) {
              console.warn(`Round ${round} had issues but continuing...`);
            }
          }

          await orchestrator.complete();

          // Cleanup
          delete activeDebates[debateId];

          console.log(`✅ Debate ${debateId} completed successfully`);
        } catch (err) {
          console.error(`❌ Debate ${debateId} error:`, err);
          debateService.updateDebateStatus(debateId, 'aborted');
          delete activeDebates[debateId];
        }
      };

      // Run in background
      runDebate().catch(err => console.error('Background debate error:', err));

      res.json({
        success: true,
        debate_id: debateId,
        status: 'initialized',
        message: 'Debate started, running 5 rounds...'
      });
    } catch (err) {
      console.error('Error starting debate:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get debate status
  router.get('/debates/:id/status', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const debate = debateService.getDebate(debateId);

      if (!debate) {
        return res.status(404).json({ error: 'Debate not found' });
      }

      const isActive = activeDebates[debateId] ? true : false;

      res.json({
        success: true,
        debate_id: debateId,
        status: debate.status,
        current_round: debate.current_round || 0,
        is_active: isActive,
        completed_at: debate.completed_at,
        created_at: debate.created_at
      });
    } catch (err) {
      console.error('Error getting status:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get debate reports (all rounds)
  router.get('/debates/:id/reports', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const reports = debateService.getDebateReports(debateId);

      const grouped = {};
      reports.forEach(r => {
        if (!grouped[r.round_num]) grouped[r.round_num] = [];
        grouped[r.round_num].push(r);
      });

      res.json({
        success: true,
        debate_id: debateId,
        reports: grouped
      });
    } catch (err) {
      console.error('Error getting reports:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get debate votes
  router.get('/debates/:id/votes', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const votes = debateService.getDebateVotes(debateId);

      const summary = { BUY: 0, HOLD: 0, SELL: 0 };
      votes.forEach(v => {
        summary[v.vote_type]++;
      });

      res.json({
        success: true,
        debate_id: debateId,
        votes,
        summary
      });
    } catch (err) {
      console.error('Error getting votes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get recommendation
  router.get('/debates/:id/recommendation', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const recommendation = debateService.getRecommendation(debateId);

      if (!recommendation) {
        return res.status(404).json({
          error: 'No recommendation yet - debate may still be running'
        });
      }

      const votingBreakdown = debateService.getVotingBreakdown(debateId);

      res.json({
        success: true,
        debate_id: debateId,
        recommendation,
        voting_breakdown: votingBreakdown
      });
    } catch (err) {
      console.error('Error getting recommendation:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get debate transcript
  router.get('/debates/:id/transcript', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const transcript = debateService.getTranscript(debateId);
      const paginated = transcript.slice(offset, offset + limit);

      res.json({
        success: true,
        debate_id: debateId,
        messages: paginated,
        total: transcript.length,
        limit,
        offset
      });
    } catch (err) {
      console.error('Error getting transcript:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Human override
  router.post('/debates/:id/override', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const { rating, reason, user_id } = req.body;

      if (!rating || !reason) {
        return res.status(400).json({
          error: 'Missing required fields: rating, reason'
        });
      }

      if (!['BUY', 'HOLD', 'SELL'].includes(rating)) {
        return res.status(400).json({
          error: 'Rating must be BUY, HOLD, or SELL'
        });
      }

      const debate = debateService.getDebate(debateId);
      if (!debate) {
        return res.status(404).json({ error: 'Debate not found' });
      }

      // Update recommendation with override
      const stmt = debateService.db.prepare(`
        UPDATE recommendations
        SET final_rating = ?, override_reason = ?
        WHERE debate_id = ?
      `);

      stmt.run(rating, reason, debateId);

      // Log in audit
      const auditStmt = debateService.db.prepare(`
        INSERT INTO audit_log (action, user_id, resource_type, resource_id, changes)
        VALUES ('override_recommendation', ?, 'debate', ?, ?)
      `);

      auditStmt.run(user_id || 'system', debateId, JSON.stringify({ from: 'algorithmic', to: rating, reason }));

      res.json({
        success: true,
        debate_id: debateId,
        override_rating: rating,
        override_reason: reason
      });
    } catch (err) {
      console.error('Error applying override:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== AGENTS ====================

  // List all agents
  router.get('/agents', async (req, res) => {
    try {
      const agents = debateService.getAgents();

      res.json({
        success: true,
        agents,
        count: agents.length
      });
    } catch (err) {
      console.error('Error listing agents:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get agent by name
  router.get('/agents/:name', async (req, res) => {
    try {
      const name = req.params.name;
      const agents = debateService.getAgents();
      const agent = agents.find(a => a.name === name);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      res.json({
        success: true,
        agent
      });
    } catch (err) {
      console.error('Error getting agent:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== COSTS ====================

  // Get debate cost
  router.get('/debates/:id/cost', async (req, res) => {
    try {
      const debateId = parseInt(req.params.id);
      const cost = debateService.getCost(debateId);

      res.json({
        success: true,
        debate_id: debateId,
        cost: cost || { api_cost: 0, compute_cost: 0, tokens_used: 0 }
      });
    } catch (err) {
      console.error('Error getting cost:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==================== HEALTH ====================

  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'ok',
      service: 'alpha-council',
      active_debates: Object.keys(activeDebates).length
    });
  });

  return router;
}

module.exports = { initAlphaCounsilRoutes };
