import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Download, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatisticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [dailyChart, setDailyChart] = useState([]);
  const [sortKey, setSortKey] = useState('sent');
  const [sortDir, setSortDir] = useState('desc');
  const [bestTime, setBestTime] = useState(null);

  useEffect(() => {
    api.get('/statistics/advanced').then(r => setData(r.data)).catch(() => {});
    api.get('/statistics/daily-chart').then(r => setDailyChart(r.data?.data || [])).catch(() => {});
    api.get('/statistics/best-time').then(r => setBestTime(r.data)).catch(() => {});
  }, []);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortedCampaigns = useMemo(() => {
    if (!data?.campaignTable) return [];
    return [...data.campaignTable].sort((a, b) => {
      const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [data?.campaignTable, sortKey, sortDir]);

  const exportCsv = () => {
    const token = localStorage.getItem('token');
    window.open(`/api/stats/export?format=csv&token=${token}`, '_blank');
  };

  if (!data) return <div className="flex items-center justify-center h-64 text-[hsl(var(--muted-foreground))]">Loading...</div>;

  const { overall, bestHours, numberPerf, topContacts } = data;
  const statusColors = { active: 'success', inactive: 'secondary', banned: 'error', running: 'info', completed: 'success', draft: 'secondary', paused: 'warning' };
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const SortHeader = ({ label, field }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(field)}>
      <span className="flex items-center gap-1">{label}<ArrowUpDown className="h-3 w-3 opacity-50" /></span>
    </TableHead>
  );

  const scoreToColor = (score, max) => {
    if (max === 0) return 'rgba(100,116,139,0.2)';
    const ratio = score / max;
    const r = Math.round(239 * (1 - ratio) + 34 * ratio);
    const g = Math.round(68 * (1 - ratio) + 197 * ratio);
    const b = Math.round(68 * (1 - ratio) + 94 * ratio);
    return `rgba(${r},${g},${b},${0.3 + ratio * 0.7})`;
  };

  const maxScore = bestTime ? Math.max(...bestTime.heatmap.map(h => h.score), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Statistics</h1>
        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[hsl(var(--border))] pb-2">
        {[{ id: 'overview', label: 'Overview' }, { id: 'best-time', label: 'Best Time' }].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-md text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'best-time' && bestTime && (
        <div className="space-y-6">
          {/* Recommendation */}
          <Card>
            <CardContent className="pt-6 pb-6">
              <div className="text-center">
                <p className="text-lg font-bold text-green-400">💡 {bestTime.recommendation}</p>
              </div>
            </CardContent>
          </Card>

          {/* Heatmap */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Engagement Heatmap (Score by Day & Hour)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Hour headers */}
                  <div className="flex gap-0.5 mb-1 ml-12">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="flex-1 text-center text-[9px] text-[hsl(var(--muted-foreground))]">{h}</div>
                    ))}
                  </div>
                  {/* Day rows */}
                  {dayNames.map((day, di) => (
                    <div key={di} className="flex gap-0.5 mb-0.5 items-center">
                      <span className="w-10 text-xs text-[hsl(var(--muted-foreground))] text-right mr-2">{day}</span>
                      {Array.from({ length: 24 }, (_, h) => {
                        const cell = bestTime.heatmap.find(c => c.day === di && c.hour === h);
                        const score = cell?.score || 0;
                        const total = cell?.total || 0;
                        return (
                          <div key={h} className="flex-1 h-8 rounded-sm cursor-pointer relative group"
                            style={{ backgroundColor: scoreToColor(score, maxScore) }}
                            title={`${day} ${h}:00 - Score: ${score}, Sent: ${total}`}>
                            <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-[hsl(var(--popover))] border border-[hsl(var(--border))] rounded px-2 py-1 text-[10px] whitespace-nowrap z-10">
                              {day} {h}:00 | Score: {score} | Sent: {total}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">Low</span>
                    <div className="flex gap-0.5">
                      {[0, 0.25, 0.5, 0.75, 1].map(r => (
                        <div key={r} className="w-6 h-3 rounded-sm" style={{ backgroundColor: scoreToColor(r * maxScore, maxScore) }} />
                      ))}
                    </div>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">High</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top 5 */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Top 5 Best Time Slots</CardTitle></CardHeader>
            <CardContent>
              {bestTime.top5.length > 0 ? (
                <div className="space-y-3">
                  {bestTime.top5.map((slot, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-[hsl(var(--muted))]/10">
                      <span className="text-2xl font-bold text-[hsl(var(--primary))]">#{i + 1}</span>
                      <div className="flex-1">
                        <p className="font-medium">{dayNames[slot.day]} {String(slot.hour).padStart(2, '0')}:00 - {String(slot.hour + 1).padStart(2, '0')}:00 WIB</p>
                        <div className="flex gap-4 text-xs text-[hsl(var(--muted-foreground))] mt-1">
                          <span>Delivery: <span className="text-green-400">{slot.deliveryRate}%</span></span>
                          <span>Read: <span className="text-purple-400">{slot.readRate}%</span></span>
                          <span>Reply: <span className="text-orange-400">{slot.replyRate}%</span></span>
                          <span>Score: <span className="text-cyan-400 font-bold">{slot.score}</span></span>
                          <span>Volume: {slot.total}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">Not enough data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'overview' && <>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Sent', value: overall.totalSent.toLocaleString(), color: 'text-green-400' },
          { label: 'Delivery Rate', value: `${overall.deliveryRate}%`, color: 'text-blue-400' },
          { label: 'Read Rate', value: `${overall.readRate}%`, color: 'text-purple-400' },
          { label: 'CTR', value: `${overall.ctr}%`, color: 'text-cyan-400' },
          { label: 'Reply Rate', value: `${overall.replyRate}%`, color: 'text-orange-400' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Messages Sent (Last 30 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
                <Line type="monotone" dataKey="sent" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Best Sending Hours (Read Rate %)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={bestHours}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={h => `${h}:00`} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} unit="%" />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} formatter={(v) => [`${v}%`, 'Read Rate']} />
                <Bar dataKey="readRate" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Performance Table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Campaign Performance</CardTitle></CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <SortHeader label="Sent" field="sent" />
                  <SortHeader label="Delivered%" field="deliveredPct" />
                  <SortHeader label="Read%" field="readPct" />
                  <SortHeader label="CTR%" field="ctrPct" />
                  <SortHeader label="Reply%" field="replyPct" />
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCampaigns.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.sent}</TableCell>
                    <TableCell className="text-green-400">{c.deliveredPct}%</TableCell>
                    <TableCell className="text-purple-400">{c.readPct}%</TableCell>
                    <TableCell className="text-cyan-400">{c.ctrPct}%</TableCell>
                    <TableCell className="text-orange-400">{c.replyPct}%</TableCell>
                    <TableCell><Badge variant={statusColors[c.status] || 'secondary'}>{c.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {sortedCampaigns.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No campaigns yet</p>}
        </CardContent>
      </Card>

      {/* Number Performance */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Number Performance</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Delivery Rate</TableHead>
                <TableHead>Failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numberPerf.map((n, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono">{n.number}</TableCell>
                  <TableCell><Badge variant={statusColors[n.status] || 'secondary'}>{n.status}</Badge></TableCell>
                  <TableCell><span className={`font-bold ${n.health_score >= 70 ? 'text-green-400' : n.health_score >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{n.health_score}</span></TableCell>
                  <TableCell>{n.sent}</TableCell>
                  <TableCell className="text-blue-400">{n.deliveryRate}%</TableCell>
                  <TableCell className="text-red-400">{n.failed}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {numberPerf.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No data</p>}
        </CardContent>
      </Card>

      {/* Top Contacts */}
      {topContacts && topContacts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Top Engaged Contacts</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Clicks</TableHead>
                  <TableHead>Replies</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topContacts.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{c.target_phone}</TableCell>
                    <TableCell className="text-cyan-400">{c.clicks}</TableCell>
                    <TableCell className="text-orange-400">{c.replies}</TableCell>
                    <TableCell className="font-bold">{c.clicks + c.replies}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      </>}
    </div>
  );
}
