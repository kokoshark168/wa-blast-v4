'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { HyperliquidPosition, WsMessage } from '@/types';
import { apiGet } from '@/components/ui/apiClient';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtUsd, fmtPct, shortAddr, colorForValue } from '@/components/ui/format';

function buildColumns(): Column<HyperliquidPosition>[] {
  return [
    { key: 'wallet', header: 'Wallet', render: (p) => <span className="font-mono text-xs">{shortAddr(p.wallet)}</span> },
    { key: 'symbol', header: 'Symbol', render: (p) => <span className="font-semibold">{p.symbol}</span> },
    { key: 'lev', header: 'Lev', align: 'right', render: (p) => <span className="font-mono">{p.leverage.toFixed(1)}x</span> },
    { key: 'entry', header: 'Entry', align: 'right', render: (p) => fmtUsd(p.entryPrice) },
    { key: 'liq', header: 'Liq Price', align: 'right', render: (p) => <span className="text-red-400">{fmtUsd(p.liquidationPrice)}</span> },
    { key: 'size', header: 'Size', align: 'right', render: (p) => fmtUsd(p.positionSizeUsd, { compact: true }) },
    {
      key: 'upnl',
      header: 'uPnL',
      align: 'right',
      render: (p) => (
        <span className={colorForValue(p.unrealizedPnl)}>
          {fmtUsd(p.unrealizedPnl, { compact: true })}
          <span className="text-xs ml-1">({fmtPct(p.unrealizedPnlPercent)})</span>
        </span>
      ),
    },
  ];
}

function PositionTable({ title, side, rows }: { title: string; side: 'long' | 'short'; rows: HyperliquidPosition[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Badge color={side === 'long' ? 'green' : 'red'}>{side.toUpperCase()}</Badge>
        {title}
        <span className="text-sm text-gray-500 font-normal">({rows.length})</span>
      </h2>
      <DataTable
        columns={buildColumns()}
        rows={rows}
        rowKey={(p, i) => `${p.wallet}-${p.symbol}-${i}`}
        dense
        emptyTitle={`No ${side} positions`}
      />
    </div>
  );
}

export function HyperliquidMonitor() {
  const [positions, setPositions] = useState<HyperliquidPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiGet<HyperliquidPosition[]>('/api/hyperliquid')
      .then((res) => {
        if (!active) return;
        setPositions(res.data ?? []);
        setDegraded(!!res.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const onMessage = useCallback((msg: WsMessage) => {
    if (msg.channel !== 'hyperliquid') return;
    const pos = msg.data as HyperliquidPosition;
    if (!pos || !pos.wallet) return;
    setPositions((prev) => {
      const key = `${pos.wallet}-${pos.symbol}`;
      return [pos, ...prev.filter((p) => `${p.wallet}-${p.symbol}` !== key)].slice(0, 200);
    });
  }, []);

  const { connected } = useWebSocket({ channels: ['hyperliquid'], onMessage });

  const longs = [...positions].filter((p) => p.side === 'long').sort((a, b) => b.positionSizeUsd - a.positionSizeUsd).slice(0, 25);
  const shorts = [...positions].filter((p) => p.side === 'short').sort((a, b) => b.positionSizeUsd - a.positionSizeUsd).slice(0, 25);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Hyperliquid Monitor</h1>
        <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
          Largest open positions
          <span className={`inline-flex items-center gap-1 ${connected ? 'text-green-400' : 'text-gray-500'}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
            {connected ? 'live' : 'offline'}
          </span>
        </p>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {loading ? (
        <Spinner label="Loading positions…" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <PositionTable title="Largest Longs" side="long" rows={longs} />
          <PositionTable title="Largest Shorts" side="short" rows={shorts} />
        </div>
      )}
    </div>
  );
}
