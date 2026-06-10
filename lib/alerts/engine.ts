/**
 * Alert orchestration engine. Runs the pure rule predicates in `lib/alerts/rules`
 * over a slice of fresh inputs, builds notification payloads for whatever fires,
 * and dispatches each to a subscriber's chosen channels.
 *
 * DB-agnostic: the caller is responsible for loading fresh data and the list of
 * subscriptions. The dispatch function is injected (defaulting to the real
 * `lib/notify` dispatch) so the orchestration is fully unit-testable offline.
 */
import type { SentimentSignal, WhaleTransaction } from '@/types';
import { childLogger } from '@/lib/logger';
import { dispatch as defaultDispatch } from '@/lib/notify';
import type { DispatchResult, NotificationPayload } from '@/lib/notify';
import {
  fundingExtremeTriggered,
  formatAlert,
  oiSpikeTriggered,
  sentimentExplosionTriggered,
  smartMoneyEntryTriggered,
  smartMoneyExitTriggered,
  whaleBuyTriggered,
  whaleSellTriggered,
} from '@/lib/alerts/rules';

const log = childLogger('alerts:engine');

/** Discrete alert types this engine can raise (snake_case, matching `formatAlert`). */
export type AlertType =
  | 'whale_buy'
  | 'whale_sell'
  | 'funding_extreme'
  | 'oi_spike'
  | 'sentiment_explosion'
  | 'smart_money_entry'
  | 'smart_money_exit';

/** A single funding snapshot to evaluate. */
export interface FundingInput {
  symbol: string;
  fundingRate: number;
}

/** A prev/cur open-interest pair to evaluate for a spike. */
export interface OiInput {
  symbol: string;
  prevOi: number;
  curOi: number;
}

/** A net smart-money flow reading for a symbol. */
export interface SmartMoneyInput {
  symbol: string;
  netFlowUsd: number;
}

/**
 * The fresh data slice the engine evaluates. Every field is optional; absent
 * fields simply produce no triggers of that kind.
 */
export interface AlertInputs {
  whaleTransactions?: WhaleTransaction[];
  funding?: FundingInput[];
  openInterest?: OiInput[];
  sentiment?: SentimentSignal[];
  smartMoney?: SmartMoneyInput[];
}

/**
 * Thresholds controlling when each rule fires. All optional with sensible
 * defaults so a caller can tune just what it cares about.
 */
export interface AlertThresholds {
  /** Min USD value for a whale buy/sell. Default 100,000. */
  whaleUsd: number;
  /** Absolute funding rate considered extreme. Default 0.05. */
  fundingRate: number;
  /** Fractional OI growth considered a spike. Default 0.2. */
  oiPct: number;
  /** Mentions/hour considered a sentiment explosion. Default 50. */
  sentimentVelocity: number;
  /** Min net USD flow for a smart-money entry/exit. Default 250,000. */
  smartMoneyUsd: number;
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  whaleUsd: 100_000,
  fundingRate: 0.05,
  oiPct: 0.2,
  sentimentVelocity: 50,
  smartMoneyUsd: 250_000,
};

/** A subscriber that wants certain alert types on certain channels. */
export interface AlertSubscription {
  /** Identifier of the subscribing user/entity (echoed back in results). */
  subscriberId: string;
  /** Alert types this subscriber wants. Empty/omitted = all types. */
  types?: AlertType[];
  /** Channel names to deliver to (e.g. `['telegram','discord']`). */
  channels: string[];
}

/** A single fired alert (before per-subscriber routing). */
export interface FiredAlert {
  type: AlertType;
  payload: NotificationPayload;
}

/** The dispatch function signature the engine depends on (matches `lib/notify`). */
export type DispatchFn = (
  payload: NotificationPayload,
  channels: string[],
) => Promise<DispatchResult[]>;

/** Per-subscriber delivery outcome for one fired alert. */
export interface DeliveryRecord {
  subscriberId: string;
  type: AlertType;
  results: DispatchResult[];
}

