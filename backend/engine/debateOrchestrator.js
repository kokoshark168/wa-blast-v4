// Alpha Council: Debate Orchestrator
// Manages the 5-round debate workflow with timeout enforcement

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

class DebateOrchestrator extends EventEmitter {
  constructor(debateId, agents, messageQueue, debateService) {
    super();
    this.debateId = debateId;
    this.agents = agents;
    this.messageQueue = messageQueue;
    this.debateService = debateService;

    this.state = 'draft';
    this.currentRound = 0;
    this.roundTimeouts = {};
    this.agentTimeouts = {};
    this.reports = {};
    this.votes = {};
    this.challenges = {};
    this.evidence = [];
    this.transcript = [];
  }

  async initialize(briefing) {
    try {
      console.log(`[Debate ${this.debateId}] Initializing with briefing...`);

      this.state = 'initialized';
      this.briefing = briefing;

      await this.debateService.updateDebateStatus(this.debateId, 'initialized');

      // Store briefing in debate
      await this.debateService.saveBriefing(this.debateId, briefing);

      this.emit('initialized');
      return true;
    } catch (err) {
      console.error(`[Debate ${this.debateId}] Initialization failed:`, err);
      this.state = 'aborted';
      throw err;
    }
  }

  async executeRound(roundNum) {
    const roundType = [
      'reports',      // Round 1: Independent reports
      'cross_exam',   // Round 2: Cross-examination
      'attacks',      // Round 3: Attack weaknesses
      'revisions',    // Round 4: Revisions
      'voting'        // Round 5: Voting
    ][roundNum - 1];

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Debate ${this.debateId}] ROUND ${roundNum}: ${roundType.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);

    this.currentRound = roundNum;
    this.state = `round${roundNum}`;

