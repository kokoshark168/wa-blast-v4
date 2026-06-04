'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { RankedWallet } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Tabs } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtPct, fmtPct01, fmtUsd, shortAddr, colorForValue } from '@/components/ui/format';

type Window = '7D' | '30D' | '90D';
const WINDOW_QUERY: Record<Window, string> = { '7D': '7d', '30D': '30d', '90D': '90d' };

function perfFor(w: RankedWallet, win: Window): number {
  return win === '7D' ? w.performance7d : win === '30D' ? w.performance30d : w.performance90d;
}

export function SmartMoneyTracker() {
  const [win, setWin] = useState<Window>('30D');
  const [wallets, setWallets] = useState<RankedWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState('perf');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<RankedWallet[]>(`/api/smart-money?by=${WINDOW_QUERY[win]}`)
      .then((res) => {
        if (!active) return;
        setWallets(res.data ?? []);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [win]);

  const sorted = useMemo(() => {
    const accessor: Record<string, (w: RankedWallet) => number> = {
      perf: (w) => perfFor(w, win),
      roi: (w) => w.roi,
      winRate: (w) => w.winRate,
      profitFactor: (w) => w.profitFactor,
      riskScore: (w) => w.riskScore,
    };
    const fn = accessor[sortKey] ?? accessor.perf;
    return [...wallets].sort((a, b) => (sortDir === 'asc' ? fn(a) - fn(b) : fn(b) - fn(a)));
  }, [wallets, sortKey, sortDir, win]);

  const onSort = (key: string) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const columns: Column<RankedWallet>[] = [
    {
      key: 'wallet',
      header: 'Wallet',
      render: (w) => (
        <div>
          <p className="font-medium">{w.name || shortAddr(w.address)}</p>
          <p className="text-xs text-gray-500 font-mono">{shortAddr(w.address)}</p>
        </div>
      ),
    },
    { key: 'chain', header: 'Chain', render: (w) => <Badge color="purple">{w.chain}</Badge> },
    {
      key: 'perf',
      header: `Perf ${win}`,
      align: 'right',
      sortValue: (w) => perfFor(w, win),
      render: (w) => <span className={colorForValue(perfFor(w, win))}>{fmtPct(perfFor(w, win))}</span>,
    },
    {
      key: 'roi',
      header: 'ROI',
      align: 'right',
      sortValue: (w) => w.roi,
      render: (w) => <span className={colorForValue(w.roi)}>{fmtPct(w.roi)}</span>,
    },
    {
      key: 'winRate',
      header: 'Win Rate',
      align: 'right',
      sortValue: (w) => w.winRate,
      render: (w) => fmtPct01(w.winRate),
    },
    {
      key: 'profitFactor',
      header: 'Profit Factor',
      align: 'right',
      sortValue: (w) => w.profitFactor,
      render: (w) => w.profitFactor.toFixed(2),
    },
    {
      key: 'realizedPnl',
      header: 'Realized PnL',
      align: 'right',
      render: (w) => <span className={colorForValue(w.realizedPnl)}>{fmtUsd(w.realizedPnl, { compact: true })}</span>,
    },
    {
      key: 'riskScore',
      header: 'Risk',
      align: 'right',
      sortValue: (w) => w.riskScore,
      render: (w) => {
        const color = w.riskScore >= 66 ? 'red' : w.riskScore >= 33 ? 'yellow' : 'green';
        return <Badge color={color}>{Math.round(w.riskScore)}</Badge>;
      },
    },
    { key: 'trades', header: 'Trades', align: 'right', render: (w) => w.totalTrades },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Smart Money Tracker</h1>
          <p className="text-sm text-gray-400 mt-1">Ranked performance of tracked wallets</p>
        </div>
        <Tabs
          options={[
            { value: '7D', label: '7D' },
            { value: '30D', label: '30D' },
            { value: '90D', label: '90D' },
          ]}
          value={win}
          onChange={setWin}
        />
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading ranked wallets…" />
      ) : (
        <DataTable
          columns={columns}
          rows={sorted}
          rowKey={(w) => w.address}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={onSort}
          emptyTitle="No ranked wallets"
          emptyMessage="No smart-money wallets matched this window."
        />
      )}
    </div>
  );
}
