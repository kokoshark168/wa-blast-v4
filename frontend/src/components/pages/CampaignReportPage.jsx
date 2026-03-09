import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from 'recharts';
import { ArrowLeft, Download, MousePointerClick, Clock, MessageCircle, GitCompare, MapPin, Phone, Shield, AlertTriangle } from 'lucide-react';

const STATUS_COLORS = {
  pending: '#6b7280', sent: '#3b82f6', delivered: '#22c55e', read: '#8b5cf6', failed: '#ef4444', skipped: '#f59e0b',
};

export default function CampaignReportPage() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clickStats, setClickStats] = useState(null);
  const [clickTimeline, setClickTimeline] = useState([]);
  const [tab, setTab] = useState('overview');
  const [timeline, setTimeline] = useState([]);
  const [responses, setResponses] = useState(null);
  const [geo, setGeo] = useState([]);
  const [compareIds, setCompareIds] = useState('');
  const [compareData, setCompareData] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [numberPerf, setNumberPerf] = useState(null);

  useEffect(() => {
    api.get(`/campaigns/${id}/report`).then(r => setReport(r.data)).catch(() => {}).finally(() => setLoading(false));
    api.get(`/campaigns/${id}/clicks`).then(r => setClickStats(r.data)).catch(() => {});
    api.get(`/campaigns/${id}/clicks/timeline`).then(r => setClickTimeline(r.data || [])).catch(() => {});
    api.get(`/campaigns/${id}/timeline`).then(r => setTimeline(r.data || [])).catch(() => {});
    api.get(`/campaigns/${id}/responses-analysis`).then(r => setResponses(r.data)).catch(() => {});
    api.get(`/campaigns/${id}/geo`).then(r => setGeo(r.data || [])).catch(() => {});
    api.get('/campaigns').then(r => setCampaigns(Array.isArray(r.data) ? r.data : (r.data?.data || []))).catch(() => {});
    api.get(`/campaigns/${id}/number-performance`).then(r => setNumberPerf(r.data)).catch(() => {});
  }, [id]);

  const compare = async () => {
    const ids = compareIds || id;
    const { data } = await api.get(`/campaigns/compare?ids=${ids}`);
    setCompareData(data);
  };

  const exportCSV = () => window.open(`${api.defaults.baseURL}/campaigns/${id}/export`, '_blank');

  if (loading) return <div className="flex items-center justify-center py-20 text-[hsl(var(--muted-foreground))]">Loading...</div>;
  if (!report) return <div className="text-center py-20 text-[hsl(var(--muted-foreground))]">Report not found</div>;

  const { campaign, summary, messages } = report;
  const chartData = ['sent', 'delivered', 'read', 'failed', 'pending', 'skipped']
    .filter(s => summary[s] > 0)
    .map(s => ({ name: s.charAt(0).toUpperCase() + s.slice(1), value: summary[s], color: STATUS_COLORS[s] }));

  const tabs = [
    { id: 'overview', label: 'Overview', icon: MousePointerClick },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'responses', label: 'Responses', icon: MessageCircle },
    { id: 'geo', label: 'Geographic', icon: MapPin },
    { id: 'numbers', label: 'Number Performance', icon: Phone },
    { id: 'compare', label: 'Compare', icon: GitCompare },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/campaigns"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Campaign Report • {campaign.created_at?.slice(0, 10)}</p>
          </div>
        </div>
        <Button onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[hsl(var(--border))] pb-2">
        {tabs.map(t => (
          <Button key={t.id} variant={tab === t.id ? 'default' : 'ghost'} size="sm" onClick={() => setTab(t.id)}>
            <t.icon className="h-4 w-4 mr-1" />{t.label}
          </Button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total', value: summary.total, color: 'text-white' },
              { label: 'Sent', value: summary.sent, color: 'text-blue-400' },
              { label: 'Delivered', value: summary.delivered, color: 'text-green-400' },
              { label: 'Read', value: summary.read, color: 'text-purple-400' },
              { label: 'Failed', value: summary.failed, color: 'text-red-400' },
              { label: 'Pending', value: summary.pending, color: 'text-gray-400' },
            ].map(s => (
              <Card key={s.label}><CardContent className="pt-4 pb-4 text-center">
                <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                {summary.total > 0 && <p className="text-xs text-[hsl(var(--muted-foreground))]">{Math.round(s.value / summary.total * 100)}%</p>}
              </CardContent></Card>
            ))}
          </div>

          {chartData.length > 0 && (
            <Card><CardHeader><CardTitle>Delivery Status</CardTitle></CardHeader><CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent></Card>
          )}

          {clickStats && clickStats.totalLinks > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Clicks', value: clickStats.totalClicks, color: 'text-cyan-400' },
                { label: 'Unique Clicks', value: clickStats.uniqueClicks, color: 'text-blue-400' },
                { label: 'CTR', value: `${clickStats.ctr}%`, color: 'text-green-400' },
                { label: 'Tracked Links', value: clickStats.totalLinks, color: 'text-purple-400' },
              ].map(s => (
                <Card key={s.label}><CardContent className="pt-4 pb-4 text-center">
                  <MousePointerClick className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                </CardContent></Card>
              ))}
            </div>
          )}

          <Card><CardHeader><CardTitle>Messages ({messages.length})</CardTitle></CardHeader><CardContent>
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Recipient</TableHead><TableHead>Status</TableHead><TableHead>Sent At</TableHead><TableHead>Delivered At</TableHead><TableHead>Read At</TableHead><TableHead>Error</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {messages.slice(0, 200).map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-sm">{m.target_phone}</TableCell>
                      <TableCell><Badge variant={m.status === 'delivered' ? 'success' : m.status === 'failed' ? 'destructive' : 'secondary'}>{m.status}</Badge></TableCell>
                      <TableCell className="text-xs">{m.sent_at || '-'}</TableCell>
                      <TableCell className="text-xs">{m.delivered_at || '-'}</TableCell>
                      <TableCell className="text-xs">{m.read_at || '-'}</TableCell>
                      <TableCell className="text-xs text-red-400 max-w-[200px] truncate">{m.error || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </>
      )}

      {/* Timeline Tab */}
      {tab === 'timeline' && (
        <Card><CardHeader><CardTitle>Message Delivery Timeline (Hourly)</CardTitle></CardHeader><CardContent>
          {timeline.length > 0 ? (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={h => h?.slice(11, 16) || h} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="delivered" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="read" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center py-12 text-[hsl(var(--muted-foreground))]">No timeline data available yet</p>
          )}
        </CardContent></Card>
      )}

      {/* Responses Tab */}
      {tab === 'responses' && (
        <Card><CardHeader><CardTitle>Response Analysis ({responses?.total_replies || 0} replies)</CardTitle></CardHeader><CardContent>
          {responses?.words?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {responses.words.map((w, i) => {
                const maxCount = responses.words[0].count;
                const size = Math.max(14, Math.min(48, Math.round(w.count / maxCount * 48)));
                const opacity = Math.max(0.4, w.count / maxCount);
                return (
                  <span key={i} style={{ fontSize: `${size}px`, opacity }} className="text-[hsl(var(--primary))] font-medium px-1">
                    {w.word}
                    <sup className="text-xs text-[hsl(var(--muted-foreground))]">{w.count}</sup>
                  </span>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-12 text-[hsl(var(--muted-foreground))]">No response data available</p>
          )}
        </CardContent></Card>
      )}

      {/* Geographic Tab */}
      {tab === 'geo' && (
        <Card><CardHeader><CardTitle>Carrier / Geographic Distribution</CardTitle></CardHeader><CardContent>
          {geo.length > 0 ? (
            <>
              <div className="h-[300px] mb-6">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={geo}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                    <XAxis dataKey="carrier" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="total" fill="#6b7280" name="Total" />
                    <Bar dataKey="delivered" fill="#22c55e" name="Delivered" />
                    <Bar dataKey="failed" fill="#ef4444" name="Failed" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Carrier</TableHead><TableHead>Total</TableHead><TableHead>Sent</TableHead><TableHead>Delivered</TableHead><TableHead>Failed</TableHead><TableHead>Rate</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {geo.map(g => (
                    <TableRow key={g.carrier}>
                      <TableCell className="font-medium">{g.carrier}</TableCell>
                      <TableCell>{g.total}</TableCell><TableCell>{g.sent}</TableCell>
                      <TableCell className="text-green-400">{g.delivered}</TableCell>
                      <TableCell className="text-red-400">{g.failed}</TableCell>
                      <TableCell>{g.total > 0 ? Math.round(g.delivered / g.total * 100) : 0}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-center py-12 text-[hsl(var(--muted-foreground))]">No geographic data available</p>
          )}
        </CardContent></Card>
      )}

      {/* Number Performance Tab */}
      {tab === 'numbers' && (
        <div className="space-y-6">
          {numberPerf?.summary && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[
                { label: 'Numbers Used', value: numberPerf.summary.total_numbers, color: 'text-blue-400', icon: Phone },
                { label: 'Survived', value: numberPerf.summary.survived, color: 'text-green-400', icon: Shield },
                { label: 'Banned', value: numberPerf.summary.banned, color: 'text-red-400', icon: AlertTriangle },
                { label: 'Disconnected', value: numberPerf.summary.disconnected, color: 'text-yellow-400', icon: AlertTriangle },
                { label: 'Ban Rate', value: `${numberPerf.summary.ban_rate}%`, color: numberPerf.summary.ban_rate > 30 ? 'text-red-400' : numberPerf.summary.ban_rate > 10 ? 'text-yellow-400' : 'text-green-400', icon: AlertTriangle },
                { label: 'Avg Msgs Before Ban', value: numberPerf.summary.avg_msgs_before_ban ?? '—', color: 'text-purple-400', icon: MessageCircle },
              ].map((s, i) => (
                <Card key={i}><CardContent className="pt-4 pb-4 text-center">
                  <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                </CardContent></Card>
              ))}
            </div>
          )}

          {/* Ban cost visualization */}
          {numberPerf?.summary?.cost_per_ban?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />Messages Sent Before Ban (per number)
              </CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {numberPerf.summary.cost_per_ban.map((n, i) => {
                    const maxSent = Math.max(...numberPerf.summary.cost_per_ban.map(x => x.messages_sent), 1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-32 text-sm font-mono truncate text-[hsl(var(--muted-foreground))]">{n.phone || `#${n.phone_number_id}`}</span>
                        <div className="flex-1 h-6 bg-[hsl(var(--muted))]/20 rounded overflow-hidden relative">
                          <div className="h-full bg-red-500/70 rounded transition-all" style={{ width: `${(n.messages_sent / maxSent) * 100}%` }} />
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">{n.messages_sent} msgs</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Per-number table */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Per-Number Breakdown</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              {numberPerf?.numbers?.length > 0 ? (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>End Reason</TableHead>
                    <TableHead>Health</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {numberPerf.numbers.map((n, i) => {
                      const endReasonColors = { completed: 'success', banned: 'destructive', disconnected: 'warning' };
                      const statusColors = { active: 'success', banned: 'destructive', disconnected: 'warning', inactive: 'secondary', cooling: 'info' };
                      const formatDuration = (mins) => {
                        if (mins == null) return '—';
                        if (mins < 60) return `${mins}m`;
                        const h = Math.floor(mins / 60);
                        const m = mins % 60;
                        return m > 0 ? `${h}h ${m}m` : `${h}h`;
                      };
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{n.phone || `#${n.phone_number_id}`}</TableCell>
                          <TableCell>{(n.messages_sent || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-green-400">{(n.messages_delivered || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-red-400">{(n.messages_failed || 0).toLocaleString()}</TableCell>
                          <TableCell><Badge variant={statusColors[n.current_status] || 'secondary'}>{n.current_status || '—'}</Badge></TableCell>
                          <TableCell className="text-sm">{formatDuration(n.duration_minutes)}</TableCell>
                          <TableCell>
                            {n.end_reason
                              ? <Badge variant={endReasonColors[n.end_reason] || 'secondary'}>{n.end_reason}</Badge>
                              : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
                          </TableCell>
                          <TableCell>
                            <span className={`font-medium ${(n.health_score ?? 0) >= 70 ? 'text-green-400' : (n.health_score ?? 0) >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                              {n.health_score ?? '—'}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No number performance data available yet. Data is tracked during campaign execution.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compare Tab */}
      {tab === 'compare' && (
        <div className="space-y-4">
          <Card><CardContent className="pt-6">
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="text-sm mb-1 block">Select campaigns to compare (comma-separated IDs, current included by default)</label>
                <input className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                  placeholder={`e.g. ${id},2,3`} value={compareIds} onChange={e => setCompareIds(e.target.value)} />
              </div>
              <Button onClick={compare}>Compare</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {campaigns.filter(c => c.id != id).slice(0, 10).map(c => (
                <Button key={c.id} size="sm" variant="outline" onClick={() => setCompareIds(prev => {
                  const ids = prev ? prev.split(',').map(s => s.trim()) : [String(id)];
                  if (!ids.includes(String(c.id))) ids.push(String(c.id));
                  if (!ids.includes(String(id))) ids.unshift(String(id));
                  return ids.join(',');
                })}>{c.name} (#{c.id})</Button>
              ))}
            </div>
          </CardContent></Card>

          {compareData && (
            <Card><CardHeader><CardTitle>Comparison</CardTitle></CardHeader><CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Metric</TableHead>
                    {compareData.map(c => <TableHead key={c.id}>{c.name || `#${c.id}`}</TableHead>)}
                  </TableRow></TableHeader>
                  <TableBody>
                    {['total', 'sent', 'delivered', 'read_count', 'failed', 'clicks', 'delivery_rate', 'read_rate'].map(metric => (
                      <TableRow key={metric}>
                        <TableCell className="font-medium capitalize">{metric.replace(/_/g, ' ')}</TableCell>
                        {compareData.map(c => (
                          <TableCell key={c.id} className={metric.includes('rate') ? 'text-green-400' : ''}>
                            {metric.includes('rate') ? `${c[metric]}%` : c[metric]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