    try {
      await this.debateService.startRound(this.debateId, roundNum, roundType);

      let success = false;
      switch (roundNum) {
        case 1:
          success = await this.executeRound1_Reports();
          break;
        case 2:
          success = await this.executeRound2_CrossExamination();
          break;
        case 3:
          success = await this.executeRound3_AttackWeaknesses();
          break;
        case 4:
          success = await this.executeRound4_Revisions();
          break;
        case 5:
          success = await this.executeRound5_Voting();
          break;
      }

      if (success) {
        await this.debateService.completeRound(this.debateId, roundNum);
        this.emit(`round${roundNum}_completed`);
        return true;
      } else {
        await this.debateService.updateRoundStatus(this.debateId, roundNum, 'timeout');
        this.emit(`round${roundNum}_timeout`);
        return false;
      }
    } catch (err) {
      console.error(`[Debate ${this.debateId}] Round ${roundNum} error:`, err);
      await this.debateService.updateRoundStatus(this.debateId, roundNum, 'timeout');
      throw err;
    }
  }

  async executeRound1_Reports() {
    console.log(`Gathering independent reports from all ${this.agents.length} agents...`);

    // Execute all agent reports in parallel
    const agentPromises = this.agents.map(agent =>
      this.getAgentReport(agent, 1)
        .catch(err => {
          console.warn(`⚠️ Agent ${agent.name} report failed:`, err.message);
          return null;
        })
    );

    const results = await Promise.race([
      Promise.all(agentPromises),
      this.createTimeout(300000) // 5 minute timeout per round
    ]);

    if (Array.isArray(results)) {
      const validReports = results.filter(r => r !== null);
      console.log(`✅ Collected ${validReports.length}/${this.agents.length} reports`);

      validReports.forEach(report => {
        this.reports[report.agent_id] = report;
        this.addToTranscript(report.agent_id, 'report', report.reasoning, 1);
      });

      return validReports.length >= Math.ceil(this.agents.length * 0.75); // 75% quorum
    }

    return false;
  }

  async executeRound2_CrossExamination() {
    console.log('Cross-examination: Agents challenge each other...');

    const challengePromises = [];

    for (const targetAgent of this.agents) {
      if (!this.reports[targetAgent.id]) continue;

      // Randomly assign 2-3 challengers to each target
      const challengers = this.agents
        .filter(a => a.id !== targetAgent.id)
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.random() > 0.5 ? 2 : 3);

      for (const challenger of challengers) {
        const challengePromise = this.challengeAgent(
          challenger,
          targetAgent,
          this.reports[targetAgent.id],
          2
        );
        challengePromises.push(challengePromise);
      }
    }

    const results = await Promise.race([
      Promise.all(challengePromises.map(p =>
        p.catch(err => {
          console.warn('Challenge failed:', err.message);
          return null;
        })
      )),
      this.createTimeout(250000) // 4+ minute timeout
    ]);

    if (Array.isArray(results)) {
      const validChallenges = results.filter(r => r !== null);
      console.log(`✅ Processed ${validChallenges.length} challenges/rebuttals`);
      return validChallenges.length > 0;
    }

    return false;
  }

  async executeRound3_AttackWeaknesses() {
    console.log('Attack phase: Identifying and attacking weaknesses...');

    const devilsAdvocate = this.agents.find(a => a.name === 'Devils_Advocate');
    const riskManager = this.agents.find(a => a.name === 'Risk_Manager');
    const bear = this.agents.find(a => a.name === 'Bear_Analyst');

    const attackPromises = [];

    if (devilsAdvocate) {
      attackPromises.push(
        this.systemattackConsensus(devilsAdvocate, 3)
          .catch(err => console.warn('Devil\'s advocate attack failed:', err.message))
      );
    }

    if (riskManager) {
      attackPromises.push(
        this.highlightRisks(riskManager, 3)
          .catch(err => console.warn('Risk manager highlight failed:', err.message))
      );
    }

    if (bear) {
      attackPromises.push(
        this.doubleDownBearCase(bear, 3)
          .catch(err => console.warn('Bear double down failed:', err.message))
      );
    }

    const results = await Promise.race([
      Promise.all(attackPromises),
      this.createTimeout(200000) // 3+ minute timeout
    ]);

    if (Array.isArray(results)) {
      const validAttacks = results.filter(r => r !== null);
      console.log(`✅ Processed ${validAttacks.length} attacks/weaknesses`);
      return validAttacks.length > 0;
    }

    return false;
  }

  async executeRound4_Revisions() {
    console.log('Revision phase: Agents can revise positions...');

    // Only non-devil's advocate agents can revise
    const revisableAgents = this.agents.filter(a => a.name !== 'Devils_Advocate');

    const revisionPromises = revisableAgents.map(agent =>
      this.getAgentRevision(agent, 4)
        .catch(err => {
          console.warn(`Agent ${agent.name} revision failed:`, err.message);
          return null;
        })
    );

    const results = await Promise.race([
      Promise.all(revisionPromises),
      this.createTimeout(150000) // 2.5 minute timeout
    ]);

    if (Array.isArray(results)) {
      const validRevisions = results.filter(r => r !== null);
      console.log(`✅ Processed ${validRevisions.length} revisions`);

      validRevisions.forEach(revision => {
        if (this.reports[revision.agent_id]) {
          this.reports[revision.agent_id].revision = revision;
          this.addToTranscript(revision.agent_id, 'revision', revision.changes_made, 4);
        }
      });

      return true; // Revisions are optional
    }

    return false;
  }

  async executeRound5_Voting() {
    console.log('Voting phase: All agents vote on recommendation...');

    const votePromises = this.agents.map(agent =>
      this.getAgentVote(agent, 5)
        .catch(err => {
          console.warn(`Agent ${agent.name} vote failed:`, err.message);
          return null;
        })
    );

    const results = await Promise.race([
      Promise.all(votePromises),
      this.createTimeout(120000) // 2 minute timeout
    ]);

    if (Array.isArray(results)) {
      const validVotes = results.filter(r => r !== null);
      console.log(`✅ Collected ${validVotes.length} votes`);

      validVotes.forEach(vote => {
        this.votes[vote.agent_id] = vote;
        this.addToTranscript(vote.agent_id, 'vote', `${vote.vote_type} (conviction: ${vote.conviction_score})`, 5);
      });

      if (validVotes.length >= Math.ceil(this.agents.length * 0.75)) {
        await this.aggregateAndSaveVotes(validVotes);
        return true;
      }
    }

    return false;
  }

  async getAgentReport(agent, roundNum) {
    const startTime = Date.now();

    const prompt = `You are ${agent.name}, a ${agent.type} analyst.

BRIEFING:
${JSON.stringify(this.briefing, null, 2)}

Provide your independent analysis focusing on your expertise area: ${agent.expertise_areas.join(', ')}.

Format your response as JSON with:
- reasoning: Your detailed analysis and reasoning
- confidence_score: 0-1 confidence in your analysis
- conviction_score: 1-10 conviction in bull/bear direction
- key_findings: 2-3 bullet points
- evidence_needed: What data would you request?

Be rigorous. Cite specific metrics. Back claims with evidence.`;

    try {
      const response = await this.callAgentLLM(agent, prompt);
      const parsed = JSON.parse(response);

      const report = {
        agent_id: agent.id,
        agent_name: agent.name,
        round: roundNum,
        report_type: 'initial',
        reasoning: parsed.reasoning,
        confidence_score: parsed.confidence_score || 0.5,
        conviction_score: parsed.conviction_score || 5,
        key_findings: parsed.key_findings,
        evidence_needed: parsed.evidence_needed
      };

      console.log(`✅ ${agent.name}: confidence ${report.confidence_score.toFixed(2)}, conviction ${report.conviction_score}/10`);

      await this.debateService.saveAgentReport(this.debateId, report);
      return report;
    } catch (err) {
      console.error(`❌ ${agent.name} report failed:`, err.message);
      throw err;
    }
  }

  async challengeAgent(challenger, target, targetReport, roundNum) {
    const prompt = `You are ${challenger.name}.

The ${target.name} made this argument:
${targetReport.reasoning}

Generate 2-3 critical questions challenging the key assumptions.
Format as JSON with:
- questions: Array of challenging questions
- implied_concern: What's the underlying concern?
- evidence_request: What evidence would change your mind?`;

    try {
      const response = await this.callAgentLLM(challenger, prompt);
      const parsed = JSON.parse(response);

      const challenge = {
        challenger_name: challenger.name,
        target_name: target.name,
        round: roundNum,
        questions: parsed.questions,
        implied_concern: parsed.implied_concern
      };

      console.log(`🎯 ${challenger.name} → ${target.name}: ${parsed.questions[0]}`);

      await this.debateService.saveChallenge(this.debateId, challenge);
      return challenge;
    } catch (err) {
      console.error(`Challenge failed:`, err.message);
      throw err;
    }
  }

  async getAgentVote(agent, roundNum) {
    const reportSummary = Object.values(this.reports)
      .map(r => `${r.agent_name}: conviction ${r.conviction_score}/10`)
      .join('\n');

    const prompt = `You are ${agent.name}.

Based on all analysis in this debate, vote:

${reportSummary}

Your vote must be: BUY, HOLD, or SELL

Format as JSON with:
- vote_type: BUY|HOLD|SELL
- conviction_score: 1-10
- confidence_score: 0-1
- reasoning: Brief rationale`;

    try {
      const response = await this.callAgentLLM(agent, prompt);
      const parsed = JSON.parse(response);

      const vote = {
        agent_id: agent.id,
        agent_name: agent.name,
        vote_type: parsed.vote_type.toUpperCase(),
        conviction_score: parsed.conviction_score || 5,
        confidence_score: parsed.confidence_score || 0.5,
        reasoning: parsed.reasoning
      };

      console.log(`✅ ${agent.name}: ${vote.vote_type}`);

      await this.debateService.saveVote(this.debateId, vote);
      return vote;
    } catch (err) {
      console.error(`Vote failed:`, err.message);
      throw err;
    }
  }

  async getAgentRevision(agent, roundNum) {
    const report = this.reports[agent.id];
    if (!report) return null;

    const prompt = `You are ${agent.name}.

Your original conviction was ${report.conviction_score}/10.

After hearing challenges and other analysis, would you revise your position?

Format as JSON with:
- revised_conviction_score: New score (or same if no change)
- changes_made: What changed your mind (or "No change")
- reason: Brief explanation`;

    try {
      const response = await this.callAgentLLM(agent, prompt);
      const parsed = JSON.parse(response);

      const revision = {
        agent_id: agent.id,
        agent_name: agent.name,
        revised_conviction: parsed.revised_conviction_score || report.conviction_score,
        changes_made: parsed.changes_made,
        reason: parsed.reason
      };

      if (parsed.revised_conviction_score !== report.conviction_score) {
        console.log(`📝 ${agent.name}: conviction ${report.conviction_score} → ${parsed.revised_conviction_score}`);
      }

      await this.debateService.saveRevision(this.debateId, revision);
      return revision;
    } catch (err) {
      console.error(`Revision failed:`, err.message);
      return null;
    }
  }

  async systemattackConsensus(devilsAdvocate, roundNum) {
    const consensusView = this.getConsensusFromReports();

    const prompt = `You are ${devilsAdvocate.name}.

Your job is to attack the consensus:

${consensusView}

Format as JSON with:
- main_flaws: Array of critical flaws in consensus
- hidden_assumptions: What's assumed but not questioned?
- alternative_view: What if the opposite were true?`;

    try {
      const response = await this.callAgentLLM(devilsAdvocate, prompt);
      const parsed = JSON.parse(response);
      console.log(`😈 Devil's Advocate: ${parsed.main_flaws[0]}`);
      this.addToTranscript(devilsAdvocate.id, 'attack', parsed.main_flaws[0], roundNum);
      return parsed;
    } catch (err) {
      console.error('Devil\'s advocate attack failed:', err.message);
      throw err;
    }
  }

  async highlightRisks(riskManager, roundNum) {
    const prompt = `You are ${riskManager.name}.

Identify the top 3 tail risks (worst case scenarios) that could invalidate this thesis.

Format as JSON with:
- risks: Array of {scenario, probability, impact, trigger}
- hedging_strategy: How would you hedge?`;

    try {
      const response = await this.callAgentLLM(riskManager, prompt);
      const parsed = JSON.parse(response);
      console.log(`⚠️ Risk Manager: ${parsed.risks[0].scenario}`);
      this.addToTranscript(riskManager.id, 'risk_highlight', JSON.stringify(parsed.risks), roundNum);
      return parsed;
    } catch (err) {
      console.error('Risk highlight failed:', err.message);
      throw err;
    }
  }

  async doubleDownBearCase(bear, roundNum) {
    const report = this.reports[bear.id];
    const prompt = `You are ${bear.name}.

Double down on your bear case. What's the most damning evidence against this investment?

Format as JSON with:
- strongest_evidence: Array of 3 strongest bear points
- valuation_concern: How is this overvalued?
- catalyst_for_downside: What's the trigger?`;

    try {
      const response = await this.callAgentLLM(bear, prompt);
      const parsed = JSON.parse(response);
      console.log(`🐻 Bear: ${parsed.strongest_evidence[0]}`);
      this.addToTranscript(bear.id, 'bear_attack', JSON.stringify(parsed.strongest_evidence), roundNum);
      return parsed;
    } catch (err) {
      console.error('Bear attack failed:', err.message);
      throw err;
    }
  }

  async callAgentLLM(agent, prompt) {
    // Mock implementation - in production calls Claude API
    return this.mockAgentResponse(agent, prompt);
  }

  mockAgentResponse(agent, prompt) {
    // Simulated agent responses for development/testing
    const responses = {
      'CEO_Agent': {
        reasoning: 'After reviewing all analyses, the case appears mixed with reasonable bull and bear arguments.',
        confidence_score: 0.7,
        conviction_score: 5,
        key_findings: ['Valuation reasonable but not cheap', 'Growth trajectory uncertain', 'Risk/reward balanced'],
        vote_type: 'HOLD',
        conviction_score: 6
      },
      'Bull_Analyst': {
        reasoning: 'Strong upside catalysts with underappreciated growth opportunities.',
        confidence_score: 0.8,
        conviction_score: 8,
        key_findings: ['New market expansion', 'Margin expansion potential', 'Valuation discount to peers'],
        vote_type: 'BUY',
        conviction_score: 8
      },
      'Bear_Analyst': {
        reasoning: 'Material downside risks from competition and macro headwinds.',
        confidence_score: 0.75,
        conviction_score: 4,
        key_findings: ['Competitive pressures increasing', 'Macro slowdown risk', 'Valuation not compelling'],
        vote_type: 'SELL',
        conviction_score: 6
      },
      'Financial_Analyst': {
        reasoning: 'Solid fundamentals but growth deceleration visible in recent quarters.',
        confidence_score: 0.85,
        conviction_score: 6,
        key_findings: ['Revenue growth slowing', 'Margins stable', 'FCF generation strong'],
        vote_type: 'HOLD',
        conviction_score: 6
      },
      'Valuation_Analyst': {
        reasoning: 'Trading at fair value with limited margin of safety.',
        confidence_score: 0.8,
        conviction_score: 5,
        key_findings: ['P/E 15x peers, historical 18x', 'DCF fair value $85-95', 'Limited upside'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'Macro_Analyst': {
        reasoning: 'Macro backdrop is uncertain with rate policy key watch.',
        confidence_score: 0.7,
        conviction_score: 5,
        key_findings: ['Rates likely to stay elevated', 'Inflation moderating', 'GDP growth slowing'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'Sector_Specialist': {
        reasoning: 'Sector is attractive but competitive intensity is rising.',
        confidence_score: 0.8,
        conviction_score: 6,
        key_findings: ['Market growing 8-10% annually', 'Company at 6% growth', 'Losing share to competitors'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'Quant_Analyst': {
        reasoning: 'Momentum is neutral, valuation factors are mixed.',
        confidence_score: 0.75,
        conviction_score: 5,
        key_findings: ['6-month momentum neutral', 'Value factor positive', 'Growth factor negative'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'Technical_Analyst': {
        reasoning: 'Price action shows range-bound consolidation.',
        confidence_score: 0.7,
        conviction_score: 5,
        key_findings: ['Trading in $80-95 range', 'Support at $82', 'Resistance at $93'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'News_Analyst': {
        reasoning: 'Recent news mixed with no major catalysts near-term.',
        confidence_score: 0.75,
        conviction_score: 5,
        key_findings: ['Q3 earnings in 2 weeks', 'Guidance likely cut 5%', 'New product launch Q4'],
        vote_type: 'HOLD',
        conviction_score: 5
      },
      'Sentiment_Analyst': {
        reasoning: 'Institutional sentiment is cooling, retail remains mixed.',
        confidence_score: 0.65,
        conviction_score: 4,
        key_findings: ['Hedge fund flows negative', 'Retail Twitter bullish', 'Short interest rising'],
        vote_type: 'HOLD',
        conviction_score: 4
      },
      'Risk_Manager': {
        reasoning: 'Tail risks are material with limited hedging options.',
        confidence_score: 0.8,
        conviction_score: 4,
        key_findings: ['Regulatory risk: 20% probability', 'Competitive disruption: 30%', 'Macro recession: 25%'],
        vote_type: 'HOLD',
        conviction_score: 4
      },
      'Devils_Advocate': {
        reasoning: 'The bull case rests on growth assumptions that are heroic.',
        confidence_score: 0.85,
        conviction_score: 3,
        key_findings: ['2% growth assumed but market is contracting', 'Margin expansion impossible', 'Price target too aggressive'],
        vote_type: 'SELL',
        conviction_score: 7
      },
      'Portfolio_Manager': {
        reasoning: 'Position sized as core holding with risk/reward balanced.',
        confidence_score: 0.8,
        conviction_score: 6,
        key_findings: ['Suggest 3-5% of portfolio', 'Hedge with long puts', 'Re-balance if breaks $75'],
        vote_type: 'HOLD',
        conviction_score: 6
      }
    };

    const agentName = agent.name;
    const response = responses[agentName] || responses['CEO_Agent'];

    // Simulate response time delay
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(JSON.stringify(response));
      }, Math.random() * 1000 + 500);
    });
  }

  async aggregateAndSaveVotes(votes) {
    const voteCounts = { BUY: 0, HOLD: 0, SELL: 0 };
    let totalConviction = 0;
    let totalConfidence = 0;

    votes.forEach(vote => {
      voteCounts[vote.vote_type]++;
      totalConviction += vote.conviction_score;
      totalConfidence += vote.confidence_score;
    });

    const finalRating =
      voteCounts.BUY > votes.length * 0.5 ? 'BUY' :
      voteCounts.SELL > votes.length * 0.5 ? 'SELL' : 'HOLD';

    const conviction = totalConviction / votes.length;
    const confidence = totalConfidence / votes.length;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`FINAL RECOMMENDATION: ${finalRating}`);
    console.log(`Conviction: ${conviction.toFixed(1)}/10`);
    console.log(`Confidence: ${(confidence * 100).toFixed(0)}%`);
    console.log(`Votes: BUY ${voteCounts.BUY}, HOLD ${voteCounts.HOLD}, SELL ${voteCounts.SELL}`);
    console.log(`${'='.repeat(60)}\n`);

    await this.debateService.saveRecommendation(this.debateId, {
      final_rating: finalRating,
      conviction_score: conviction,
      confidence_score: confidence,
      vote_counts: voteCounts,
      vote_details: votes
    });
  }

  getConsensusFromReports() {
    const reports = Object.values(this.reports);
    const avgConviction = reports.reduce((sum, r) => sum + (r.conviction_score || 5), 0) / reports.length;

    return `Average conviction: ${avgConviction.toFixed(1)}/10
Reports suggest: ${avgConviction > 6 ? 'BULLISH' : avgConviction < 4 ? 'BEARISH' : 'MIXED'}`;
  }

  addToTranscript(speakerId, messageType, content, round) {
    this.transcript.push({
      speaker_id: speakerId,
      message_type: messageType,
      content: content.substring(0, 500),
      round: round,
      timestamp: new Date()
    });
  }

  createTimeout(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
  }

  async complete() {
    this.state = 'completed';
    await this.debateService.completeDebate(this.debateId);
    this.emit('completed');
  }
}

module.exports = { DebateOrchestrator };
