'use client';

import React, { useState } from 'react';
import type { ScreenerFilters, TokenScore } from '@/types';
import { apiPost } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ScoreBar } from '@/components/ui/ScoreGauge';
import { fmtPct, shortAddr } from '@/components/ui/format';

interface FormState {
  minMarketCap: string;
  maxMarketCap: string;
  minLiquidity: string;
  minVolume: string;
  minSmartMoneyActivity: string;
  minAlphaScore: string;
  narrative: string;
}

const EMPTY: FormState = {
  minMarketCap: '',
  maxMarketCap: '',
  minLiquidity: '',
  minVolume: '',
  minSmartMoneyActivity: '',
  minAlphaScore: '',
  narrative: '',
};

function toNum(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function Screener() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [results, setResults] = useState<TokenScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const buildFilters = (): ScreenerFilters => ({
    minMarketCap: toNum(form.minMarketCap),
    maxMarketCap: toNum(form.maxMarketCap),
    minLiquidity: toNum(form.minLiquidity),
    minVolume: toNum(form.minVolume),
    minSmartMoneyActivity: toNum(form.minSmartMoneyActivity),
    minAlphaScore: toNum(form.minAlphaScore),
    narrative: form.narrative.trim() || undefined,
  });

  const runScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRan(true);
    try {
      const res = await apiPost<TokenScore[]>('/api/screener', buildFilters());
      setResults(res.data ?? []);
      setDegraded(!!res.degraded);
    } catch (err) {
      setError((err as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const saveScreener = async () => {
    try {
      await apiPost('/api/screener', { ...buildFilters(), save: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const columns: Column<TokenScore>[] = [
    {
      key: 'symbol',
      header: 'Token',
      render: (t) => (
        <div>
          <p className="font-semibold">{t.symbol}</p>
          <p className="text-xs text-gray-500 font-mono">{shortAddr(t.address)}</p>
        </div>
      ),
    },
    { key: 'chain', header: 'Chain', render: (t) => <Badge color="purple">{t.chain}</Badge> },
    { key: 'gem', header: 'Early Gem', align: 'right', sortValue: (t) => t.earlyGemScore, render: (t) => <div className="w-24 ml-auto"><ScoreBar value={t.earlyGemScore} label="" /></div> },
    { key: 'momentum', header: 'Momentum', align: 'right', render: (t) => <div className="w-24 ml-auto"><ScoreBar value={t.momentumScore} label="" /></div> },
    { key: 'smart', header: 'Smart Buys', align: 'right', render: (t) => t.smartMoneyBuying },
    { key: 'vol', header: 'Vol Growth', align: 'right', render: (t) => fmtPct(t.volumeGrowth) },
  ];

  const fields: { key: keyof FormState; label: string; placeholder: string }[] = [
    { key: 'minMarketCap', label: 'Min Market Cap ($)', placeholder: 'e.g. 1000000' },
    { key: 'maxMarketCap', label: 'Max Market Cap ($)', placeholder: 'e.g. 100000000' },
    { key: 'minLiquidity', label: 'Min Liquidity ($)', placeholder: 'e.g. 250000' },
    { key: 'minVolume', label: 'Min 24h Volume ($)', placeholder: 'e.g. 500000' },
    { key: 'minSmartMoneyActivity', label: 'Min Smart Money Buys', placeholder: 'e.g. 3' },
    { key: 'minAlphaScore', label: 'Min Alpha Score', placeholder: '0-100' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Screener</h1>
        <p className="text-sm text-gray-400 mt-1">Filter tokens by fundamentals & alpha signals</p>
      </div>

      <Card title="Filters">
        <form onSubmit={runScreen} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className="text-xs text-gray-400">{f.label}</span>
                <input
                  type="number"
                  value={form[f.key]}
                  onChange={set(f.key)}
                  placeholder={f.placeholder}
                  className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-xs text-gray-400">Narrative</span>
              <input
                value={form.narrative}
                onChange={set('narrative')}
                placeholder="e.g. AI, DePIN, RWA"
                className="mt-1 w-full bg-gray-900 border border-gray-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              />
            </label>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black font-semibold px-4 py-2 rounded transition">
              {loading ? 'Screening…' : 'Run Screen'}
            </button>
            <button type="button" onClick={saveScreener} className="border border-gray-700 hover:border-cyan-500 text-gray-200 px-4 py-2 rounded transition">
              {saved ? 'Saved ✓' : 'Save Screener'}
            </button>
            <button type="button" onClick={() => setForm(EMPTY)} className="text-gray-400 hover:text-white px-4 py-2 rounded transition">
              Reset
            </button>
          </div>
        </form>
      </Card>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed: ${error}`} />}

      {loading ? (
        <Spinner label="Running screen…" />
      ) : ran ? (
        <DataTable
          columns={columns}
          rows={results}
          rowKey={(t) => t.address}
          emptyTitle="No matches"
          emptyMessage="No tokens matched your filters. Try loosening the criteria."
        />
      ) : (
        <p className="text-sm text-gray-500">Set filters and run a screen to see results.</p>
      )}
    </div>
  );
}
