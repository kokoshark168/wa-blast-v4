'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import type { SentimentSignal } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';

interface SentimentResponse {
  signal: SentimentSignal;
  velocityHistory: number[];
  emergingTrends: string[];
}

function sentimentLabel(s: number): { label: string; color: 'green' | 'red' | 'yellow' } {
  if (s > 0.25) return { label: 'Bullish', color: 'green' };
  if (s < -0.25) return { label: 'Bearish', color: 'red' };
  return { label: 'Neutral', color: 'yellow' };
}

/** -1..1 sentiment gauge rendered as a horizontal diverging bar. */
function SentimentMeter({ score }: { score: number }) {
  const clamped = Math.max(-1, Math.min(1, score));
  const pct = ((clamped + 1) / 2) * 100;
  const { label, color } = sentimentLabel(clamped);
  const barColor = clamped >= 0 ? '#34d399' : '#f87171';
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Sentiment</span>
        <Badge color={color}>{label} {clamped.toFixed(2)}</Badge>
      </div>
      <div className="relative h-3 rounded-full bg-gray-800 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-full w-px bg-gray-600" />
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            backgroundColor: barColor,
            left: clamped >= 0 ? '50%' : `${pct}%`,
            width: `${Math.abs(pct - 50)}%`,
          }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>-1 bearish</span>
        <span>0</span>
        <span>+1 bullish</span>
      </div>
    </div>
  );
}

export function SocialSentiment() {
  const [keyword, setKeyword] = useState('bitcoin');
  const [query, setQuery] = useState('bitcoin');
  const [data, setData] = useState<SentimentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<SentimentResponse>(`/api/sentiment?keyword=${encodeURIComponent(query)}`)
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
    if (keyword.trim()) setQuery(keyword.trim());
  };

  const sig = data?.signal;
  const chartData = (data?.velocityHistory ?? []).map((v, i) => ({ i, v }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Social Sentiment</h1>
        <p className="text-sm text-gray-400 mt-1">Cross-platform narrative tracking</p>
      </div>

      <form onSubmit={submit} className="flex gap-2 max-w-md">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="keyword or ticker…"
          className="flex-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold px-4 py-2 rounded transition">
          Search
        </button>
      </form>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Analyzing sentiment…" />
      ) : !sig ? (
        <DegradedBanner message={`No sentiment data for "${query}".`} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Keyword" value={sig.keyword} hint={sig.platform} />
            <StatCard label="Mention Velocity" value={`${sig.mentionVelocity.toFixed(1)}/h`} delta={sig.trendAcceleration} />
            <div className="flex flex-wrap gap-2 items-center glass rounded-lg p-4">
              {sig.isNarrativeShift && <Badge color="purple">Narrative Shift</Badge>}
              {sig.isViral && <Badge color="orange">Viral</Badge>}
              {!sig.isNarrativeShift && !sig.isViral && <span className="text-sm text-gray-500">No special flags</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Sentiment Score">
              <SentimentMeter score={sig.sentimentScore} />
            </Card>

            <Card title="Mention Velocity">
              {chartData.length === 0 ? (
                <p className="text-sm text-gray-500">No velocity history.</p>
              ) : (
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <YAxis hide domain={['dataMin', 'dataMax']} />
                      <Tooltip
                        contentStyle={{ background: '#0a0a0a', border: '1px solid #1f2937', fontSize: 12 }}
                        labelFormatter={() => ''}
                      />
                      <Line type="monotone" dataKey="v" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card title="Emerging Trends">
            {!data?.emergingTrends || data.emergingTrends.length === 0 ? (
              <p className="text-sm text-gray-500">No emerging trends detected.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.emergingTrends.map((t, i) => (
                  <Badge key={i} color="cyan">
                    #{t}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
