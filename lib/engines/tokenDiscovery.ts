/**
 * Token Discovery engine — turns growth signals for a new/low-cap token into
 * earlyGem / risk / momentum scores (all 0..100). Pure & deterministic.
 */
import type { Chain, TokenScore } from '@/types';
import { clamp, normalize, weightedAverage } from '@/lib/quant';

/**
 * Raw growth inputs. Each `*Growth`/`*Buying` is a growth rate where 0 = flat,
 * 1 = +100%. They're normalized into 0..100 before blending.
 */
export interface TokenDiscoveryInput {
  symbol: string;
  address: string;
  chain: Chain;
  /** Trading volume growth rate (e.g. 0.5 = +50%). */
  volumeGrowth: number;
  /** Holder/wallet count growth rate. */
  walletGrowth: number;
  /** Smart-money net buying intensity (e.g. 0.3 = strong inflow). */
  smartMoneyBuying: number;
  /** Social mention growth rate. */
  socialGrowth: number;
  /** Pool liquidity growth rate. */
  liquidityGrowth: number;
}

// Normalization ranges: a growth rate of +300% maps to the top of the scale.
const GROWTH_LO = 0;
const GROWTH_HI = 3;

/**
 * Score a token across three lenses (each 0..100):
 *
 * - earlyGemScore: weighted blend emphasizing organic adoption + real liquidity.
 *   weights — wallet .30, smartMoney .30, liquidity .20, volume .12, social .08
 *   (sums to 1.0). Wallet + smart money dominate because they're hardest to fake.
 * - riskScore: high when social is hot but liquidity is thin (pump-and-dump
 *   profile). risk = 0.6 * socialHeat * (1 - liquidityStrength) + 0.4 * thinLiquidity.
 * - momentumScore: short-term heat = volume .6 + social .4.
 */
export function scoreToken(input: TokenDiscoveryInput): TokenScore {
  const volume = normalize(input.volumeGrowth, GROWTH_LO, GROWTH_HI);
  const wallet = normalize(input.walletGrowth, GROWTH_LO, GROWTH_HI);
  const smart = normalize(input.smartMoneyBuying, GROWTH_LO, GROWTH_HI);
  const social = normalize(input.socialGrowth, GROWTH_LO, GROWTH_HI);
  const liquidity = normalize(input.liquidityGrowth, GROWTH_LO, GROWTH_HI);

  const earlyGemScore = clamp(
    weightedAverage([
      { value: wallet, weight: 0.3 },
      { value: smart, weight: 0.3 },
      { value: liquidity, weight: 0.2 },
      { value: volume, weight: 0.12 },
      { value: social, weight: 0.08 },
    ]),
  );

  // Risk rises when hype (social) outruns liquidity depth.
  const liquidityStrength = liquidity / 100; // 0..1
  const socialHeat = social / 100; // 0..1
  const thinLiquidity = (100 - liquidity); // 0..100, higher = thinner
  const riskScore = clamp(
    0.6 * socialHeat * (1 - liquidityStrength) * 100 + 0.4 * thinLiquidity,
  );

  const momentumScore = clamp(
    weightedAverage([
      { value: volume, weight: 0.6 },
      { value: social, weight: 0.4 },
    ]),
  );

  return {
    symbol: input.symbol,
    address: input.address,
    chain: input.chain,
    earlyGemScore,
    riskScore,
    momentumScore,
    volumeGrowth: input.volumeGrowth,
    walletGrowth: input.walletGrowth,
    smartMoneyBuying: input.smartMoneyBuying,
    socialGrowth: input.socialGrowth,
    liquidityGrowth: input.liquidityGrowth,
  };
}
