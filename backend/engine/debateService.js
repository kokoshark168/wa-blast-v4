// Alpha Council: Debate Service
// Database access layer for debates, agents, reports, votes, recommendations

class DebateService {
  constructor(db) {
    this.db = db;
    this.initializeSchema();
  }

  initializeSchema() {
    // Load and execute Alpha Council schema
    const fs = require('fs');
    const path = require('path');

    try {
      const schema = fs.readFileSync(
        path.join(__dirname, '../db/alpha-council-schema.sql'),
        'utf8'
      );

      // Execute schema statements
      const statements = schema.split(';').filter(s => s.trim());
      statements.forEach(stmt => {
        try {
          this.db.exec(stmt);
        } catch (err) {
          // Table may already exist
        }
      });

      console.log('✅ Alpha Council schema initialized');
    } catch (err) {
      console.error('⚠️ Schema initialization error:', err.message);
    }
  }

  // ==================== DEBATES ====================

  createDebate(ticker, companyName, briefing) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO debates (ticker, company_name, debate_type, status, research_brief)
        VALUES (?, ?, 'stock', 'draft', ?)
      `);

      const result = stmt.run(ticker, companyName, JSON.stringify(briefing));
      return result.lastInsertRowid;
    } catch (err) {
      console.error('Error creating debate:', err);
      throw err;
    }
  }

  getDebate(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM debates WHERE id = ?
      `);
      return stmt.get(debateId);
    } catch (err) {
      console.error('Error fetching debate:', err);
      throw err;
    }
  }

  listDebates(limit = 50, offset = 0) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM debates
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `);
      return stmt.all(limit, offset);
    } catch (err) {
      console.error('Error listing debates:', err);
      throw err;
    }
  }

  updateDebateStatus(debateId, status) {
    try {
      const stmt = this.db.prepare(`
        UPDATE debates
        SET status = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `);
      stmt.run(status, debateId);
      return true;
    } catch (err) {
      console.error('Error updating debate status:', err);
      throw err;
    }
  }

  saveBriefing(debateId, briefing) {
    try {
      const stmt = this.db.prepare(`
        UPDATE debates
        SET research_brief = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(briefing), debateId);
      return true;
    } catch (err) {
      console.error('Error saving briefing:', err);
      throw err;
    }
  }

  completeDebate(debateId) {
    try {
      const stmt = this.db.prepare(`
        UPDATE debates
        SET status = 'completed', completed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `);
      stmt.run(debateId);
      return true;
    } catch (err) {
      console.error('Error completing debate:', err);
      throw err;
    }
  }

  // ==================== ROUNDS ====================

  startRound(debateId, roundNum, roundType) {
    try {
      const timeoutSeconds = [300, 250, 200, 150, 120][roundNum - 1] || 300;

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO debate_rounds
        (debate_id, round_num, round_type, status, started_at, timeout_at, timeout_seconds)
        VALUES (?, ?, ?, 'active', datetime('now', 'localtime'), datetime('now', '+${timeoutSeconds} seconds'), ?)
      `);

      stmt.run(debateId, roundNum, roundType, timeoutSeconds);

      // Update debate current_round
      const updateStmt = this.db.prepare(`
        UPDATE debates SET current_round = ? WHERE id = ?
      `);
      updateStmt.run(roundNum, debateId);

      return true;
    } catch (err) {
      console.error('Error starting round:', err);
      throw err;
    }
  }

  completeRound(debateId, roundNum) {
    try {
      const stmt = this.db.prepare(`
        UPDATE debate_rounds
        SET status = 'completed', completed_at = datetime('now', 'localtime')
        WHERE debate_id = ? AND round_num = ?
      `);
      stmt.run(debateId, roundNum);
      return true;
    } catch (err) {
      console.error('Error completing round:', err);
      throw err;
    }
  }

  updateRoundStatus(debateId, roundNum, status) {
    try {
      const stmt = this.db.prepare(`
        UPDATE debate_rounds
        SET status = ?, updated_at = datetime('now', 'localtime')
        WHERE debate_id = ? AND round_num = ?
      `);
      stmt.run(status, debateId, roundNum);
      return true;
    } catch (err) {
      console.error('Error updating round status:', err);
      throw err;
    }
  }

  // ==================== AGENT REPORTS ====================

  saveAgentReport(debateId, report) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO agent_reports
        (debate_id, agent_id, round_num, report_type, reasoning, confidence_score, conviction_score, key_findings, evidence_cited)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        debateId,
        report.agent_id,
        report.round,
        report.report_type || 'initial',
        report.reasoning,
        report.confidence_score,
        report.conviction_score,
        JSON.stringify(report.key_findings || []),
        JSON.stringify(report.evidence_needed || [])
      );

      return true;
    } catch (err) {
      console.error('Error saving agent report:', err);
      throw err;
    }
  }

  getDebateReports(debateId, roundNum = null) {
    try {
      let query = `SELECT * FROM agent_reports WHERE debate_id = ?`;
      const params = [debateId];

      if (roundNum) {
        query += ` AND round_num = ?`;
        params.push(roundNum);
      }

      query += ` ORDER BY created_at`;

      const stmt = this.db.prepare(query);
      return stmt.all(...params);
    } catch (err) {
      console.error('Error fetching reports:', err);
      throw err;
    }
  }

  // ==================== AGENT VOTES ====================

  saveVote(debateId, vote) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO agent_votes
        (debate_id, agent_id, vote_type, conviction_score, confidence_score, reasoning)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        debateId,
        vote.agent_id,
        vote.vote_type,
        vote.conviction_score,
        vote.confidence_score,
        vote.reasoning
      );

      return true;
    } catch (err) {
      console.error('Error saving vote:', err);
      throw err;
    }
  }

  getDebateVotes(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM agent_votes WHERE debate_id = ? ORDER BY created_at
      `);
      return stmt.all(debateId);
    } catch (err) {
      console.error('Error fetching votes:', err);
      throw err;
    }
  }

  // ==================== CHALLENGES ====================

  saveChallenge(debateId, challenge) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO agent_challenges
        (debate_id, challenger_id, target_agent_id, round_num, claim_text, status)
        VALUES (?, ?, ?, ?, ?, 'open')
      `);

      // Get agent IDs from names (assuming agents were inserted)
      const challengerId = this.getAgentIdByName(challenge.challenger_name);
      const targetId = this.getAgentIdByName(challenge.target_name);

      stmt.run(
        debateId,
        challengerId,
        targetId,
        challenge.round,
        challenge.questions ? challenge.questions[0] : ''
      );

      return true;
    } catch (err) {
      console.error('Error saving challenge:', err);
      // Non-critical, continue
    }
  }

  // ==================== REVISIONS ====================

  saveRevision(debateId, revision) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_revisions
        (debate_id, agent_id, round_num, revision_type, changes_made, reason)
        VALUES (?, ?, ?, 'position_update', ?, ?)
      `);

      stmt.run(
        debateId,
        revision.agent_id,
        4,
        revision.changes_made,
        revision.reason
      );

      return true;
    } catch (err) {
      console.error('Error saving revision:', err);
      // Non-critical, continue
    }
  }

  // ==================== RECOMMENDATIONS ====================

  saveRecommendation(debateId, recommendation) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO recommendations
        (debate_id, final_rating, conviction_score, confidence_score)
        VALUES (?, ?, ?, ?)
      `);

      stmt.run(
        debateId,
        recommendation.final_rating,
        recommendation.conviction_score,
        recommendation.confidence_score
      );

      // Save voting breakdown
      recommendation.vote_details?.forEach(vote => {
        const recStmt = this.db.prepare(`
          INSERT INTO voting_breakdown
          (recommendation_id, agent_id, vote_type, confidence, conviction_score)
          VALUES ((SELECT id FROM recommendations WHERE debate_id = ?), ?, ?, ?, ?)
        `);

        recStmt.run(
          debateId,
          vote.agent_id,
          vote.vote_type,
          vote.confidence_score,
          vote.conviction_score
        );
      });

      return true;
    } catch (err) {
      console.error('Error saving recommendation:', err);
      throw err;
    }
  }

  getRecommendation(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM recommendations WHERE debate_id = ?
      `);
      return stmt.get(debateId);
    } catch (err) {
      console.error('Error fetching recommendation:', err);
      return null;
    }
  }

  getVotingBreakdown(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT vb.*, a.name as agent_name
        FROM voting_breakdown vb
        JOIN recommendations r ON vb.recommendation_id = r.id
        JOIN agents a ON vb.agent_id = a.id
        WHERE r.debate_id = ?
      `);
      return stmt.all(debateId);
    } catch (err) {
      console.error('Error fetching voting breakdown:', err);
      return [];
    }
  }

  // ==================== AGENTS ====================

  upsertAgents(agents) {
    try {
      agents.forEach(agent => {
        const stmt = this.db.prepare(`
          INSERT OR REPLACE INTO agents
          (name, type, expertise_areas, system_prompt, avatar_emoji, is_active)
          VALUES (?, ?, ?, ?, ?, 1)
        `);

        stmt.run(
          agent.name,
          agent.type,
          agent.expertise_areas.join(','),
          agent.system_prompt,
          agent.avatar_emoji
        );

        // Initialize reputation
        const repStmt = this.db.prepare(`
          INSERT OR IGNORE INTO agent_reputation (agent_id)
          SELECT id FROM agents WHERE name = ?
        `);

        repStmt.run(agent.name);
      });

      console.log(`✅ Upserted ${agents.length} agents`);
      return true;
    } catch (err) {
      console.error('Error upserting agents:', err);
      throw err;
    }
  }

  getAgents() {
    try {
      const stmt = this.db.prepare(`
        SELECT a.*, ar.accuracy_score, ar.conviction_calibration, ar.debate_wins, ar.total_debates
        FROM agents a
        LEFT JOIN agent_reputation ar ON a.id = ar.agent_id
        WHERE a.is_active = 1
        ORDER BY a.name
      `);
      return stmt.all();
    } catch (err) {
      console.error('Error fetching agents:', err);
      return [];
    }
  }

  getAgentIdByName(name) {
    try {
      const stmt = this.db.prepare(`SELECT id FROM agents WHERE name = ?`);
      const result = stmt.get(name);
      return result ? result.id : 1; // fallback to 1
    } catch (err) {
      return 1; // fallback
    }
  }

  // ==================== TRANSCRIPT ====================

  saveTranscriptMessage(debateId, message) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO debate_transcript
        (debate_id, speaker_id, speaker_type, message_type, content, round_num)
        VALUES (?, ?, 'agent', ?, ?, ?)
      `);

      stmt.run(
        debateId,
        message.speaker_id,
        message.message_type,
        message.content,
        message.round
      );

      return true;
    } catch (err) {
      console.error('Error saving transcript:', err);
      // Non-critical
    }
  }

  getTranscript(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM debate_transcript
        WHERE debate_id = ?
        ORDER BY timestamp, id
      `);
      return stmt.all(debateId);
    } catch (err) {
      console.error('Error fetching transcript:', err);
      return [];
    }
  }

  // ==================== COSTS ====================

  saveCost(debateId, cost) {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO debate_costs
        (debate_id, api_cost, compute_cost, tokens_used, input_tokens, output_tokens)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        debateId,
        cost.api_cost || 0,
        cost.compute_cost || 0,
        (cost.input_tokens || 0) + (cost.output_tokens || 0),
        cost.input_tokens || 0,
        cost.output_tokens || 0
      );

      return true;
    } catch (err) {
      console.error('Error saving cost:', err);
    }
  }

  getCost(debateId) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM debate_costs WHERE debate_id = ?
      `);
      return stmt.get(debateId);
    } catch (err) {
      console.error('Error fetching cost:', err);
      return null;
    }
  }
}

module.exports = { DebateService };
