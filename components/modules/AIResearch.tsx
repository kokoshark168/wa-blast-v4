'use client';

import React, { useEffect, useState } from 'react';
import type { MarketReport, ReportPeriod } from '@/types';
import { apiGet, apiPost } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtUsd, fmtDateTime } from '@/components/ui/format';

function FactorList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">None.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-300">
              <span style={{ color }}>▹</span>
              {f}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AIResearch() {
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [report, setReport] = useState<MarketReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    setError(null);
    return apiGet<MarketReport>(`/api/reports?period=${period}`)
      .then((res) => {
        setReport(res.data ?? null);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGet<MarketReport>(`/api/reports?period=${period}`)
      .then((res) => {
        if (!active) return;
        setReport(res.data ?? null);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [period]);

  const regenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await apiPost<MarketReport>('/api/reports', { period });
      setReport(res.data ?? null);
      setDegraded(!!res.degraded);
    } catch (e) {
      setError((e as Error).message);
      await load(false);
    } finally {
      setRegenerating(false);
    }
  };

  const levelColumns: Column<MarketReport['keyLevels'][number]>[] = [
    { key: 'symbol', header: 'Symbol', render: (l) => <span className="font-semibold">{l.symbol}</span> },
    { key: 'support', header: 'Support', align: 'right', render: (l) => <span className="text-green-400">{fmtUsd(l.support)}</span> },
    { key: 'resistance', header: 'Resistance', align: 'right', render: (l) => <span className="text-red-400">{fmtUsd(l.resistance)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">AI Research</h1>
          <p className="text-sm text-gray-400 mt-1">
            Automated market reports{report ? ` · generated ${fmtDateTime(report.generatedAt)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs
            options={[
              { value: 'hourly', label: 'Hourly' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <button
            onClick={regenerate}
            disabled={regenerating}
            className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded transition"
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed: ${error}`} />}

      {loading ? (
        <Spinner label="Loading report…" />
      ) : !report ? (
        <DegradedBanner message="No report available for this period." />
      ) : (
        <>
          <Card title="Summary">
            <p className="text-gray-300 leading-relaxed whitespace-pre-line">{report.summary}</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <FactorList title="Bullish Factors" items={report.bullishFactors} color="#34d399" />
            <FactorList title="Bearish Factors" items={report.bearishFactors} color="#f87171" />
            <FactorList title="Risk Factors" items={report.riskFactors} color="#facc15" />
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Key Levels</h2>
            <DataTable
              columns={levelColumns}
              rows={report.keyLevels}
              rowKey={(l) => l.symbol}
              emptyTitle="No key levels"
            />
          </div>
        </>
      )}
    </div>
  );
}
