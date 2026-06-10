'use client';

import React, { useEffect, useState } from 'react';
import type { LiquidationHeatmap as Heatmap, LiquidationLevel } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { fmtUsd } from '@/components/ui/format';

const SYMBOLS = ['BTC', 'ETH', 'SOL'];
const REFRESH_MS = 60_000;

function barColor(side: 'long' | 'short', intensity: number): string {
  const a = 0.25 + Math.min(1, Math.max(0, intensity)) * 0.75;
  return side === 'long' ? `rgba(248,113,113,${a})` : `rgba(52,211,153,${a})`;
}

function isMagnet(price: number, magnets: number[]): boolean {
  return magnets.some((m) => Math.abs(m - price) / (price || 1) < 0.0005);
}

export function LiquidationHeatmap() {
  const [symbol, setSymbol] = useState('BTC');
  const [data, setData] = useState<Heatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      apiGet<Heatmap>(`/api/liquidations?symbol=${symbol}`)
        .then((res) => {
          if (!active) return;
          setData(res.data ?? null);
          setDegraded(!!res.degraded);
          setError(null);
        })
        .catch((e: Error) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    };
    load(true);
    const id = setInterval(() => load(false), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [symbol]);

  const levels: LiquidationLevel[] = data ? [...data.levels].sort((a, b) => b.price - a.price) : [];
  const maxNotional = levels.reduce((m, l) => Math.max(m, l.notional), 0) || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Liquidation Heatmap</h1>
          <p className="text-sm text-gray-400 mt-1">Clustered liquidation levels · auto-refresh 60s</p>
        </div>
        <Tabs options={SYMBOLS.map((s) => ({ value: s, label: s }))} value={symbol} onChange={setSymbol} />
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading liquidation map…" />
      ) : !data || levels.length === 0 ? (
        <EmptyState title="No liquidation clusters" message="No significant liquidation levels for this symbol." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card title={`${data.symbol} Levels`} className="lg:col-span-2">
            <div className="flex items-center gap-4 mb-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(248,113,113,0.8)' }} /> Long liqs
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: 'rgba(52,211,153,0.8)' }} /> Short liqs
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-cyan-400" /> Magnet level
              </span>
            </div>
            <div className="space-y-1">
              {levels.map((lvl, i) => {
                const magnet = isMagnet(lvl.price, data.magnetLevels);
                const widthPct = (lvl.notional / maxNotional) * 100;
                return (
                  <div key={`${lvl.price}-${i}`} className="flex items-center gap-2">
                    <span
                      className={`w-24 text-right text-xs font-mono ${magnet ? 'text-cyan-300 font-bold' : 'text-gray-400'}`}
                    >
                      {magnet && '★ '}
                      {fmtUsd(lvl.price)}
                    </span>
                    <div className="flex-1 h-5 bg-gray-900/60 rounded-sm overflow-hidden relative">
                      <div
                        className="h-full rounded-sm"
                        style={{
                          width: `${Math.max(2, widthPct)}%`,
                          background: barColor(lvl.side, lvl.intensity),
                          outline: magnet ? '1px solid rgba(34,211,238,0.7)' : 'none',
                        }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs text-gray-500 font-mono">
                      {fmtUsd(lvl.notional, { compact: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-6">
            <Card title="Magnet Levels">
              {data.magnetLevels.length === 0 ? (
                <p className="text-sm text-gray-500">None detected.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.magnetLevels.map((m, i) => (
                    <Badge key={i} color="cyan">
                      {fmtUsd(m)}
                    </Badge>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Stop-Hunt Zones">
              {data.stopHuntZones.length === 0 ? (
                <p className="text-sm text-gray-500">None detected.</p>
              ) : (
                <ul className="space-y-2">
                  {data.stopHuntZones.map((z, i) => (
                    <li key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Zone {i + 1}</span>
                      <span className="font-mono text-orange-300">
                        {fmtUsd(z.low)} – {fmtUsd(z.high)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
