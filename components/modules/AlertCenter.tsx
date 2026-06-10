'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '@/components/ui/apiClient';
import { Spinner } from '@/components/ui/Spinner';
import { DegradedBanner } from '@/components/ui/DegradedBanner';

interface Alert {
  id: string;
  title: string;
  description: string;
  type: string;
  severity: number;
  isActive: boolean;
}

const ALERT_TYPES = [
  { value: 'WHALE_BUY', label: 'Whale Buy' },
  { value: 'WHALE_SELL', label: 'Whale Sell' },
  { value: 'SMART_MONEY_ENTRY', label: 'Smart Money Entry' },
  { value: 'SMART_MONEY_EXIT', label: 'Smart Money Exit' },
  { value: 'FUNDING_EXTREME', label: 'Funding Extreme' },
  { value: 'OI_SPIKE', label: 'OI Spike' },
  { value: 'LIQUIDATION_ZONE', label: 'Liquidation Zone' },
  { value: 'SENTIMENT_EXPLOSION', label: 'Sentiment Explosion' },
  { value: 'TREND_SHIFT', label: 'Trend Shift' },
  { value: 'CUSTOM', label: 'Custom' },
];

export function AlertCenter() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(ALERT_TYPES[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const res = await apiGet<Alert[]>('/api/alerts');
      setAlerts(res.data ?? []);
      setDegraded(!!res.degraded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setFormError('Title and description are required');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await apiPost<Alert>('/api/alerts', {
        type,
        title: title.trim(),
        description: description.trim(),
        triggerConditions: {},
        channels: ['IN_APP'],
      });
      setTitle('');
      setDescription('');
      setShowForm(false);
      await fetchAlerts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <Spinner label="Loading alerts…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Alert Center</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="bg-cyan-500 hover:bg-cyan-600 text-black font-semibold px-4 py-2 rounded transition"
        >
          {showForm ? 'Cancel' : 'Create Alert'}
        </button>
      </div>

      {degraded && <DegradedBanner />}
      {error && <DegradedBanner message={`Failed to load: ${error}`} />}

      {showForm && (
        <form onSubmit={handleCreate} className="glass rounded-lg p-6 space-y-4">
          {formError && (
            <div className="bg-red-500/10 border border-red-500/50 rounded p-3 text-red-400 text-sm">
              {formError}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              {ALERT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
              placeholder="e.g. BTC whale buys over $1M"
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              required
              placeholder="What should this alert watch for?"
              className="w-full bg-black border border-gray-700 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-700 text-black font-semibold px-4 py-2 rounded transition"
          >
            {submitting ? 'Creating…' : 'Create Alert'}
          </button>
        </form>
      )}

      {alerts.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center">
          <p className="text-gray-400">No alerts configured</p>
          <p className="text-sm text-gray-500 mt-2">Create your first alert to get notified on market events</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className="glass rounded-lg p-4 flex justify-between items-center">
              <div>
                <h3 className="font-bold">{alert.title}</h3>
                <p className="text-xs text-gray-400">{alert.type}</p>
              </div>
              <div className={`w-3 h-3 rounded-full ${alert.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
