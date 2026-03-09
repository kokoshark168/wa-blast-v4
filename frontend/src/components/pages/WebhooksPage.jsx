import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Pencil, Zap, Send, Eye } from 'lucide-react';

const ALL_EVENTS = ['message.sent', 'message.delivered', 'message.read', 'message.failed', 'campaign.completed', 'number.banned'];

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ url: '', events: [], is_active: 1 });
  const [deliveries, setDeliveries] = useState([]);
  const [showDeliveries, setShowDeliveries] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const load = () => api.get('/webhooks/endpoints').then(r => setWebhooks(Array.isArray(r.data) ? r.data : [])).catch(() => setWebhooks([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) {
      await api.patch(`/webhooks/endpoints/${editing.id}`, form);
    } else {
      await api.post('/webhooks/endpoints', form);
    }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => { if (confirm('Delete webhook?')) { await api.delete(`/webhooks/endpoints/${id}`); load(); } };

  const test = async (id) => {
    setTestResult(null);
    const { data } = await api.post(`/webhooks/endpoints/${id}/test`);
    setTestResult(data);
    setTimeout(() => setTestResult(null), 5000);
  };

  const viewDeliveries = async (id) => {
    const { data } = await api.get(`/webhooks/endpoints/${id}/deliveries`);
    setDeliveries(data);
    setShowDeliveries(id);
  };

  const toggleEvent = (event) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event]
    }));
  };

  const openNew = () => { setEditing(null); setForm({ url: '', events: [], is_active: 1 }); setShowForm(true); };
  const openEdit = (w) => { setEditing(w); setForm({ url: w.url, events: w.events || [], is_active: w.is_active }); setShowForm(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-[hsl(var(--primary))]" />
          <h1 className="text-3xl font-bold">Webhooks</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Webhook</Button>
      </div>

      {testResult && (
        <Card className={testResult.success ? 'border-green-500' : 'border-red-500'}>
          <CardContent className="pt-4 text-sm">
            {testResult.success ? '✅ Webhook test successful' : `❌ Test failed: ${testResult.error}`} (attempts: {testResult.attempts})
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead>URL</TableHead><TableHead>Events</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {webhooks.map(w => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs max-w-[300px] truncate">{w.url}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(w.events || []).length === 0
                        ? <Badge variant="secondary">All events</Badge>
                        : (w.events || []).map(e => <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>)
                      }
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={w.is_active ? 'default' : 'destructive'}>{w.is_active ? 'Active' : 'Disabled'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => test(w.id)} title="Test"><Send className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => viewDeliveries(w.id)} title="Deliveries"><Eye className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(w)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del(w.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!webhooks.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-[hsl(var(--muted-foreground))]">No webhooks configured</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Webhook' : 'New Webhook'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="https://your-server.com/webhook" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
            <div>
              <label className="text-sm font-medium mb-2 block">Events (leave empty for all)</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_EVENTS.map(event => (
                  <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={form.events.includes(event)} onChange={() => toggleEvent(event)} />
                    {event}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active === 1} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
              Active
            </label>
            <Button onClick={save} className="w-full">{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delivery Log Dialog */}
      <Dialog open={!!showDeliveries} onOpenChange={() => setShowDeliveries(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Delivery Log</DialogTitle></DialogHeader>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>HTTP</TableHead><TableHead>Attempts</TableHead><TableHead>Time</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {deliveries.map(d => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs font-mono">{d.event}</TableCell>
                    <TableCell><Badge variant={d.success ? 'default' : 'destructive'}>{d.success ? 'OK' : 'Failed'}</Badge></TableCell>
                    <TableCell className="text-xs">{d.response_status || '-'}</TableCell>
                    <TableCell>{d.attempts}</TableCell>
                    <TableCell className="text-xs">{d.created_at?.slice(0, 19)}</TableCell>
                  </TableRow>
                ))}
                {!deliveries.length && <TableRow><TableCell colSpan={5} className="text-center py-4 text-[hsl(var(--muted-foreground))]">No deliveries yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
