import { evaluate, evaluateAndDispatch } from '@/lib/alerts/engine';
import type { AlertInputs, AlertSubscription } from '@/lib/alerts/engine';
import type { DispatchResult, NotificationPayload } from '@/lib/notify';
import type { SentimentSignal, WhaleTransaction } from '@/types';

function whaleTx(over: Partial<WhaleTransaction>): WhaleTransaction {
  return {
    txHash: '0xhash',
    chain: 'ethereum',
    from: '0xa',
    to: '0xb',
    tokenSymbol: 'ETH',
    tokenAddress: '0xtoken',
    amount: 100,
    valueUsd: 2_000_000,
    tier: '1m',
    classification: 'EXCHANGE_OUTFLOW',
    timestamp: 0,
    ...over,
  };
}

function viralSignal(): SentimentSignal {
  return {
    keyword: 'pepe',
    platform: 'aggregate',
    mentionVelocity: 200,
    sentimentScore: 0.7,
    trendAcceleration: 5,
    isNarrativeShift: true,
    isViral: true,
  };
}

describe('alerts/engine.evaluate', () => {
  it('fires the right alert types across all input kinds', () => {
    const inputs: AlertInputs = {
      whaleTransactions: [
        whaleTx({ classification: 'EXCHANGE_OUTFLOW' }), // buy
        whaleTx({ classification: 'EXCHANGE_INFLOW' }), // sell
        whaleTx({ classification: 'OTC_MOVEMENT', valueUsd: 1000 }), // none
      ],
      funding: [{ symbol: 'BTC', fundingRate: 0.08 }],
      openInterest: [{ symbol: 'ETH', prevOi: 1_000_000, curOi: 1_500_000 }],
      sentiment: [viralSignal()],
      smartMoney: [
        { symbol: 'ARB', netFlowUsd: 500_000 }, // entry
        { symbol: 'OP', netFlowUsd: -500_000 }, // exit
      ],
    };
    const fired = evaluate(inputs);
    const types = fired.map((f) => f.type).sort();
    expect(types).toEqual(
      [
        'funding_extreme',
        'oi_spike',
        'sentiment_explosion',
        'smart_money_entry',
        'smart_money_exit',
        'whale_buy',
        'whale_sell',
      ].sort(),
    );
  });

  it('fires nothing for an empty input slice', () => {
    expect(evaluate({})).toEqual([]);
  });

  it('respects custom thresholds', () => {
    const inputs: AlertInputs = { funding: [{ symbol: 'BTC', fundingRate: 0.02 }] };
    expect(evaluate(inputs).length).toBe(0);
    expect(evaluate(inputs, { fundingRate: 0.01 }).length).toBe(1);
  });
});

describe('alerts/engine.evaluateAndDispatch', () => {
  it('dispatches fired alerts only to subscribers that want the type', async () => {
    const calls: { channels: string[]; payload: NotificationPayload }[] = [];
    const fakeDispatch = async (
      payload: NotificationPayload,
      channels: string[],
    ): Promise<DispatchResult[]> => {
      calls.push({ payload, channels });
      return channels.map((c) => ({ channel: c, ok: true }));
    };

    const inputs: AlertInputs = {
      whaleTransactions: [whaleTx({ classification: 'EXCHANGE_OUTFLOW' })],
      funding: [{ symbol: 'BTC', fundingRate: 0.09 }],
    };
    const subscriptions: AlertSubscription[] = [
      { subscriberId: 'u1', types: ['whale_buy'], channels: ['telegram'] },
      { subscriberId: 'u2', channels: ['discord'] }, // wants all types
    ];

    const res = await evaluateAndDispatch(inputs, subscriptions, { dispatch: fakeDispatch });

    expect(res.fired.map((f) => f.type).sort()).toEqual(['funding_extreme', 'whale_buy']);
    // u1 only gets whale_buy (1 delivery); u2 gets both (2 deliveries) => 3 total.
    expect(res.deliveries).toHaveLength(3);
    const u1 = res.deliveries.filter((d) => d.subscriberId === 'u1');
    expect(u1).toHaveLength(1);
    expect(u1[0].type).toBe('whale_buy');
    expect(u1[0].results).toEqual([{ channel: 'telegram', ok: true }]);
    const u2 = res.deliveries.filter((d) => d.subscriberId === 'u2');
    expect(u2.map((d) => d.type).sort()).toEqual(['funding_extreme', 'whale_buy']);
  });

  it('makes no dispatch calls when nothing fires', async () => {
    const fakeDispatch = jest.fn(async () => [] as DispatchResult[]);
    const res = await evaluateAndDispatch(
      {},
      [{ subscriberId: 'u1', channels: ['telegram'] }],
      { dispatch: fakeDispatch },
    );
    expect(res.fired).toEqual([]);
    expect(res.deliveries).toEqual([]);
    expect(fakeDispatch).not.toHaveBeenCalled();
  });
});
