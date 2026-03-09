import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Upload, Trash2, Wifi, WifiOff, RefreshCw, Search, Flame, X } from 'lucide-react';

const statusColors = { active: 'success', inactive: 'secondary', banned: 'error', qr_pending: 'warning', connecting: 'warning', disconnected: 'secondary', cooling: 'info' };

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ number: '', group_id: '' });
  const [bulkText, setBulkText] = useState('');
  const [showWarmup, setShowWarmup] = useState(false);
  const [warmupPlans, setWarmupPlans] = useState([]);
  const [warmupForm, setWarmupForm] = useState({ phone_number_id: '', plan_type: 'conservative' });

  const load = () => {
    api.get('/phone-numbers').then(r => setNumbers(r.data?.data || r.data || [])).catch(() => setNumbers([]));
    api.get('/settings/number-groups').then(r => setGroups(r.data?.data || r.data || [])).catch(() => setGroups([]));
    api.get('/warmup').then(r => setWarmupPlans(r.data?.data || [])).catch(() => setWarmupPlans([]));
  };
  useEffect(load, []);

  const filtered = numbers.filter(n => {
    if (search && !n.number.includes(search)) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    return true;
  });

  const addNumber = async () => {
    await api.post('/phone-numbers', { number: form.number, group_id: form.group_id || null });
    setShowAdd(false); setForm({ number: '', group_id: '' }); load();
  };

  const bulkImport = async () => {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const nums = lines.map(l => l.split(',')[0].trim());
    await api.post('/phone-numbers/bulk', { numbers: nums });
    setShowBulk(false); setBulkText(''); load();
  };

  const deleteNumber = async (id) => {
    if (!confirm('Delete this number?')) return;
    await api.delete(`/phone-numbers/${id}`); load();
  };

  const connect = async (id) => { await api.post(`/whatsapp/connect/${id}`); load(); };
  const disconnect = async (id) => { await api.post(`/whatsapp/disconnect/${id}`); load(); };
  const createWarmup = async () => {
    await api.post('/warmup', warmupForm);
    setShowWarmup(false); setWarmupForm({ phone_number_id: '', plan_type: 'conservative' }); load();
  };
  const cancelWarmup = async (id) => { await api.delete(`/warmup/${id}`); load(); };
  const getWarmupForNumber = (numId) => warmupPlans.find(w => w.phone_number_id === numId && w.is_active);

  const healthColor = (score) => score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400';
  const healthBarColor = (score) => score >= 80 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Phone Numbers</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowWarmup(true)}><Flame className="h-4 w-4 mr-2" />Warm-up</Button>
          <Button variant="outline" onClick={() => setShowBulk(true)}><Upload className="h-4 w-4 mr-2" />Bulk Import</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Add Number</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
              <Input placeholder="Search numbers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="banned">Banned</option>
              <option value="qr_pending">QR Pending</option>
              <option value="connecting">Connecting</option>
              <option value="disconnected">Disconnected</option>
              <option value="cooling">Cooling</option>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Sent/Failed</TableHead>
                <TableHead>IP / Location</TableHead>
                <TableHead>Proxy</TableHead>
                <TableHead>Bans</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Warm-up</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(n => (
                <TableRow key={n.id}>
                  <TableCell className="font-mono">{n.number}</TableCell>
                  <TableCell><Badge variant={statusColors[n.status] || 'secondary'}>{n.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 rounded-full bg-gray-700 overflow-hidden">
                        <div className={`h-full rounded-full ${healthBarColor(n.health_score)}`} style={{ width: `${n.health_score}%` }} />
                      </div>
                      <span className={`text-xs font-bold ${healthColor(n.health_score)}`}>{n.health_score}</span>
                    </div>
                  </TableCell>
                  <TableCell><span className="text-green-400">{n.total_sent || 0}</span> / <span className="text-red-400">{n.total_failed || 0}</span></TableCell>
                  <TableCell>
                    <div className="text-xs">
                      {n.connection_ip ? (
                        <>
                          <span className="font-mono">{n.connection_ip}</span>
                          <br />
                          <span className="text-[hsl(var(--muted-foreground))]">
                            {n.connection_country === 'ID' ? '🇮🇩' : n.connection_country ? `🌐 ${n.connection_country}` : ''} {n.connection_city || ''}
                          </span>
                        </>
                      ) : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-[hsl(var(--muted-foreground))]">{n.proxy_url || '—'}</span>
                  </TableCell>
                  <TableCell>{n.ban_count || 0}</TableCell>
                  <TableCell>{groups.find(g => g.id === n.group_id)?.name || '-'}</TableCell>
                  <TableCell>
                    {(() => {
                      const wp = getWarmupForNumber(n.id);
                      if (!wp) return <span className="text-xs text-[hsl(var(--muted-foreground))]">—</span>;
                      const pct = Math.round((wp.current_day / wp.total_days) * 100);
                      return (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-full bg-orange-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] text-orange-400">D{wp.current_day}/{wp.total_days}</span>
                          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{wp.daily_sent}/{wp.daily_target}</span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {n.status !== 'active' ? (
                        <Button size="sm" variant="ghost" onClick={() => connect(n.id)}><Wifi className="h-3 w-3" /></Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => disconnect(n.id)}><WifiOff className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => api.post(`/phone-numbers/${n.id}/recalculate-health`).then(load)}><RefreshCw className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteNumber(n.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filtered.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No numbers found</p>}
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Phone Number</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="+628xxxxxxxxxx" value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
            <Select value={form.group_id} onChange={e => setForm({ ...form, group_id: e.target.value })}>
              <option value="">No Group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Button className="w-full" onClick={addNumber}>Add Number</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warmup Plans */}
      {warmupPlans.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Flame className="h-5 w-5 text-orange-400" />Active Warm-up Plans</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Today</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warmupPlans.map(wp => {
                  const pct = Math.round((wp.current_day / wp.total_days) * 100);
                  return (
                    <TableRow key={wp.id}>
                      <TableCell className="font-mono">{wp.number}</TableCell>
                      <TableCell><Badge variant="warning">{wp.plan_type}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-3 rounded-full bg-gray-700 overflow-hidden">
                            <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs">Day {wp.current_day}/{wp.total_days}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-green-400">{wp.daily_sent}</span>
                        <span className="text-[hsl(var(--muted-foreground))]"> / {wp.daily_target}</span>
                      </TableCell>
                      <TableCell><Badge variant={wp.is_active ? 'success' : 'secondary'}>{wp.is_active ? 'Active' : 'Done'}</Badge></TableCell>
                      <TableCell>
                        {wp.is_active && <Button size="sm" variant="ghost" onClick={() => cancelWarmup(wp.id)}><X className="h-3 w-3 text-red-400" /></Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showWarmup} onOpenChange={setShowWarmup}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Warm-up Plan</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={warmupForm.phone_number_id} onChange={e => setWarmupForm({ ...warmupForm, phone_number_id: e.target.value })}>
              <option value="">Select Number</option>
              {numbers.filter(n => !getWarmupForNumber(n.id)).map(n => <option key={n.id} value={n.id}>{n.number}</option>)}
            </Select>
            <Select value={warmupForm.plan_type} onChange={e => setWarmupForm({ ...warmupForm, plan_type: e.target.value })}>
              <option value="conservative">Conservative (14 days)</option>
              <option value="moderate">Moderate (7 days)</option>
              <option value="aggressive">Aggressive (3 days)</option>
            </Select>
            <div className="text-xs text-[hsl(var(--muted-foreground))] space-y-1">
              {warmupForm.plan_type === 'conservative' && <p>Day 1-3: 5/day → Day 4-7: 15/day → Day 8-10: 30/day → Day 11-14: 50/day</p>}
              {warmupForm.plan_type === 'moderate' && <p>Day 1-2: 10/day → Day 3-4: 25/day → Day 5-7: 50/day</p>}
              {warmupForm.plan_type === 'aggressive' && <p>Day 1: 20/day → Day 2: 40/day → Day 3: 60/day</p>}
            </div>
            <Button className="w-full" onClick={createWarmup} disabled={!warmupForm.phone_number_id}>Assign Warm-up</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Import Numbers</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">One number per line</p>
            <textarea className="flex w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm min-h-[200px] font-mono" placeholder={"+6281234567890\n+6281234567891"} value={bulkText} onChange={e => setBulkText(e.target.value)} />
            <Button className="w-full" onClick={bulkImport}>Import</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
