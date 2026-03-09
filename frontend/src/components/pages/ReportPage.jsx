import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Download, ArrowUpDown, Calendar, TrendingUp, Clock, AlertTriangle, Filter } from 'lucide-react';
import { Select } from '@/components/ui/select';

function fmt(n) { return (n || 0).toLocaleString(); }

const presets = [
  { label: 'Today', get: () => { const d = new Date().toISOString().slice(0,10); return [d, d]; }},
  { label: 'Yesterday', get: () => { const d = new Date(Date.now()-86400000).toISOString().slice(0,10); return [d, d]; }},
  { label: 'Last 7 days', get: () => [new Date(Date.now()-6*86400000).toISOString().slice(0,10), new Date().toISOString().slice(0,10)] },
  { label: 'Last 30 days', get: () => [new Date(Date.now()-29*86400000).toISOString().slice(0,10), new Date().toISOString().slice(0,10)] },
  { label: 'This month', get: () => { const now = new Date(); return [new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10), now.toISOString().slice(0,10)]; }},
];

const FUNNEL_COLORS = ['#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

export default function ReportPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const defaultRange = presets[2].get();
  const [from, setFrom] = useState(defaultRange[0]);
  const [to, setTo] = useState(defaultRange[1]);
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [daily, setDaily] = useState([]);
  const [hours, setHours] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campSort, setCampSort] = useState({ key: 'sent', dir: 'desc' });
  const [numSort, setNumSort] = useState({ key: 'sent', dir: 'desc' });
  const [funnel, setFunnel] = useState(null);
  const [funnelCampaigns, setFunnelCampaigns] = useState([]);
  const [funnelCampaignId, setFunnelCampaignId] = useState('');

  const fetchData = () => {
    setLoading(true);
    const params = { from, to };
    Promise.all([
      api.get('/reports/summary', { params }),
      api.get('/reports/campaigns', { params }),
      api.get('/reports/numbers', { params }),
      api.get('/reports/daily', { params }),
      api.get('/reports/hours', { params }),
      api.get('/reports/errors', { params }),
    ]).then(([s, c, n, d, h, e]) => {
      setSummary(s.data);
      setCampaigns(c.data);
      setNumbers(n.data);
      setDaily(d.data);
      setHours(h.data);
      setErrors(e.data);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const fetchFunnel = (cid) => {
    const params = cid ? { campaign_id: cid } : {};
    api.get('/reports/funnel', { params }).then(r => {
      setFunnel(r.data.funnel);
      setFunnelCampaigns(r.data.campaigns || []);
    }).catch(console.error);
  };

  useEffect(() => { fetchData(); fetchFunnel(funnelCampaignId); }, []);
  useEffect(() => { fetchFunnel(funnelCampaignId); }, [funnelCampaignId]);

  const applyPreset = (p) => {
    const [f, t] = p.get();
    setFrom(f);
    setTo(t);
  };

  const exportCsv = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/reports/export?from=${from}&to=${to}&token=${token}`, '_blank');
  };

  const toggleCampSort = (key) => {
    setCampSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };
  const toggleNumSort = (key) => {
    setNumSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  const sortedCampaigns = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const av = a[campSort.key] ?? 0, bv = b[campSort.key] ?? 0;
      return campSort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [campaigns, campSort]);

  const sortedNumbers = useMemo(() => {
    return [...numbers].sort((a, b) => {
      const av = a[numSort.key] ?? 0, bv = b[numSort.key] ?? 0;
      return numSort.dir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [numbers, numSort]);

  const topCampaigns = useMemo(() => {
    return [...campaigns].filter(c => c.sent >= 10).sort((a, b) => b.readRate - a.readRate).slice(0, 10);
  }, [campaigns]);

  const maxDaily = useMemo(() => Math.max(...daily.map(d => d.sent || 0), 1), [daily]);
  const maxHourSent = useMemo(() => Math.max(...hours.map(h => h.sent || 0), 1), [hours]);
  const maxError = useMemo(() => Math.max(...errors.map(e => e.count || 0), 1), [errors]);

  const healthColor = { good: 'text-green-400', warning: 'text-yellow-400', critical: 'text-red-400', unknown: 'text-gray-400' };
  const healthBadge = { good: 'success', warning: 'warning', critical: 'error', unknown: 'secondary' };

  const SortHeader = ({ label, field, onSort }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => onSort(field)}>
      <span className="flex items-center gap-1">{label}<ArrowUpDown className="h-3 w-3 opacity-50" /></span>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-3xl font-bold">Reports</h1>
        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[hsl(var(--border))] pb-2">
        {[{ id: 'overview', label: 'Overview' }, { id: 'funnel', label: 'Funnel' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'funnel' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Filter className="h-5 w-5" />Funnel Report</CardTitle>
                <Select value={funnelCampaignId} onChange={e => setFunnelCampaignId(e.target.value)} className="w-64">
                  <option value="">All Campaigns</option>
                  {funnelCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {funnel && funnel.length > 0 ? (
                <div className="space-y-4">
                  {funnel.map((step, i) => {
                    const maxCount = funnel[0].count || 1;
                    const widthPct = Math.max((step.count / maxCount) * 100, 8);
                    return (
                      <div key={step.name}>
                        <div className="flex items-center gap-4 mb-1">
                          <span className="w-20 text-sm font-medium">{step.name}</span>
                          <div className="flex-1 relative">
                            <div className="h-10 rounded-lg overflow-hidden relative" style={{ width: `${widthPct}%`, backgroundColor: FUNNEL_COLORS[i], opacity: 0.85, transition: 'width 0.5s ease' }}>
                              <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
                                {step.count.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="w-32 text-right text-xs space-y-0.5">
                            <div className="text-[hsl(var(--muted-foreground))]">{step.overallRate}% of sent</div>
                            {i > 0 && <div className="text-yellow-400">{step.conversionRate}% conv</div>}
                            {i > 0 && <div className="text-red-400">{step.dropOff}% drop</div>}
                          </div>
                        </div>
                        {i < funnel.length - 1 && (
                          <div className="flex items-center gap-4 ml-20 pl-4">
                            <div className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1">
                              ↓ {funnel[i + 1].conversionRate}% conversion
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No data available</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'overview' && <>
      {/* Date Range */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Calendar className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-1.5 text-sm" />
            <span className="text-[hsl(var(--muted-foreground))]">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="bg-[hsl(var(--input))] border border-[hsl(var(--border))] rounded-md px-3 py-1.5 text-sm" />
            <Button size="sm" onClick={fetchData}>Apply</Button>
            <div className="flex gap-1 flex-wrap">
              {presets.map(p => (
                <Button key={p.label} variant="ghost" size="sm" className="text-xs h-7"
                  onClick={() => { applyPreset(p); setTimeout(fetchData, 50); }}>{p.label}</Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-[hsl(var(--muted-foreground))]">Loading...</div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {[
                { label: 'Total Sent', value: fmt(summary.sent), color: 'text-green-400' },
                { label: 'Delivered', value: fmt(summary.delivered), color: 'text-blue-400' },
                { label: 'Read', value: fmt(summary.read), color: 'text-purple-400' },
                { label: 'Failed', value: fmt(summary.failed), color: 'text-red-400' },
                { label: 'Delivery %', value: `${summary.deliveryRate}%`, color: 'text-blue-400' },
                { label: 'Read %', value: `${summary.readRate}%`, color: 'text-purple-400' },
                { label: 'Replies', value: fmt(summary.replies), color: 'text-orange-400' },
                { label: 'CTR', value: `${summary.ctr}%`, color: 'text-cyan-400' },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="pt-4 pb-4 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Delivery Funnel */}
          {summary && summary.sent > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Delivery Funnel</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: 'Sent', value: summary.sent, color: 'bg-green-500' },
                    { label: 'Delivered', value: summary.delivered, color: 'bg-blue-500' },
                    { label: 'Read', value: summary.read, color: 'bg-purple-500' },
                  ].map(step => (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className="w-20 text-sm text-[hsl(var(--muted-foreground))]">{step.label}</span>
                      <div className="flex-1 h-8 bg-[hsl(var(--muted))]/20 rounded overflow-hidden relative">
                        <div className={`h-full ${step.color} rounded transition-all duration-500 opacity-80`}
                          style={{ width: `${(step.value / summary.sent) * 100}%` }} />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                          {fmt(step.value)} ({summary.sent > 0 ? Math.round((step.value / summary.sent) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily Trend */}
          {daily.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Daily Trend</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-48 overflow-x-auto pb-6 relative">
                  {daily.map((d, i) => (
                    <div key={i} className="flex flex-col items-center flex-shrink-0" style={{ width: Math.max(100 / daily.length, 3) + '%', minWidth: '20px' }}>
                      <div className="w-full flex flex-col items-center gap-0.5" style={{ height: '160px', justifyContent: 'flex-end' }}>
                        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{fmt(d.sent)}</span>
                        <div className="w-3/4 bg-green-500/80 rounded-t transition-all" style={{ height: `${(d.sent / maxDaily) * 140}px` }} />
                      </div>
                      <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                        {d.date?.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Campaign Performance Table */}
          {sortedCampaigns.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Campaign Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <SortHeader label="Sent" field="sent" onSort={toggleCampSort} />
                      <SortHeader label="Delivered" field="delivered" onSort={toggleCampSort} />
                      <SortHeader label="Read" field="read" onSort={toggleCampSort} />
                      <SortHeader label="Failed" field="failed" onSort={toggleCampSort} />
                      <SortHeader label="Delivery %" field="deliveryRate" onSort={toggleCampSort} />
                      <SortHeader label="Read %" field="readRate" onSort={toggleCampSort} />
                      <SortHeader label="CTR" field="ctr" onSort={toggleCampSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCampaigns.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>{fmt(c.sent)}</TableCell>
                        <TableCell>{fmt(c.delivered)}</TableCell>
                        <TableCell>{fmt(c.read)}</TableCell>
                        <TableCell className="text-red-400">{fmt(c.failed)}</TableCell>
                        <TableCell>{c.deliveryRate}%</TableCell>
                        <TableCell>{c.readRate}%</TableCell>
                        <TableCell>{c.ctr}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Number Performance Table */}
          {sortedNumbers.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Number Performance</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Number</TableHead>
                      <SortHeader label="Sent" field="sent" onSort={toggleNumSort} />
                      <SortHeader label="Delivered" field="delivered" onSort={toggleNumSort} />
                      <SortHeader label="Failed" field="failed" onSort={toggleNumSort} />
                      <SortHeader label="Delivery %" field="deliveryRate" onSort={toggleNumSort} />
                      <TableHead>Health</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedNumbers.map(n => (
                      <TableRow key={n.id}>
                        <TableCell className="font-mono">{n.number}</TableCell>
                        <TableCell>{fmt(n.sent)}</TableCell>
                        <TableCell>{fmt(n.delivered)}</TableCell>
                        <TableCell className="text-red-400">{fmt(n.failed)}</TableCell>
                        <TableCell>{n.deliveryRate}%</TableCell>
                        <TableCell><Badge variant={healthBadge[n.health]}>{n.health}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Best Sending Hours */}
          {hours.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" />Best Sending Hours</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-1 h-48 pb-6">
                  {Array.from({ length: 24 }, (_, h) => {
                    const data = hours.find(x => x.hour === h);
                    const sent = data?.sent || 0;
                    const readRate = data?.readRate || 0;
                    const barH = maxHourSent > 0 ? (sent / maxHourSent) * 140 : 0;
                    const hue = readRate > 50 ? 142 : readRate > 30 ? 45 : readRate > 15 ? 30 : 0;
                    const sat = Math.min(readRate * 2, 100);
                    return (
                      <div key={h} className="flex flex-col items-center flex-1" style={{ minWidth: '14px' }}>
                        <div className="flex flex-col items-center" style={{ height: '160px', justifyContent: 'flex-end' }}>
                          {sent > 0 && <span className="text-[8px] text-[hsl(var(--muted-foreground))]">{readRate}%</span>}
                          <div className="w-3/4 rounded-t transition-all"
                            style={{ height: `${barH}px`, backgroundColor: sent > 0 ? `hsl(${hue}, ${sat}%, 50%)` : 'transparent' }}
                            title={`${h}:00 — ${sent} sent, ${readRate}% read`} />
                        </div>
                        <span className="text-[9px] text-[hsl(var(--muted-foreground))] mt-1">{h}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">Color intensity = read rate. Green = high read rate, red = low.</p>
              </CardContent>
            </Card>
          )}

          {/* Top Campaigns by Read Rate */}
          {topCampaigns.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5" />Top Campaigns by Read Rate</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topCampaigns.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="w-6 text-sm text-[hsl(var(--muted-foreground))] text-right">#{i + 1}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate">{c.name}</span>
                          <span className="text-purple-400 font-medium">{c.readRate}%</span>
                        </div>
                        <div className="h-2 bg-[hsl(var(--muted))]/20 rounded overflow-hidden">
                          <div className="h-full bg-purple-500 rounded transition-all" style={{ width: `${c.readRate}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-[hsl(var(--muted-foreground))] w-16 text-right">{fmt(c.sent)} sent</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Failed Reasons */}
          {errors.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-400" />Failed Reasons Breakdown</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {errors.map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="truncate text-[hsl(var(--muted-foreground))]">{e.reason}</span>
                          <span className="text-red-400 font-medium">{fmt(e.count)}</span>
                        </div>
                        <div className="h-2 bg-[hsl(var(--muted))]/20 rounded overflow-hidden">
                          <div className="h-full bg-red-500 rounded transition-all" style={{ width: `${(e.count / maxError) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      </>}
    </div>
  );
}
