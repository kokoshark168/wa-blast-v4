'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { BacktestMetrics } from '@/types';
import { apiGet, apiPost } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtPct, fmtPct01, fmtDateTime } from '@/components/ui/format';

const STRATEGIES = ['smart_money_copy', 'whale_follow', 'squeeze_momentum', 'alpha_breakout'];

interface BacktestRun {
  id: string;
  strategy: string;
  ranAt: number;
  metrics: BacktestMetrics;
  equityCurve: number[];
}

export function Backtesting() {
  const [strategy, setStrategy] = useState(STRATEGIES[0]);
  const [history, setHistory] = useState<BacktestRun[]>([]);
  const [selected, setSelected] = useState<BacktestRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<BacktestRun[]>('/api/backtest')
      .then((res) => {
        if (!active) return;
        const runs = res.data ?? [];
        setHistory(runs);
        setSelected(runs[0] ?? null);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await apiPost<BacktestRun>('/api/backtest', { strategy });
      const newRun = res.data;
      if (newRun) {
        setHistory((prev) => [newRun, ...prev]);
        setSelected(newRun);
      }
      setDegraded(!!res.degraded);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const m = selected?.metrics;
  const curve = (selected?.equityCurve ?? []).map((v, i) => ({ i, equity: v }));

  const historyColumns: Column<BacktestRun>[] = [
    { key: 'strategy', header: 'Strategy', render: (r) => <span className="font-medium">{r.strategy.replace(/_/g, ' ')}</span> },
    { key: 'ranAt', header: 'Ran At', render: (r) => <span className="text-xs text-gray-400">{fmtDateTime(r.ranAt)}</span> },
    { key: 'winRate', header: 'Win Rate', align: 'right', render: (r) => fmtPct01(r.metrics.winRate) },
    { key: 'sharpe', header: 'Sharpe', align: 'right', render: (r) => r.metrics.sharpeRatio.toFixed(2) },
    {
      key: 'cagr',
      header: 'CAGR',
      align: 'right',
      render: (r) => <span className={r.metrics.cagr >= 0 ? 'text-green-400' : 'text-red-400'}>{fmtPct(r.metrics.cagr)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Backtesting</h1>
          <p className="text-sm text-gray-400 mt-1">Strategy simulation & performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          >
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <button
            onClick={run}
            disabled={running}
            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded transition"
          >
            {running ? 'Running…' : 'Run Backtest'}
          </button>
        </div>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed: ${error}`} />}

      {loading ? (
        <Spinner label="Loading backtests…" />
      ) : (
        <>
          {m && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard label="Win Rate" value={fmtPct01(m.winRate)} />
              <StatCard label="Sharpe" value={m.sharpeRatio.toFixed(2)} deltaPositive={m.sharpeRatio >= 1} delta={m.sharpeRatio >= 1 ? 'good' : 'low'} />
              <StatCard label="Sortino" value={m.sortinoRatio.toFixed(2)} />
              <StatCard label="Max Drawdown" value={fmtPct(-Math.abs(m.maxDrawdown))} deltaPositive={false} />
              <StatCard label="CAGR" value={fmtPct(m.cagr)} delta={m.cagr} />
            </div>
          )}

          <Card title="Equity Curve" subtitle={selected ? selected.strategy.replace(/_/g, ' ') : undefined}>
            {curve.length === 0 ? (
              <p className="text-sm text-gray-500">Run a backtest to see the equity curve.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={curve}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                    <XAxis dataKey="i" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} />
                    <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #1f2937', fontSize: 12 }} />
                    <Line type="monotone" dataKey="equity" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <div>
            <h2 className="text-lg font-bold mb-3">Run History</h2>
            <DataTable
              columns={historyColumns}
              rows={history}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r)}
              dense
              emptyTitle="No backtests yet"
              emptyMessage="Run your first backtest to populate history."
            />
          </div>
        </>
      )}
    </div>
  );
}
