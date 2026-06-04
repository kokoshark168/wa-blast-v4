import { scoreToken, type TokenDiscoveryInput } from '@/lib/engines/tokenDiscovery';

function input(over: Partial<TokenDiscoveryInput>): TokenDiscoveryInput {
  return {
    symbol: 'GEM',
    address: '0xgem',
    chain: 'ethereum',
    volumeGrowth: 0,
    walletGrowth: 0,
    smartMoneyBuying: 0,
    socialGrowth: 0,
    liquidityGrowth: 0,
    ...over,
  };
}

describe('tokenDiscovery.scoreToken', () => {
  it('keeps all scores within 0..100', () => {
    const res = scoreToken(
      input({
        volumeGrowth: 5,
        walletGrowth: 5,
        smartMoneyBuying: 5,
        socialGrowth: 5,
        liquidityGrowth: 5,
      }),
    );
    for (const s of [res.earlyGemScore, res.riskScore, res.momentumScore]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
  });

  it('gives a higher gem score for stronger organic growth', () => {
    const low = scoreToken(input({ walletGrowth: 0.1, smartMoneyBuying: 0.1, liquidityGrowth: 0.1 }));
    const high = scoreToken(input({ walletGrowth: 2, smartMoneyBuying: 2, liquidityGrowth: 2 }));
    expect(high.earlyGemScore).toBeGreaterThan(low.earlyGemScore);
  });

  it('scores risk high when social hype outruns liquidity', () => {
    const pumpy = scoreToken(input({ socialGrowth: 3, liquidityGrowth: 0 }));
    const healthy = scoreToken(input({ socialGrowth: 1, liquidityGrowth: 3 }));
    expect(pumpy.riskScore).toBeGreaterThan(healthy.riskScore);
  });

  it('drives momentum from volume and social', () => {
    const hot = scoreToken(input({ volumeGrowth: 3, socialGrowth: 3 }));
    const cold = scoreToken(input({ volumeGrowth: 0, socialGrowth: 0 }));
    expect(hot.momentumScore).toBeGreaterThan(cold.momentumScore);
  });

  it('echoes identity and raw inputs', () => {
    const res = scoreToken(input({ symbol: 'PEPE', volumeGrowth: 0.5 }));
    expect(res.symbol).toBe('PEPE');
    expect(res.volumeGrowth).toBe(0.5);
    expect(res.chain).toBe('ethereum');
  });
});