/** Aggregate result of an evaluate-and-dispatch run. */
export interface EvaluateResult {
  /** Every alert that fired from the inputs (deduplicated by nothing — 1 per match). */
  fired: FiredAlert[];
  /** Every delivery attempt made, one per (subscriber × matching fired alert). */
  deliveries: DeliveryRecord[];
}

/**
 * Evaluate all rules over `inputs` and return the alerts that fired (no I/O).
 * Exposed separately so callers can preview/test triggers without dispatching.
 */
export function evaluate(
  inputs: AlertInputs,
  thresholds: Partial<AlertThresholds> = {},
): FiredAlert[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const fired: FiredAlert[] = [];

  for (const tx of inputs.whaleTransactions ?? []) {
    if (whaleBuyTriggered(tx, t.whaleUsd)) {
      fired.push({ type: 'whale_buy', payload: formatAlert('whale_buy', tx) });
    } else if (whaleSellTriggered(tx, t.whaleUsd)) {
      fired.push({ type: 'whale_sell', payload: formatAlert('whale_sell', tx) });
    }
  }

  for (const f of inputs.funding ?? []) {
    if (fundingExtremeTriggered(f.fundingRate, t.fundingRate)) {
      fired.push({ type: 'funding_extreme', payload: formatAlert('funding_extreme', f) });
    }
  }

  for (const oi of inputs.openInterest ?? []) {
    if (oiSpikeTriggered(oi.prevOi, oi.curOi, t.oiPct)) {
      fired.push({ type: 'oi_spike', payload: formatAlert('oi_spike', oi) });
    }
  }

  for (const s of inputs.sentiment ?? []) {
    if (sentimentExplosionTriggered(s, t.sentimentVelocity)) {
      fired.push({ type: 'sentiment_explosion', payload: formatAlert('sentiment_explosion', s) });
    }
  }

  for (const sm of inputs.smartMoney ?? []) {
    if (smartMoneyEntryTriggered(sm.netFlowUsd, t.smartMoneyUsd)) {
      fired.push({ type: 'smart_money_entry', payload: formatAlert('smart_money_entry', sm) });
    } else if (smartMoneyExitTriggered(sm.netFlowUsd, t.smartMoneyUsd)) {
      fired.push({ type: 'smart_money_exit', payload: formatAlert('smart_money_exit', sm) });
    }
  }

  return fired;
}

/** True if a subscription wants the given alert type (empty `types` = all). */
function wants(sub: AlertSubscription, type: AlertType): boolean {
  return !sub.types || sub.types.length === 0 || sub.types.includes(type);
}

/** Options for {@link evaluateAndDispatch}. */
export interface EvaluateAndDispatchOptions {
  thresholds?: Partial<AlertThresholds>;
  /** Injected dispatch fn (defaults to `lib/notify` dispatch). For testability. */
  dispatch?: DispatchFn;
}

/**
 * Run all rules over `inputs`, then for every fired alert deliver it to each
 * subscription that wants that type, on that subscription's channels.
 *
 * Pure orchestration: no DB access, dispatch is injectable. Never throws — a
 * failing channel surfaces as `ok:false` inside the returned `DispatchResult`s.
 */
export async function evaluateAndDispatch(
  inputs: AlertInputs,
  subscriptions: AlertSubscription[],
  options: EvaluateAndDispatchOptions = {},
): Promise<EvaluateResult> {
  const dispatch = options.dispatch ?? defaultDispatch;
  const fired = evaluate(inputs, options.thresholds);

  const deliveries: DeliveryRecord[] = [];
  for (const alert of fired) {
    for (const sub of subscriptions) {
      if (!wants(sub, alert.type)) continue;
      const results = await dispatch(alert.payload, sub.channels);
      deliveries.push({ subscriberId: sub.subscriberId, type: alert.type, results });
    }
  }

  log.debug({ fired: fired.length, deliveries: deliveries.length }, 'alerts evaluated & dispatched');
  return { fired, deliveries };
}
