import { estimateMarketImpact } from '@/lib/engines/onchain';
import type { OnChainSignal } from '@/types';

function base(over: Partial<Omit<OnChainSignal, 'marketImpactEstimate'>>): Omit<
  OnChainSignal,
  'marketImpactEstimate'
> {
  return {
    chain: 'ethereum',
    metricType: 'NEW_WALLETS',
    value: 0,
    timestamp: 0,
    ...over,
  };
}

describe('onchain.estimateMarketImpact', () => {
  it('keeps impact within [-1, 1] for any input scale', () => {
    const huge = estimateMarketImpact(base({ metricType: 'LARGE_TRANSFER', value: 1e12 }));
    const tiny = estimateMarketImpact(base({ metricType: 'LARGE_TRANSFER', value: -1e12 }));
    expect(huge.marketImpactEstimate).toBeGreaterThanOrEqual(-1);
    expect(huge.marketImpactEstimate).toBeLessThanOrEqual(1);
    expect(tiny.marketImpactEstimate).toBeGreaterThanOrEqual(-1);
    expect(tiny.marketImpactEstimate).toBeLessThanOrEqual(1);
  });

  it('NEW_WALLETS: more wallets => bullish', () => {
    const res = estimateMarketImpact(base({ metricType: 'NEW_WALLETS', value: 5000 }));
    expect(res.marketImpactEstimate).toBeGreaterThan(0);
  });

  it('STABLE_INFLOW => bullish', () => {
    const res = estimateMarketImpact(base({ metricType: 'STABLE_INFLOW', value: 100_000_000 }));
    expect(res.marketImpactEstimate).toBeGreaterThan(0);
  });

  it('STABLE_OUTFLOW => bearish regardless of value sign', () => {
    const pos = estimateMarketImpact(base({ metricType: 'STABLE_OUTFLOW', value: 100_000_000 }));
    const neg = estimateMarketImpact(base({ metricType: 'STABLE_OUTFLOW', value: -100_000_000 }));
    expect(pos.marketImpactEstimate).toBeLessThan(0);
    expect(neg.marketImpactEstimate).toBeLessThanOrEqual(0);
  });

  it('EXCHANGE_RESERVE: a reserve drop (negative value) => bullish', () => {
    const drop = estimateMarketImpact(base({ metricType: 'EXCHANGE_RESERVE', value: -50_000_000 }));
    const rise = estimateMarketImpact(base({ metricType: 'EXCHANGE_RESERVE', value: 50_000_000 }));
    expect(drop.marketImpactEstimate).toBeGreaterThan(0);
    expect(rise.marketImpactEstimate).toBeLessThan(0);
  });

  it('LARGE_TRANSFER: to-exchange (positive) => bearish, from-exchange (negative) => bullish', () => {
    const toEx = estimateMarketImpact(base({ metricType: 'LARGE_TRANSFER', value: 20_000_000 }));
    const fromEx = estimateMarketImpact(base({ metricType: 'LARGE_TRANSFER', value: -20_000_000 }));
    expect(toEx.marketImpactEstimate).toBeLessThan(0);
    expect(fromEx.marketImpactEstimate).toBeGreaterThan(0);
  });

  it('echoes the source signal fields', () => {
    const res = estimateMarketImpact(base({ metricType: 'NEW_WALLETS', value: 1000, chain: 'solana' }));
    expect(res.chain).toBe('solana');
    expect(res.value).toBe(1000);
    expect(res.metricType).toBe('NEW_WALLETS');
  });
});
