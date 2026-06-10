'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { TokenScore } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ScoreBar } from '@/components/ui/ScoreGauge';
import { fmtPct, shortAddr } from '@/components/ui/format';

type SortKey = 'earlyGemScore' | 'riskScore' | 'momentumScore';

export function TokenDiscovery() {
  const [tokens, setTokens] = useState<TokenScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('earlyGemScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let active = true;
    apiGet<TokenScore[]>('/api/tokens/discover')
      .then((res) => {
        if (!active) return;
        setTokens(res.data ?? []);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const sorted = useMemo(
    () => [...tokens].sort((a, b) => (sortDir === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy])),
    [tokens, sortBy, sortDir]
  );

  const onSort = (key: string) => {
    const k = key as SortKey;
    if (k === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(k);
      setSortDir('desc');
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
    {
      key: 'earlyGemScore',
      header: 'Early Gem',
      align: 'right',
      sortValue: (t) => t.earlyGemScore,
      render: (t) => <ScoreCell value={t.earlyGemScore} />,
    },
    {
      key: 'momentumScore',
      header: 'Momentum',
      align: 'right',
      sortValue: (t) => t.momentumScore,
      render: (t) => <ScoreCell value={t.momentumScore} />,
    },
    {
      key: 'riskScore',
      header: 'Risk',
      align: 'right',
      sortValue: (t) => t.riskScore,
      render: (t) => <ScoreCell value={t.riskScore} invert />,
    },
    { key: 'volumeGrowth', header: 'Vol Growth', align: 'right', render: (t) => fmtPct(t.volumeGrowth) },
    { key: 'walletGrowth', header: 'Wallet Growth', align: 'right', render: (t) => fmtPct(t.walletGrowth) },
    { key: 'smartMoney', header: 'Smart Buys', align: 'right', render: (t) => t.smartMoneyBuying },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Token Discovery</h1>
          <p className="text-sm text-gray-400 mt-1">Early-stage opportunity scoring</p>
        </div>
        <Tabs
          options={[
            { value: 'earlyGemScore', label: 'Early Gem' },
            { value: 'momentumScore', label: 'Momentum' },
            { value: 'riskScore', label: 'Risk' },
          ]}
          value={sortBy}
          onChange={(v) => {
            setSortBy(v);
            setSortDir('desc');
          }}
        />
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Discovering tokens…" />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(t) => t.address}
          sortKey={sortBy}
          sortDir={sortDir}
          onSort={onSort}
          emptyTitle="No tokens discovered"
          emptyMessage="No tokens currently meet discovery thresholds."
        />
      )}
    </div>
  );
}

function ScoreCell({ value, invert }: { value: number; invert?: boolean }) {
  return (
    <div className="w-28 ml-auto">
      <ScoreBar value={value} label="" invert={invert} />
    </div>
  );
}
