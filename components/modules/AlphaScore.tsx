'use client';

import React, { useEffect, useState } from 'react';
import type { AlphaScore as AlphaScoreType, AlphaRating, AlphaScoreComponents } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeColor } from '@/components/ui/Badge';
import { ScoreGauge, ScoreBar } from '@/components/ui/ScoreGauge';
import { DataTable, type Column } from '@/components/ui/DataTable';

const RATING_COLOR: Record<AlphaRating, BadgeColor> = {
  STRONG_OPPORTUNITY: 'green',
  WATCHLIST: 'cyan',
  NEUTRAL: 'gray',
  AVOID: 'red',
};

const COMPONENT_LABELS: Record<keyof AlphaScoreComponents, string> = {
  whaleActivity: 'Whale Activity',
  smartMoneyActivity: 'Smart Money',
  openInterest: 'Open Interest',
  funding: 'Funding',
  onChain: 'On-Chain',
  sentiment: 'Sentiment',
  volume: 'Volume',
};

interface AlphaResponse {
  score: AlphaScoreType;
  top: AlphaScoreType[];
}

function ratingLabel(r: AlphaRating): string {
  return r.replace(/_/g, ' ');
}

export function AlphaScore() {
  const [symbol, setSymbol] = useState('BTC');
  const [query, setQuery] = useState('BTC');
  const [data, setData] = useState<AlphaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<AlphaResponse>(`/api/alpha?symbol=${encodeURIComponent(query)}`)
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
  }, [query]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (symbol.trim()) setQuery(symbol.trim().toUpperCase());
  };

  const score = data?.score;

  const topColumns: Column<AlphaScoreType>[] = [
    { key: 'symbol', header: 'Symbol', render: (s) => <span className="font-semibold">{s.symbol}</span> },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      sortValue: (s) => s.score,
      render: (s) => <span className="font-bold text-cyan-300">{Math.round(s.score)}</span>,
    },
    { key: 'rating', header: 'Rating', render: (s) => <Badge color={RATING_COLOR[s.rating]}>{ratingLabel(s.rating)}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Alpha Score</h1>
        <p className="text-sm text-gray-400 mt-1">Composite opportunity score across 7 signal dimensions</p>
      </div>

      <form onSubmit={submit} className="flex gap-2 max-w-xs">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="symbol e.g. BTC"
          className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold px-4 py-2 rounded transition">
          Score
        </button>
      </form>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Computing alpha score…" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title={score ? `${score.symbol} Alpha` : 'Alpha'} className="lg:col-span-2">
            {!score ? (
              <DegradedBanner message={`No alpha score for "${query}".`} />
            ) : (
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                <div className="flex flex-col items-center">
                  <ScoreGauge value={score.score} size="lg" rating={ratingLabel(score.rating)} />
                  <Badge color={RATING_COLOR[score.rating]} className="mt-3">
                    {ratingLabel(score.rating)}
                  </Badge>
                </div>
                <div className="flex-1 w-full space-y-3">
                  <p className="text-sm text-gray-400">Component Breakdown</p>
                  {(Object.keys(COMPONENT_LABELS) as (keyof AlphaScoreComponents)[]).map((k) => (
                    <ScoreBar key={k} label={COMPONENT_LABELS[k]} value={score.components[k]} />
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div>
            <h2 className="text-lg font-bold mb-3">Top Symbols</h2>
            <DataTable
              columns={topColumns}
              rows={data?.top ?? []}
              rowKey={(s) => s.symbol}
              onRowClick={(s) => {
                setSymbol(s.symbol);
                setQuery(s.symbol);
              }}
              dense
              emptyTitle="No ranked symbols"
            />
          </div>
        </div>
      )}
    </div>
  );
}
