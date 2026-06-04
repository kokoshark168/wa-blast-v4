import {
  buildHeatmap,
  liquidationPrice,
  type LiquidationPosition,
} from '@/lib/engines/liquidation';

describe('liquidation.liquidationPrice', () => {
  it('computes the long liquidation below entry', () => {
    // 10x long at 100 => 100 * (1 - 0.1) = 90
    expect(
      liquidationPrice({ entryPrice: 100, leverage: 10, side: 'long', notionalUsd: 1000 }),
    ).toBeCloseTo(90, 6);
  });
  it('computes the short liquidation above entry', () => {
    // 10x short at 100 => 100 * (1 + 0.1) = 110
    expect(
      liquidationPrice({ entryPrice: 100, leverage: 10, side: 'short', notionalUsd: 1000 }),
    ).toBeCloseTo(110, 6);
  });
  it('handles 1x leverage (long liquidates at 0)', () => {
    expect(
      liquidationPrice({ entryPrice: 100, leverage: 1, side: 'long', notionalUsd: 1000 }),
    ).toBeCloseTo(0, 6);
  });
});

describe('liquidation.buildHeatmap', () => {
  const positions: LiquidationPosition[] = [
    { entryPrice: 100, leverage: 10, side: 'long', notionalUsd: 1_000_000 },
    { entryPrice: 100, leverage: 5, side: 'long', notionalUsd: 500_000 },
    { entryPrice: 100, leverage: 10, side: 'short', notionalUsd: 800_000 },
    { entryPrice: 100, leverage: 20, side: 'long', notionalUsd: 2_000_000 },
  ];

  it('produces levels for the open positions', () => {
    const hm = buildHeatmap('BTC', 100, positions);
    expect(hm.symbol).toBe('BTC');
    expect(hm.levels.length).toBeGreaterThan(0);
    for (const lvl of hm.levels) {
      expect(lvl.intensity).toBeGreaterThanOrEqual(0);
      expect(lvl.intensity).toBeLessThanOrEqual(1);
      expect(lvl.price).toBeGreaterThan(0);
    }
  });

  it('surfaces magnet levels (heaviest clusters)', () => {
    const hm = buildHeatmap('BTC', 100, positions);
    expect(hm.magnetLevels.length).toBeGreaterThan(0);
    // magnet levels are sorted ascending
    const sorted = [...hm.magnetLevels].sort((a, b) => a - b);
    expect(hm.magnetLevels).toEqual(sorted);
  });

  it('returns empty structures when there are no positions', () => {
    const hm = buildHeatmap('BTC', 100, []);
    expect(hm.levels).toEqual([]);
    expect(hm.magnetLevels).toEqual([]);
    expect(hm.stopHuntZones).toEqual([]);
  });

  it('normalizes the peak-intensity level to 1', () => {
    const hm = buildHeatmap('BTC', 100, positions);
    const maxIntensity = Math.max(...hm.levels.map((l) => l.intensity));
    expect(maxIntensity).toBeCloseTo(1, 6);
  });
});
