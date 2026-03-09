import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Save, Zap, Plus, Trash2, Pencil, Send, Eye } from 'lucide-react';

const ALL_EVENTS = ['message.sent', 'message.delivered', 'message.read', 'message.failed', 'campaign.completed', 'number.banned'];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState([]);
  const [showWebhookForm, setShowWebhookForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: [], is_active: 1 });
  const [deliveries, setDeliveries] = useState([]);
  const [showDeliveries, setShowDeliveries] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    api.get('/settings').then(r => setSettings(r.data?.data || r.data || {})).catch(() => setSettings({}));
    loadWebhooks();
  }, []);

  const loadWebhooks = () => api.get('/webhooks/endpoints').then(r => setWebhooks(Array.isArray(r.data) ? r.data : [])).catch(() => setWebhooks([]));

  const save = async () => {
    await api.put('/settings', settings);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }));

  const fields = [
    { key: 'cooldown_hours', label: 'Cooldown Hours', desc: 'Hours a number must rest after blast' },
    { key: 'max_messages_per_day', label: 'Max Messages/Day', desc: 'Maximum messages per number per day' },
    { key: 'max_messages_per_hour', label: 'Max Messages/Hour', desc: 'Maximum messages per number per hour' },
    { key: 'default_delay_min', label: 'Default Min Delay (s)', desc: 'Minimum delay between messages' },
    { key: 'default_delay_max', label: 'Default Max Delay (s)', desc: 'Maximum delay between messages' },
  ];

  const toggleFields = [
    { key: 'auto_rotate_on_ban', label: 'Auto-Rotate on Ban', desc: 'Switch to next number when one gets banned' },
    { key: 'auto_rotate_on_cooldown', label: 'Auto-Rotate on Cooldown', desc: 'Switch to next number when one is cooling down' },
    { key: 'breeding_enabled', label: 'Enable Breeding', desc: 'Allow number warming sessions' },
    { key: 'alert_on_ban', label: 'Alert on Ban', desc: 'Create alert when number is banned' },
    { key: 'alert_on_dead_proxy', label: 'Alert on Dead Proxy', desc: 'Create alert when proxy stops working' },
  ];

  const smtpFields = [
    { key: 'smtp_host', label: 'SMTP Host', desc: 'e.g. smtp.gmail.com' },
    { key: 'smtp_port', label: 'SMTP Port', desc: 'e.g. 587' },
    { key: 'smtp_user', label: 'SMTP User', desc: 'Email account username' },
    { key: 'smtp_pass', label: 'SMTP Password', desc: 'Email account password or app password', type: 'password' },
    { key: 'smtp_from', label: 'From Email', desc: 'e.g. "WA Blast" <noreply@example.com>' },
  ];

  // Webhook handlers
  const saveWebhook = async () => {
    if (editingWebhook) await api.patch(`/webhooks/endpoints/${editingWebhook.id}`, webhookForm);
    else await api.post('/webhooks/endpoints', webhookForm);
    setShowWebhookForm(false); setEditingWebhook(null); loadWebhooks();
  };
  const delWebhook = async (id) => { if (confirm('Delete webhook?')) { await api.delete(`/webhooks/endpoints/${id}`); loadWebhooks(); } };
  const testWebhook = async (id) => {
    setTestResult(null);
    const { data } = await api.post(`/webhooks/endpoints/${id}/test`);
    setTestResult(data);
    setTimeout(() => setTestResult(null), 5000);
  };
  const viewDeliveries = async (id) => {
    const { data } = await api.get(`/webhooks/endpoints/${id}/deliveries`);
    setDeliveries(data); setShowDeliveries(id);
  };
  const toggleWebhookEvent = (event) => {
    setWebhookForm(f => ({ ...f, events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event] }));
  };

  const [backupMsg, setBackupMsg] = useState('');
  const [backingUp, setBackingUp] = useState(false);
  const doBackup = async () => {
    setBackingUp(true); setBackupMsg('');
    try {
      const { data } = await api.post('/settings/backup');
      setBackupMsg(`✅ ${data.message}`);
    } catch (e) { setBackupMsg(`❌ ${e.response?.data?.error || e.message}`); }
    setBackingUp(false);
  };

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'antiban', label: 'Anti-Ban' },
    { id: 'webhooks', label: 'Webhooks' },
    { id: 'backup', label: '💾 Backup' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
        {activeTab !== 'webhooks' && (
          <Button onClick={save}>
            <Save className="h-4 w-4 mr-2" />{saved ? 'Saved!' : 'Save Settings'}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[hsl(var(--border))] pb-2">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-t-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] border-b-2 border-[hsl(var(--primary))]'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-lg">Email / SMTP (for OTP Login)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {smtpFields.map(f => (
                <div key={f.key} className="grid grid-cols-3 items-center gap-4">
                  <div><p className="font-medium text-sm">{f.label}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{f.desc}</p></div>
                  <Input type={f.type || 'text'} value={settings[f.key] || ''} onChange={e => update(f.key, e.target.value)} className="col-span-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Rate Limits & Cooldown</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {fields.map(f => (
                <div key={f.key} className="grid grid-cols-3 items-center gap-4">
                  <div><p className="font-medium text-sm">{f.label}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{f.desc}</p></div>
                  <Input type="number" value={settings[f.key] || ''} onChange={e => update(f.key, e.target.value)} className="col-span-2" />
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === 'antiban' && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Automation & Anti-Ban</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {toggleFields.map(f => (
              <div key={f.key} className="flex items-center justify-between">
                <div><p className="font-medium text-sm">{f.label}</p><p className="text-xs text-[hsl(var(--muted-foreground))]">{f.desc}</p></div>
                <button onClick={() => update(f.key, settings[f.key] === 'true' ? 'false' : 'true')}
                  className={`w-12 h-6 rounded-full transition-colors ${settings[f.key] === 'true' ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${settings[f.key] === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {activeTab === 'webhooks' && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Configure webhook endpoints for real-time event notifications</p>
            <Button onClick={() => { setEditingWebhook(null); setWebhookForm({ url: '', events: [], is_active: 1 }); setShowWebhookForm(true); }}>
              <Plus className="h-4 w-4 mr-2" />Add Webhook
            </Button>
          </div>

          {testResult && (
            <Card className={testResult.success ? 'border-green-500' : 'border-red-500'}>
              <CardContent className="pt-4 text-sm">
                {testResult.success ? '✅ Webhook test successful' : `❌ Test failed: ${testResult.error}`}
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
                            : (w.events || []).map(e => <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant={w.is_active ? 'default' : 'destructive'}>{w.is_active ? 'Active' : 'Disabled'}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => testWebhook(w.id)} title="Test"><Send className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => viewDeliveries(w.id)} title="Deliveries"><Eye className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingWebhook(w); setWebhookForm({ url: w.url, events: w.events || [], is_active: w.is_active }); setShowWebhookForm(true); }}><Pencil className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => delWebhook(w.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!webhooks.length && <TableRow><TableCell colSpan={4} className="text-center py-8 text-[hsl(var(--muted-foreground))]">No webhooks configured</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={showWebhookForm} onOpenChange={setShowWebhookForm}>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingWebhook ? 'Edit Webhook' : 'New Webhook'}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="https://your-server.com/webhook" value={webhookForm.url} onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })} />
                <div>
                  <label className="text-sm font-medium mb-2 block">Events (leave empty for all)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_EVENTS.map(event => (
                      <label key={event} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={webhookForm.events.includes(event)} onChange={() => toggleWebhookEvent(event)} />
                        {event}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={webhookForm.is_active === 1} onChange={e => setWebhookForm({ ...webhookForm, is_active: e.target.checked ? 1 : 0 })} />
                  Active
                </label>
                <Button onClick={saveWebhook} className="w-full">{editingWebhook ? 'Update' : 'Create'}</Button>
              </div>
            </DialogContent>
          </Dialog>

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
        </>
      )}

      {activeTab === 'backup' && (
        <Card>
          <CardHeader><CardTitle>💾 Manual Backup</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Create a backup of backend + database + frontend. Saved to <code>/root/backups/</code> on the server.
            </p>
            <Button onClick={doBackup} disabled={backingUp}>
              {backingUp ? '⏳ Creating backup...' : '💾 Create Backup Now'}
            </Button>
            {backupMsg && <p className="text-sm mt-2">{backupMsg}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
