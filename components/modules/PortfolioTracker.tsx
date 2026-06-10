'use client';

import React, { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtUsd, fmtPct, colorForValue } from '@/components/ui/format';

interface Holding {
  symbol: string;
  amount: number;
  valueUsd: number;
  costBasisUsd: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  sector: string;
  weight: number; // 0..1
}

interface SectorAllocation {
  sector: string;
  weight: number; // 0..1
}

interface RiskExposure {
  label: string;
  level: number; // 0..100
}

interface Portfolio {
  totalValueUsd: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdings: Holding[];
  sectorAllocation: SectorAllocation[];
  riskExposure: RiskExposure[];
  rebalancingSuggestions: string[];
  riskWarnings: string[];
}

const PIE_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#60a5fa', '#fb923c', '#f87171'];

export function PortfolioTracker() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<Portfolio>('/api/portfolio')
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
  }, []);

  const holdingColumns: Column<Holding>[] = [
    { key: 'symbol', header: 'Asset', render: (h) => <span className="font-semibold">{h.symbol}</span> },
    { key: 'sector', header: 'Sector', render: (h) => <Badge color="purple">{h.sector}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', render: (h) => h.amount.toLocaleString('en-US', { maximumFractionDigits: 4 }) },
    { key: 'value', header: 'Value', align: 'right', render: (h) => fmtUsd(h.valueUsd, { compact: true }) },
    { key: 'weight', header: 'Weight', align: 'right', render: (h) => `${(h.weight * 100).toFixed(1)}%` },
    {
      key: 'pnl',
      header: 'Unrealized PnL',
      align: 'right',
      render: (h) => (
        <span className={colorForValue(h.unrealizedPnl)}>
          {fmtUsd(h.unrealizedPnl, { compact: true })} <span className="text-xs">({fmtPct(h.unrealizedPnlPercent)})</span>
        </span>
      ),
    },
  ];

  const pieData = (data?.sectorAllocation ?? []).map((s) => ({ name: s.sector, value: Math.round(s.weight * 1000) / 10 }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Portfolio Tracker</h1>
        <p className="text-sm text-gray-400 mt-1">Holdings, allocation & risk</p>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading portfolio…" />
      ) : !data ? (
        <DegradedBanner message="No portfolio data available." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Value" value={fmtUsd(data.totalValueUsd, { compact: true })} />
            <StatCard label="Total PnL" value={fmtUsd(data.totalPnl, { compact: true })} delta={data.totalPnlPercent} />
            <StatCard label="Holdings" value={data.holdings.length} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card title="Sector Allocation">
              {pieData.length === 0 ? (
                <p className="text-sm text-gray-500">No allocation data.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: '#0a0a0a', border: '1px solid #1f2937', fontSize: 12 }}
                        formatter={(v: number) => `${v}%`}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Risk Exposure" className="lg:col-span-2">
              {data.riskExposure.length === 0 ? (
                <p className="text-sm text-gray-500">No risk data.</p>
              ) : (
                <div className="space-y-4">
                  {data.riskExposure.map((r) => {
                    const color = r.level >= 66 ? '#f87171' : r.level >= 33 ? '#facc15' : '#34d399';
                    return (
                      <div key={r.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-400">{r.label}</span>
                          <span className="font-mono" style={{ color }}>
                            {Math.round(r.level)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, r.level)}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Holdings</h2>
            <DataTable columns={holdingColumns} rows={data.holdings} rowKey={(h) => h.symbol} emptyTitle="No holdings" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Rebalancing Suggestions">
              {data.rebalancingSuggestions.length === 0 ? (
                <p className="text-sm text-gray-500">Portfolio is balanced.</p>
              ) : (
                <ul className="space-y-2">
                  {data.rebalancingSuggestions.map((s, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-300">
                      <span className="text-cyan-400">▹</span>
                      {s}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Risk Warnings">
              {data.riskWarnings.length === 0 ? (
                <p className="text-sm text-gray-500">No active warnings.</p>
              ) : (
                <ul className="space-y-2">
                  {data.riskWarnings.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm text-red-300">
                      <span>⚠</span>
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
