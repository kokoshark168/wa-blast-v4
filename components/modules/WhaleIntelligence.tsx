'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { WhaleTransaction, WhaleTier, WhaleClassification, WsMessage } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Tabs } from '@/components/ui/Tabs';
import { Badge, type BadgeColor } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtUsd, fmtNum, shortAddr, fmtTime } from '@/components/ui/format';

const CLASS_COLORS: Record<WhaleClassification, BadgeColor> = {
  EXCHANGE_INFLOW: 'red',
  EXCHANGE_OUTFLOW: 'green',
  OTC_MOVEMENT: 'purple',
  TREASURY_MOVEMENT: 'blue',
  SMART_MONEY_ACCUMULATION: 'cyan',
  UNKNOWN: 'gray',
};

function classLabel(c: WhaleClassification): string {
  return c.replace(/_/g, ' ').toLowerCase();
}

export function WhaleIntelligence() {
  const [tier, setTier] = useState<WhaleTier>('1m');
  const [txs, setTxs] = useState<WhaleTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiGet<WhaleTransaction[]>(`/api/whale?tier=${tier}`)
      .then((res) => {
        if (!active) return;
        setTxs(res.data ?? []);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tier]);

  const onMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.channel !== 'whale') return;
      const tx = msg.data as WhaleTransaction;
      if (!tx || !tx.txHash) return;
      if (tx.tier !== tier) return;
      setTxs((prev) => [tx, ...prev.filter((t) => t.txHash !== tx.txHash)].slice(0, 100));
    },
    [tier]
  );

  const { connected } = useWebSocket({ channels: ['whale'], onMessage });

  const columns: Column<WhaleTransaction>[] = [
    { key: 'time', header: 'Time', render: (t) => <span className="text-gray-400 font-mono text-xs">{fmtTime(t.timestamp)}</span> },
    { key: 'token', header: 'Token', render: (t) => <span className="font-semibold">{t.tokenSymbol}</span> },
    { key: 'chain', header: 'Chain', render: (t) => <Badge color="purple">{t.chain}</Badge> },
    { key: 'amount', header: 'Amount', align: 'right', render: (t) => fmtNum(t.amount, { compact: true }) },
    { key: 'value', header: 'Value', align: 'right', render: (t) => <span className="font-semibold">{fmtUsd(t.valueUsd, { compact: true })}</span> },
    { key: 'from', header: 'From', render: (t) => <span className="font-mono text-xs">{shortAddr(t.from)}</span> },
    { key: 'to', header: 'To', render: (t) => <span className="font-mono text-xs">{shortAddr(t.to)}</span> },
    {
      key: 'classification',
      header: 'Classification',
      render: (t) => <Badge color={CLASS_COLORS[t.classification]}>{classLabel(t.classification)}</Badge>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Whale Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
            Live large-transaction feed
            <span className={`inline-flex items-center gap-1 ${connected ? 'text-green-400' : 'text-gray-500'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
              {connected ? 'live' : 'offline'}
            </span>
          </p>
        </div>
        <Tabs
          options={[
            { value: '100k', label: '$100k+' },
            { value: '1m', label: '$1M+' },
            { value: '10m', label: '$10M+' },
          ]}
          value={tier}
          onChange={setTier}
        />
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading whale transactions…" />
      ) : (
        <DataTable
          columns={columns}
          rows={txs}
          rowKey={(t) => t.txHash}
          dense
          emptyTitle="No whale transactions"
          emptyMessage="Nothing crossed this threshold recently. New transactions stream in live."
        />
      )}
    </div>
  );
}
