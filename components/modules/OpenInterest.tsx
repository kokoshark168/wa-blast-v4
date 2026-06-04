'use client';

import React, { useEffect, useState } from 'react';
import type { OpenInterestSnapshot, SqueezeSignal, SqueezeType } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, type BadgeColor } from '@/components/ui/Badge';
import { ScoreGauge } from '@/components/ui/ScoreGauge';
import { Tabs } from '@/components/ui/Tabs';
import { fmtUsd, fmtPct, fmtNum } from '@/components/ui/format';

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE', 'DOGE'];

interface OiResponse {
  snapshot: OpenInterestSnapshot;
  squeeze: SqueezeSignal;
}

const SQUEEZE_COLOR: Record<SqueezeType, BadgeColor> = {
  SHORT_SQUEEZE: 'green',
  LONG_SQUEEZE: 'red',
  CROWDED: 'orange',
  EXHAUSTION: 'yellow',
  NEUTRAL: 'gray',
};

export function OpenInterest() {
  const [symbol, setSymbol] = useState('BTC');
  const [data, setData] = useState<OiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<OiResponse>(`/api/open-interest?symbol=${symbol}`)
      .then((res) => {
        if (!active) return;
        setData(res.data ?? null);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [symbol]);

  const snap = data?.snapshot;
  const squeeze = data?.squeeze;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Open Interest</h1>
          <p className="text-sm text-gray-400 mt-1">OI, funding & long/short positioning</p>
        </div>
        <Tabs
          options={SYMBOLS.map((s) => ({ value: s, label: s }))}
          value={symbol}
          onChange={setSymbol}
        />
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading open interest…" />
      ) : !snap ? (
        <DegradedBanner message="No open-interest data available for this symbol." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Open Interest (USD)" value={fmtUsd(snap.openInterestUsd, { compact: true })} hint={snap.exchange} />
            <StatCard label="Open Interest (units)" value={fmtNum(snap.openInterest, { compact: true })} />
            <StatCard
              label="Funding Rate"
              value={fmtPct(snap.fundingRate * 100, 4)}
              delta={snap.fundingRate >= 0 ? 'longs pay' : 'shorts pay'}
              deltaPositive={snap.fundingRate < 0}
            />
            <StatCard
              label="Long / Short Ratio"
              value={snap.longShortRatio.toFixed(2)}
              delta={snap.longShortRatio >= 1 ? 'long-heavy' : 'short-heavy'}
              deltaPositive={snap.longShortRatio >= 1}
            />
          </div>

          {squeeze && (
            <Card title="Squeeze Signal" actions={<Badge color={SQUEEZE_COLOR[squeeze.type]}>{squeeze.type.replace(/_/g, ' ')}</Badge>}>
              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                <ScoreGauge value={squeeze.probability} label="Probability" rating={squeeze.type.replace(/_/g, ' ')} />
                <div className="flex-1 w-full">
                  <p className="text-sm text-gray-400 mb-2">Rationale</p>
                  {squeeze.rationale.length === 0 ? (
                    <p className="text-sm text-gray-500">No supporting signals.</p>
                  ) : (
                    <ul className="space-y-2">
                      {squeeze.rationale.map((r, i) => (
                        <li key={i} className="flex gap-2 text-sm text-gray-300">
                          <span className="text-cyan-400">▹</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
