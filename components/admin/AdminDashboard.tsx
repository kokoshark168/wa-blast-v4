'use client';

import React, { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { fmtNum, fmtDateTime } from '@/components/ui/format';

interface AdminStats {
  totalUsers: number;
  totalWallets: number;
  totalAlerts: number;
  totalTransactions: number;
  dataSources: { name: string; healthy: boolean; latencyMs?: number }[];
  auditLog: { id: string; actor: string; action: string; target?: string; timestamp: number }[];
}

interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  subscriptionTier: string;
  isActive: boolean;
}

interface AdminDashboardProps {
  role?: string;
}

export function AdminDashboard({ role }: AdminDashboardProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([apiGet<AdminStats>('/api/admin/stats'), apiGet<AdminUser[]>('/api/admin/users')])
      .then(([s, u]) => {
        if (!active) return;
        setStats(s.data ?? null);
        setUsers(u.data ?? []);
        setDegraded(!!s.degraded || !!u.degraded);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const toggleActive = async (user: AdminUser) => {
    setUpdating(user.id);
    const next = !user.isActive;
    try {
      await apiPut(`/api/admin/users`, { id: user.id, isActive: next });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUpdating(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="glass rounded-lg p-12 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-gray-300 font-medium">Admin access required</p>
        <p className="text-sm text-gray-500 mt-2">Your account does not have permission to view this page.</p>
      </div>
    );
  }

  const sourceColumns: Column<AdminStats['dataSources'][number]>[] = [
    { key: 'name', header: 'Source', render: (s) => <span className="font-medium">{s.name}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (s) => <Badge color={s.healthy ? 'green' : 'red'}>{s.healthy ? '● Healthy' : '● Down'}</Badge>,
    },
    { key: 'latency', header: 'Latency', align: 'right', render: (s) => (s.latencyMs != null ? `${s.latencyMs} ms` : '—') },
  ];

  const userColumns: Column<AdminUser>[] = [
    {
      key: 'user',
      header: 'User',
      render: (u) => (
        <div>
          <p className="font-medium">{u.username}</p>
          <p className="text-xs text-gray-500">{u.email}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <Badge color={u.role === 'ADMIN' ? 'purple' : 'gray'}>{u.role}</Badge> },
    { key: 'tier', header: 'Tier', render: (u) => <Badge color="cyan">{u.subscriptionTier}</Badge> },
    {
      key: 'active',
      header: 'Active',
      align: 'center',
      render: (u) => (
        <button
          onClick={() => toggleActive(u)}
          disabled={updating === u.id}
          className={`relative inline-flex h-5 w-10 items-center rounded-full transition disabled:opacity-50 ${
            u.isActive ? 'bg-green-500/70' : 'bg-gray-700'
          }`}
          aria-label="Toggle active"
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${u.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      ),
    },
  ];

  const auditColumns: Column<AdminStats['auditLog'][number]>[] = [
    { key: 'time', header: 'Time', render: (a) => <span className="text-xs text-gray-400">{fmtDateTime(a.timestamp)}</span> },
    { key: 'actor', header: 'Actor', render: (a) => <span className="font-mono text-xs">{a.actor}</span> },
    { key: 'action', header: 'Action', render: (a) => <Badge color="blue">{a.action}</Badge> },
    { key: 'target', header: 'Target', render: (a) => <span className="text-gray-300">{a.target ?? '—'}</span> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Platform health & user management</p>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed: ${error}`} />}

      {loading ? (
        <Spinner label="Loading admin data…" />
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Users" value={fmtNum(stats.totalUsers, { compact: true })} />
              <StatCard label="Wallets" value={fmtNum(stats.totalWallets, { compact: true })} />
              <StatCard label="Alerts" value={fmtNum(stats.totalAlerts, { compact: true })} />
              <StatCard label="Transactions" value={fmtNum(stats.totalTransactions, { compact: true })} />
            </div>
          )}

          <div>
            <h2 className="text-lg font-bold mb-3">Data Source Health</h2>
            <DataTable
              columns={sourceColumns}
              rows={stats?.dataSources ?? []}
              rowKey={(s) => s.name}
              dense
              emptyTitle="No data sources"
            />
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Users</h2>
            <DataTable columns={userColumns} rows={users} rowKey={(u) => u.id} emptyTitle="No users" />
          </div>

          <div>
            <h2 className="text-lg font-bold mb-3">Recent Audit Log</h2>
            <DataTable
              columns={auditColumns}
              rows={stats?.auditLog ?? []}
              rowKey={(a) => a.id}
              dense
              emptyTitle="No audit entries"
            />
          </div>
        </>
      )}
    </div>
  );
}
