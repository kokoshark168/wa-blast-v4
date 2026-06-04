import {
  formatAlert,
  fundingExtremeTriggered,
  oiSpikeTriggered,
  sentimentExplosionTriggered,
  smartMoneyEntryTriggered,
  smartMoneyExitTriggered,
  whaleBuyTriggered,
  whaleSellTriggered,
} from '@/lib/alerts/rules';
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
    valueUsd: 500_000,
    tier: '100k',
    classification: 'EXCHANGE_OUTFLOW',
    timestamp: 0,
    ...over,
  };
}

function sentiment(over: Partial<SentimentSignal>): SentimentSignal {
  return {
    keyword: 'btc',
    platform: 'aggregate',
    mentionVelocity: 10,
    sentimentScore: 0.3,
    trendAcceleration: 0.5,
    isNarrativeShift: false,
    isViral: false,
    ...over,
  };
}

describe('rules.whaleBuyTriggered', () => {
  it('fires for outflow/accumulation above threshold', () => {
    expect(whaleBuyTriggered(whaleTx({ classification: 'EXCHANGE_OUTFLOW' }), 100_000)).toBe(true);
    expect(
      whaleBuyTriggered(whaleTx({ classification: 'SMART_MONEY_ACCUMULATION' }), 100_000),
    ).toBe(true);
  });
  it('does not fire below threshold', () => {
    expect(whaleBuyTriggered(whaleTx({ valueUsd: 50_000 }), 100_000)).toBe(false);
  });
  it('does not fire for inflow', () => {
    expect(whaleBuyTriggered(whaleTx({ classification: 'EXCHANGE_INFLOW' }), 100_000)).toBe(false);
  });
});

describe('rules.whaleSellTriggered', () => {
  it('fires for exchange inflow above threshold', () => {
    expect(whaleSellTriggered(whaleTx({ classification: 'EXCHANGE_INFLOW' }), 100_000)).toBe(true);
  });
  it('does not fire for outflow', () => {
    expect(whaleSellTriggered(whaleTx({ classification: 'EXCHANGE_OUTFLOW' }), 100_000)).toBe(false);
  });
});

describe('rules.fundingExtremeTriggered', () => {
  it('fires on extreme positive or negative funding', () => {
    expect(fundingExtremeTriggered(0.06)).toBe(true);
    expect(fundingExtremeTriggered(-0.06)).toBe(true);
  });
  it('does not fire within normal range', () => {
    expect(fundingExtremeTriggered(0.01)).toBe(false);
  });
  it('honors a custom threshold', () => {
    expect(fundingExtremeTriggered(0.02, 0.01)).toBe(true);
  });
});

describe('rules.oiSpikeTriggered', () => {
  it('fires on a >=20% jump', () => {
    expect(oiSpikeTriggered(1_000_000, 1_250_000)).toBe(true);
  });
  it('does not fire on a small change', () => {
    expect(oiSpikeTriggered(1_000_000, 1_050_000)).toBe(false);
  });
  it('does not fire with a non-positive prior', () => {
    expect(oiSpikeTriggered(0, 500_000)).toBe(false);
  });
});

describe('rules.sentimentExplosionTriggered', () => {
  it('fires when viral', () => {
    expect(sentimentExplosionTriggered(sentiment({ isViral: true }), 100)).toBe(true);
  });
  it('fires when velocity clears the threshold', () => {
    expect(sentimentExplosionTriggered(sentiment({ mentionVelocity: 120 }), 100)).toBe(true);
  });
  it('does not fire otherwise', () => {
    expect(sentimentExplosionTriggered(sentiment({ mentionVelocity: 10 }), 100)).toBe(false);
  });
});

describe('rules.smartMoney entry/exit', () => {
  it('entry fires on strong net buying', () => {
    expect(smartMoneyEntryTriggered(300_000, 250_000)).toBe(true);
    expect(smartMoneyEntryTriggered(100_000, 250_000)).toBe(false);
  });
  it('exit fires on strong net selling', () => {
    expect(smartMoneyExitTriggered(-300_000, 250_000)).toBe(true);
    expect(smartMoneyExitTriggered(-100_000, 250_000)).toBe(false);
    expect(smartMoneyExitTriggered(300_000, 250_000)).toBe(false);
  });
});

describe('rules.formatAlert', () => {
  it('builds a whale-buy payload with the expected shape', () => {
    const p = formatAlert('whale_buy', whaleTx({ tokenSymbol: 'ETH', valueUsd: 2_000_000 }));
    expect(p.title).toContain('Whale BUY');
    expect(p.title).toContain('ETH');
    expect(typeof p.body).toBe('string');
    expect(p.severity).toBeGreaterThanOrEqual(0);
    expect(p.severity).toBeLessThanOrEqual(100);
    expect(p.metadata).toMatchObject({ type: 'whale_buy' });
  });

  it('builds a funding-extreme payload', () => {
    const p = formatAlert('funding_extreme', { symbol: 'BTC', fundingRate: 0.08 });
    expect(p.title).toContain('BTC');
    expect(p.severity).toBeGreaterThanOrEqual(0);
    expect(p.severity).toBeLessThanOrEqual(100);
  });

  it('builds an oi-spike payload', () => {
    const p = formatAlert('oi_spike', { symbol: 'SOL', prevOi: 1_000_000, curOi: 1_500_000 });
    expect(p.title).toContain('SOL');
    expect(p.body).toContain('Open interest');
  });

  it('builds a sentiment-explosion payload', () => {
    const p = formatAlert('sentiment_explosion', sentiment({ keyword: 'pepe', isViral: true }));
    expect(p.title).toContain('pepe');
    expect(p.body).toContain('VIRAL');
  });

  it('builds a smart-money payload', () => {
    const entry = formatAlert('smart_money_entry', { symbol: 'ARB', netFlowUsd: 500_000 });
    const exit = formatAlert('smart_money_exit', { symbol: 'ARB', netFlowUsd: -500_000 });
    expect(entry.title).toContain('entering');
    expect(exit.title).toContain('exiting');
  });

  it('degrades gracefully for unknown types', () => {
    const p = formatAlert('mystery', { message: 'something happened' });
    expect(p.title).toBe('Alert: mystery');
    expect(p.body).toBe('something happened');
  });
});
