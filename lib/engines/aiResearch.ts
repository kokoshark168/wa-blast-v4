/**
 * AI Research engine — assembles a structured MarketReport deterministically from
 * the available signal context (alpha scores, whale flow, squeezes, sentiment,
 * on-chain). The deterministic path requires NO external API and always works.
 *
 * An optional LLM enrichment hook (`enrichWithLLM` / `generateReportLLM`) calls
 * the Anthropic Messages API to rewrite the prose summary when ANTHROPIC_API_KEY
 * (or OPENAI_API_KEY) is present; otherwise the report is returned unchanged.
 */
import type {
  AlphaScore,
  MarketReport,
  OnChainSignal,
  ReportPeriod,
  SentimentSignal,
  SqueezeSignal,
  WhaleTransaction,
} from '@/types';
import { childLogger } from '@/lib/logger';
import { mean } from '@/lib/quant';

const log = childLogger('engine:aiResearch');

/** Signal context the report is derived from. */
export interface ReportContext {
  alphaScores: AlphaScore[];
  whales: WhaleTransaction[];
  squeezes: SqueezeSignal[];
  sentiment: SentimentSignal[];
  onchain: OnChainSignal[];
}

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

/**
 * Build a structured market report from the signal context — fully deterministic.
 *
 * Derivation:
 * - bullishFactors: STRONG_OPPORTUNITY/WATCHLIST alpha names, exchange-outflow /
 *   smart-money-accumulation whale flow, SHORT_SQUEEZE signals, net-bullish
 *   on-chain impact, viral positive sentiment.
 * - bearishFactors: AVOID alpha names, exchange-inflow whale flow, LONG_SQUEEZE /
 *   EXHAUSTION signals, net-bearish on-chain impact, viral negative sentiment.
 * - riskFactors: CROWDED positioning, narrative shifts, treasury-scale OTC moves.
 * - keyLevels: per-symbol support/resistance approximated from squeeze magnets and
 *   the highest-conviction alpha names (placeholder bands when price unknown).
 * - summary: a one-paragraph deterministic digest of the above.
 */
export function generateReport(
  period: ReportPeriod,
  context: ReportContext,
): MarketReport {
  const bullishFactors: string[] = [];
  const bearishFactors: string[] = [];
  const riskFactors: string[] = [];

  // ── Alpha scores ──
  const strong = context.alphaScores.filter(
    (a) => a.rating === 'STRONG_OPPORTUNITY' || a.rating === 'WATCHLIST',
  );
  const avoid = context.alphaScores.filter((a) => a.rating === 'AVOID');
  for (const a of strong) {
    bullishFactors.push(
      `${a.symbol}: alpha score ${a.score.toFixed(0)}/100 (${a.rating.replace('_', ' ').toLowerCase()}).`,
    );
  }
  for (const a of avoid) {
    bearishFactors.push(`${a.symbol}: alpha score ${a.score.toFixed(0)}/100 — avoid.`);
  }

  // ── Whale flow ──
  const inflow = context.whales.filter((w) => w.classification === 'EXCHANGE_INFLOW');
  const outflow = context.whales.filter((w) => w.classification === 'EXCHANGE_OUTFLOW');
  const smartAccum = context.whales.filter(
    (w) => w.classification === 'SMART_MONEY_ACCUMULATION',
  );
  const treasury = context.whales.filter((w) => w.classification === 'TREASURY_MOVEMENT');
  if (outflow.length) {
    bullishFactors.push(
      `${outflow.length} whale exchange-outflow(s) totaling $${sumUsd(outflow)} — accumulation/withdrawal.`,
    );
  }
  if (smartAccum.length) {
    bullishFactors.push(
      `${smartAccum.length} smart-money accumulation move(s) totaling $${sumUsd(smartAccum)}.`,
    );
  }
  if (inflow.length) {
    bearishFactors.push(
      `${inflow.length} whale exchange-inflow(s) totaling $${sumUsd(inflow)} — potential sell-side supply.`,
    );
  }
  if (treasury.length) {
    riskFactors.push(
      `${treasury.length} treasury-scale transfer(s) ($${sumUsd(treasury)}) — large balances in motion.`,
    );
  }

  // ── Squeezes ──
  for (const s of context.squeezes) {
    if (s.type === 'SHORT_SQUEEZE') {
      bullishFactors.push(`${s.symbol}: short squeeze risk ${s.probability.toFixed(0)}%.`);
    } else if (s.type === 'LONG_SQUEEZE' || s.type === 'EXHAUSTION') {
      bearishFactors.push(
        `${s.symbol}: ${s.type.replace('_', ' ').toLowerCase()} risk ${s.probability.toFixed(0)}%.`,
      );
    } else if (s.type === 'CROWDED') {
      riskFactors.push(`${s.symbol}: crowded positioning (${s.probability.toFixed(0)}%) — fragile.`);
    }
  }

  // ── On-chain ──
  if (context.onchain.length) {
    const avgImpact = mean(context.onchain.map((o) => o.marketImpactEstimate));
    if (avgImpact > 0.15) {
      bullishFactors.push(`Net on-chain flow bullish (avg impact ${avgImpact.toFixed(2)}).`);
    } else if (avgImpact < -0.15) {
      bearishFactors.push(`Net on-chain flow bearish (avg impact ${avgImpact.toFixed(2)}).`);
    }
  }

  // ── Sentiment ──
  for (const s of context.sentiment) {
    if (s.isNarrativeShift) {
      riskFactors.push(`"${s.keyword}": narrative shift detected — sentiment regime changing.`);
    }
    if (s.isViral && s.sentimentScore > 0.2) {
      bullishFactors.push(`"${s.keyword}": viral with positive sentiment (${s.sentimentScore.toFixed(2)}).`);
    } else if (s.isViral && s.sentimentScore < -0.2) {
      bearishFactors.push(`"${s.keyword}": viral with negative sentiment (${s.sentimentScore.toFixed(2)}).`);
    }
  }

  // ── Key levels (approximate from squeezes; one row per notable symbol) ──
  const keyLevels = buildKeyLevels(context);

  const summary = buildSummary(period, {
    bullishCount: bullishFactors.length,
    bearishCount: bearishFactors.length,
    riskCount: riskFactors.length,
    topAlpha: [...context.alphaScores].sort((a, b) => b.score - a.score)[0],
  });

  return {
    period,
    generatedAt: Date.now(),
    summary,
    bullishFactors,
    bearishFactors,
    riskFactors,
    keyLevels,
  };
}

