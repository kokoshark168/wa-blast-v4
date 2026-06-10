'use client';

import React, { useEffect, useState } from 'react';
import type { OnChainSignal } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtNum } from '@/components/ui/format';

const METRIC_LABELS: Record<OnChainSignal['metricType'], string> = {
  NEW_WALLETS: 'New Wallets',
  LARGE_TRANSFER: 'Large Transfers',
  EXCHANGE_RESERVE: 'Exchange Reserves',
  STABLE_INFLOW: 'Stablecoin Inflow',
  STABLE_OUTFLOW: 'Stablecoin Outflow',
};

function impact(v: number): { label: string; color: 'green' | 'red' | 'yellow'; arrow: string } {
  if (v > 0.15) return { label: 'Bullish', color: 'green', arrow: '▲' };
  if (v < -0.15) return { label: 'Bearish', color: 'red', arrow: '▼' };
  return { label: 'Neutral', color: 'yellow', arrow: '▬' };
}

export function OnChainIntelligence() {
  const [signals, setSignals] = useState<OnChainSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<OnChainSignal[]>('/api/onchain')
      .then((res) => {
        if (!active) return;
        setSignals(res.data ?? []);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">On-Chain Intelligence</h1>
        <p className="text-sm text-gray-400 mt-1">Network flow metrics & market-impact estimates</p>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading on-chain metrics…" />
      ) : signals.length === 0 ? (
        <EmptyState title="No on-chain signals" message="No notable on-chain activity detected." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((s, i) => {
            const imp = impact(s.marketImpactEstimate);
            return (
              <Card key={`${s.chain}-${s.metricType}-${i}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-400">{METRIC_LABELS[s.metricType]}</p>
                    <p className="text-2xl font-bold mt-1">{fmtNum(s.value, { compact: true })}</p>
                  </div>
                  <Badge color="purple">{s.chain}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <Badge color={imp.color}>
                    {imp.arrow} {imp.label}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    impact {s.marketImpactEstimate >= 0 ? '+' : ''}
                    {s.marketImpactEstimate.toFixed(2)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
