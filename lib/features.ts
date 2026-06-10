/**
 * Feature flags. Each flag is ON by default and can be disabled by setting the
 * corresponding env var to "false" (matching .env.example / DEPLOYMENT.md).
 */
export type FeatureFlag =
  | 'ENABLE_WHALE_TRACKING'
  | 'ENABLE_SMART_MONEY'
  | 'ENABLE_HYPERLIQUID'
  | 'ENABLE_BACKTESTING'
  | 'ENABLE_ALERTS';

export function featureEnabled(flag: FeatureFlag): boolean {
  return process.env[flag] !== 'false';
}