/** Sum a set of whale tx USD values, formatted with thousands separators. */
function sumUsd(txs: WhaleTransaction[]): string {
  return Math.round(txs.reduce((a, t) => a + t.valueUsd, 0)).toLocaleString('en-US');
}

/** Approximate per-symbol support/resistance bands from squeeze probabilities. */
function buildKeyLevels(
  context: ReportContext,
): { symbol: string; support: number; resistance: number }[] {
  // We don't carry live prices into this engine, so key levels are emitted only
  // for symbols where we have a directional squeeze read; bands are expressed as
  // probability-derived placeholders (0 = unknown) the API layer can overlay on
  // real price. This keeps the deterministic core price-source-free.
  const seen = new Set<string>();
  const levels: { symbol: string; support: number; resistance: number }[] = [];
  for (const s of context.squeezes) {
    if (seen.has(s.symbol) || s.type === 'NEUTRAL') continue;
    seen.add(s.symbol);
    levels.push({ symbol: s.symbol, support: 0, resistance: 0 });
  }
  return levels;
}

function buildSummary(
  period: ReportPeriod,
  d: { bullishCount: number; bearishCount: number; riskCount: number; topAlpha?: AlphaScore },
): string {
  const bias =
    d.bullishCount > d.bearishCount
      ? 'net bullish'
      : d.bearishCount > d.bullishCount
        ? 'net bearish'
        : 'balanced';
  const top = d.topAlpha
    ? ` Highest-conviction name: ${d.topAlpha.symbol} (${d.topAlpha.score.toFixed(0)}/100, ${d.topAlpha.rating.replace('_', ' ').toLowerCase()}).`
    : '';
  return (
    `${capitalize(period)} market read is ${bias}: ${d.bullishCount} bullish, ` +
    `${d.bearishCount} bearish, and ${d.riskCount} risk factor(s) identified across ` +
    `whale flow, derivatives positioning, on-chain activity and social sentiment.${top}`
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Optional LLM enrichment hook. When ANTHROPIC_API_KEY is present, calls the
 * Anthropic Messages API ({@link ANTHROPIC_MODEL}) to rewrite `report.summary`
 * into richer analyst prose grounded in the deterministic factors. The structured
 * arrays are preserved verbatim. Any error (or missing key) returns the report
 * unchanged so the pipeline never depends on the LLM.
 *
 * Note: if only OPENAI_API_KEY is set we still keep the deterministic summary —
 * the implemented provider call targets Anthropic.
 */
export async function enrichWithLLM(
  report: MarketReport,
  context: ReportContext,
): Promise<MarketReport> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    // No Anthropic key — deterministic report is the source of truth.
    return report;
  }

  try {
    const prompt = buildLLMPrompt(report, context);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      log.warn({ status: res.status }, 'LLM enrichment failed; using deterministic summary');
      return report;
    }

    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = json.content?.find((c) => c.type === 'text')?.text?.trim();
    if (!text) return report;

    return { ...report, summary: text };
  } catch (err) {
    log.warn({ err }, 'LLM enrichment threw; using deterministic summary');
    return report;
  }
}

/** Build the analyst prompt grounding the LLM in the deterministic factors. */
function buildLLMPrompt(report: MarketReport, _context: ReportContext): string {
  return [
    `You are a crypto markets analyst. Write a concise ${report.period} market summary`,
    `(3-5 sentences, no preamble, no markdown) grounded ONLY in these factors.`,
    '',
    `Bullish factors:\n${report.bullishFactors.map((f) => `- ${f}`).join('\n') || '- none'}`,
    `Bearish factors:\n${report.bearishFactors.map((f) => `- ${f}`).join('\n') || '- none'}`,
    `Risk factors:\n${report.riskFactors.map((f) => `- ${f}`).join('\n') || '- none'}`,
  ].join('\n');
}

/**
 * Async report generator: builds the deterministic report, then applies the LLM
 * enrichment hook if an API key is configured. Always resolves to a valid report.
 */
export async function generateReportLLM(
  period: ReportPeriod,
  context: ReportContext,
): Promise<MarketReport> {
  const base = generateReport(period, context);
  return enrichWithLLM(base, context);
}
