import { useState, useEffect } from 'react';
import { Globe, Plus, Star, Trash2, CheckCircle, Shield, RefreshCw, Copy, X, ExternalLink } from 'lucide-react';
import api from '@/lib/api';

const STATUS_COLORS = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  dns_verified: 'bg-blue-500/15 text-blue-400',
  ssl_active: 'bg-cyan-500/15 text-cyan-400',
  active: 'bg-green-500/15 text-green-400',
  failed: 'bg-red-500/15 text-red-400',
  disabled: 'bg-gray-500/15 text-gray-400',
};

const VPS_IP = '159.198.36.163';

export default function ShortLinkDomainsPage() {
  const [domains, setDomains] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [addedDomain, setAddedDomain] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const fetchData = async () => {
    try {
      const [domainsRes, statsRes] = await Promise.all([
        api.get('/domains'),
        api.get('/domains/stats'),
      ]);
      setDomains(domainsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Failed to fetch domains:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const getStats = (id) => stats.find(s => s.id === id) || {};

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/domains', { domain: newDomain.trim().toLowerCase() });
      setAddedDomain(res.data);
      setNewDomain('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add domain');
    } finally {
      setSubmitting(false);
    }
  };

  const doAction = async (id, action, method = 'post') => {
    setActionLoading(prev => ({ ...prev, [`${id}-${action}`]: true }));
    try {
      if (method === 'put') {
        await api.put(`/domains/${id}/${action}`);
      } else if (method === 'delete') {
        if (!confirm('Delete this domain?')) return;
        await api.delete(`/domains/${id}`);
      } else {
        await api.post(`/domains/${id}/${action}`);
      }
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || `Action failed`);
    } finally {
      setActionLoading(prev => ({ ...prev, [`${id}-${action}`]: false }));
    }
  };

  const isLoading = (id, action) => actionLoading[`${id}-${action}`];

  if (loading) return <div className="p-6 text-[hsl(var(--muted-foreground))]">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-6 w-6 text-[hsl(var(--primary))]" />
            Short Link Domains
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Manage custom domains for your short links</p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setAddedDomain(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Add Domain
        </button>
      </div>

      {/* Add Domain Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAdd(false)}>
          <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-6 w-full max-w-lg mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Custom Domain</h2>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>

            {!addedDomain ? (
              <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Domain Name</label>
                  <input
                    type="text"
                    value={newDomain}
                    onChange={e => setNewDomain(e.target.value)}
                    placeholder="e.g. promolink.xyz"
                    className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary))]"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !newDomain.trim()}
                  className="w-full px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Domain'}
                </button>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-400">✓ Domain added successfully!</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{addedDomain.domain}</p>
                </div>

                {/* DNS Instructions */}
                <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-sm">DNS Setup Instructions</h3>
                  <ol className="text-sm text-[hsl(var(--muted-foreground))] space-y-2 list-decimal list-inside">
                    <li>Go to your domain registrar's DNS settings</li>
                    <li>
                      Add an A record:
                      <div className="mt-1 flex items-center gap-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded px-3 py-2 font-mono text-xs">
                        <span>@ → <strong className="text-[hsl(var(--foreground))]">{VPS_IP}</strong></span>
                        <button
                          onClick={() => navigator.clipboard.writeText(VPS_IP)}
                          className="ml-auto p-1 rounded hover:bg-[hsl(var(--accent))]"
                          title="Copy IP"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                    <li>Wait 5-10 minutes for DNS propagation</li>
                    <li>Click "Verify DNS" in the domain list below</li>
                  </ol>
                </div>

                <button onClick={() => setShowAdd(false)} className="w-full px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--accent))]">
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
          <Globe className="h-6 w-6 mx-auto mb-1 text-blue-400" />
          <div className="text-2xl font-bold">{domains.length}</div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Domains</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
          <span className="text-2xl">🔗</span>
          <div className="text-2xl font-bold">{stats.reduce((s, d) => s + (d.total_links || 0), 0)}</div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Links</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
          <span className="text-2xl">👆</span>
          <div className="text-2xl font-bold">{stats.reduce((s, d) => s + (d.total_clicks || 0), 0)}</div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Clicks</p>
        </div>
        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
          <Star className="h-6 w-6 mx-auto mb-1 text-yellow-400 fill-yellow-400" />
          <div className="text-sm font-bold mt-1">{domains.find(d => d.is_primary)?.domain || '—'}</div>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Primary Domain</p>
        </div>
      </div>

      {/* Domain List */}
      {domains.length === 0 ? (
        <div className="text-center py-12 text-[hsl(var(--muted-foreground))]">
          <Globe className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No custom domains yet</p>
          <p className="text-sm mt-1">Add a domain to use custom short links</p>
        </div>
      ) : (
        <div className="border border-[hsl(var(--border))] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Domain</th>
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Primary</th>
                  <th className="text-right px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Links</th>
                  <th className="text-right px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Clicks</th>
                  <th className="text-right px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">CTR</th>
                  <th className="text-left px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Added</th>
                  <th className="text-right px-4 py-3 font-medium text-[hsl(var(--muted-foreground))]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {domains.map(d => {
                  const s = getStats(d.id);
                  return (
                    <tr key={d.id} className="border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                          <span className="font-medium">{d.domain}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status] || STATUS_COLORS.pending}`}>
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {d.is_primary ? <Star className="h-4 w-4 text-yellow-400 mx-auto fill-yellow-400" /> : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.total_links || 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.total_clicks || 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{s.ctr || 0}%</td>
                      <td className="px-4 py-3 text-[hsl(var(--muted-foreground))]">
                        {new Date(d.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {(d.status === 'pending' || d.status === 'failed') && (
                            <button
                              onClick={() => doAction(d.id, 'verify')}
                              disabled={isLoading(d.id, 'verify')}
                              className="p-1.5 rounded hover:bg-[hsl(var(--accent))] text-blue-400"
                              title="Verify DNS"
                            >
                              {isLoading(d.id, 'verify') ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                            </button>
                          )}
                          {d.status === 'dns_verified' && (
                            <button
                              onClick={() => doAction(d.id, 'activate')}
                              disabled={isLoading(d.id, 'activate')}
                              className="p-1.5 rounded hover:bg-[hsl(var(--accent))] text-green-400"
                              title="Activate"
                            >
                              <Shield className="h-4 w-4" />
                            </button>
                          )}
                          {d.status === 'active' && !d.is_primary && (
                            <button
                              onClick={() => doAction(d.id, 'primary', 'put')}
                              disabled={isLoading(d.id, 'primary')}
                              className="p-1.5 rounded hover:bg-[hsl(var(--accent))] text-yellow-400"
                              title="Set as Primary"
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => doAction(d.id, '', 'delete')}
                            className="p-1.5 rounded hover:bg-[hsl(var(--accent))] text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
