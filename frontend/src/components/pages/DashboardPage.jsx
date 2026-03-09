import { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, Send, XCircle, Clock, Megaphone, Users, Inbox, Bell, TrendingUp, Activity, CheckCircle, Eye, MessageSquare, ArrowUp, ArrowDown, Minus, Trophy, Heart, Wifi, WifiOff, Zap, Plus, FileBarChart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => { setConnected(true); };
    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => { ws.close(); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type !== 'connected') {
          setEvents(prev => [{ ...msg, id: Date.now() + Math.random() }, ...prev].slice(0, 50));
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  return { connected, events };
}

function AnimatedCounter({ value, className }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  
  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current;
    const diff = value - start;
    const steps = 20;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      setDisplay(Math.round(start + (diff * step / steps)));
      if (step >= steps) { clearInterval(interval); setDisplay(value); }
    }, 30);
    prevRef.current = value;
    return () => clearInterval(interval);
  }, [value]);

  return <span className={className}>{(display || 0).toLocaleString()}</span>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [advanced, setAdvanced] = useState(null);
  const [dailyChart, setDailyChart] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const navigate = useNavigate();
  const { connected: wsConnected, events: wsEvents } = useWebSocket();

  const loadStats = () => {
    const defaults = {
      totalSent: 0, totalFailed: 0, successRate: 0, totalPending: 0,
      activeNumbers: 0, bannedNumbers: 0, totalNumbers: 0, activeCampaigns: 0,
      totalContacts: 0, unreadReplies: 0, unreadAlerts: 0
    };
    api.get('/stats/dashboard').then(r => setStats({ ...defaults, ...(r.data?.data || r.data || {}) })).catch(() => setStats(defaults));
    api.get('/stats/dashboard/advanced').then(r => setAdvanced(r.data)).catch(() => {});
    api.get('/statistics/daily-chart').then(r => setDailyChart(r.data?.data || [])).catch(() => {});
  };

  useEffect(() => { loadStats(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadStats, 30000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  if (!stats) return <div className="flex items-center justify-center h-64 text-[hsl(var(--muted-foreground))]">Loading...</div>;

  const statCards = [
    { label: 'Total Sent', value: stats.totalSent.toLocaleString(), icon: Send, color: 'text-green-400', bg: 'bg-green-400/10' },
    { label: 'Total Failed', value: stats.totalFailed.toLocaleString(), icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/10' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Pending', value: stats.totalPending.toLocaleString(), icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
    { label: 'Active Numbers', value: stats.activeNumbers, icon: Phone, color: 'text-green-400', bg: 'bg-green-400/10' },
    { label: 'Active Campaigns', value: stats.activeCampaigns, icon: Megaphone, color: 'text-purple-400', bg: 'bg-purple-400/10' },
    { label: 'Total Contacts', value: stats.totalContacts.toLocaleString(), icon: Users, color: 'text-cyan-400', bg: 'bg-cyan-400/10' },
    { label: 'Unread Replies', value: stats.unreadReplies, icon: Inbox, color: 'text-orange-400', bg: 'bg-orange-400/10' },
  ];

  const pieData = [
    { name: 'Active', value: stats.activeNumbers, color: '#22c55e' },
    { name: 'Banned', value: stats.bannedNumbers, color: '#ef4444' },
    { name: 'Other', value: stats.totalNumbers - stats.activeNumbers - stats.bannedNumbers, color: '#64748b' },
  ].filter(d => d.value > 0);

  const todayDiff = advanced ? advanced.todaySent - advanced.yesterdaySent : 0;
  const DiffIcon = todayDiff > 0 ? ArrowUp : todayDiff < 0 ? ArrowDown : Minus;
  const diffColor = todayDiff > 0 ? 'text-green-400' : todayDiff < 0 ? 'text-red-400' : 'text-gray-400';

  const nh = advanced?.numberHealth || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-[hsl(var(--muted-foreground))]">WhatsApp Blast System Overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)} className={`text-xs px-2 py-1 rounded ${autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
            Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <Badge variant={wsConnected ? 'success' : 'error'} className="text-sm px-3 py-1">
            {wsConnected ? <><Wifi className="h-3 w-3 mr-1" /> Live</> : <><WifiOff className="h-3 w-3 mr-1" /> Offline</>}
          </Badge>
          <Badge variant="success" className="text-sm px-3 py-1"><Activity className="h-3 w-3 mr-1" /> System Online</Badge>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Button onClick={() => navigate('/campaigns')} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />New Campaign
        </Button>
        <Button onClick={() => navigate('/phone-numbers')} variant="outline" className="gap-2">
          <Phone className="h-4 w-4" />Add Number
        </Button>
        <Button onClick={() => navigate('/reports')} variant="outline" className="gap-2">
          <FileBarChart className="h-4 w-4" />View Reports
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Advanced Stats Row */}
      {advanced && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-400/10"><CheckCircle className="h-5 w-5 text-green-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{advanced.deliveredRate}%</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Delivered Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-400/10"><Eye className="h-5 w-5 text-purple-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{advanced.readRate}%</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Read Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-400/10"><Send className="h-5 w-5 text-blue-400" /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold">{advanced.todaySent}</p>
                    <DiffIcon className={`h-4 w-4 ${diffColor}`} />
                    <span className={`text-xs ${diffColor}`}>{Math.abs(todayDiff)}</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Today vs Yesterday</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-400/10"><MessageSquare className="h-5 w-5 text-orange-400" /></div>
                <div>
                  <p className="text-2xl font-bold">{advanced.replyRate}%</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">Reply Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {advanced.topCampaign && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-400/10"><Trophy className="h-5 w-5 text-yellow-400" /></div>
                  <div>
                    <p className="text-lg font-bold truncate max-w-[120px]" title={advanced.topCampaign.name}>{advanced.topCampaign.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">Top Campaign • {advanced.topCampaign.readRate}% read</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Number Health */}
      {advanced && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Number Health</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Healthy', value: nh.healthy || 0, color: 'bg-green-500', text: 'text-green-400' },
                { label: 'Warming', value: nh.warming || 0, color: 'bg-yellow-500', text: 'text-yellow-400' },
                { label: 'Cooldown', value: nh.cooldown || 0, color: 'bg-blue-500', text: 'text-blue-400' },
                { label: 'Banned', value: nh.banned || 0, color: 'bg-red-500', text: 'text-red-400' },
              ].map((h, i) => (
                <div key={i} className="text-center">
                  <div className={`mx-auto w-12 h-12 rounded-full ${h.color}/20 flex items-center justify-center`}>
                    <span className={`text-xl font-bold ${h.text}`}>{h.value}</span>
                  </div>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{h.label}</p>
                </div>
              ))}
            </div>
            {/* Stacked bar */}
            {(() => {
              const total = (nh.healthy||0) + (nh.warming||0) + (nh.cooldown||0) + (nh.banned||0);
              if (!total) return null;
              return (
                <div className="mt-4 h-3 rounded-full overflow-hidden flex bg-gray-800">
                  {nh.healthy > 0 && <div className="bg-green-500 h-full" style={{ width: `${nh.healthy/total*100}%` }} />}
                  {nh.warming > 0 && <div className="bg-yellow-500 h-full" style={{ width: `${nh.warming/total*100}%` }} />}
                  {nh.cooldown > 0 && <div className="bg-blue-500 h-full" style={{ width: `${nh.cooldown/total*100}%` }} />}
                  {nh.banned > 0 && <div className="bg-red-500 h-full" style={{ width: `${nh.banned/total*100}%` }} />}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg">Daily Messages (Last 30 Days)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217.2 32.6% 17.5%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
                <Bar dataKey="sent" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Live Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-400" />Live Activity Feed
              {wsConnected && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {wsEvents.length > 0 ? wsEvents.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 text-xs py-1 border-b border-[hsl(var(--border))]/30">
                  <span className="text-[hsl(var(--muted-foreground))]">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  <Badge variant={ev.type?.includes('fail') ? 'error' : ev.type?.includes('read') ? 'success' : 'secondary'} className="text-[10px]">{ev.type}</Badge>
                  <span className="truncate text-[hsl(var(--muted-foreground))]">{JSON.stringify(ev.data).slice(0, 80)}</span>
                </div>
              )) : (
                <p className="text-center py-4 text-[hsl(var(--muted-foreground))] text-sm">Waiting for events...</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Number Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
