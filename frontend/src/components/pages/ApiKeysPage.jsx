import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Copy, Key, ExternalLink } from 'lucide-react';

const ALL_PERMISSIONS = ['send_message', 'manage_campaigns', 'manage_contacts', 'view_reports'];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState([...ALL_PERMISSIONS]);
  const [rateLimit, setRateLimit] = useState(100);
  const [newKey, setNewKey] = useState('');

  const load = () => api.get('/api-keys').then(r => setKeys(Array.isArray(r.data) ? r.data : [])).catch(() => setKeys([]));
  useEffect(() => { load(); }, []);

  const create = async () => {
    const { data } = await api.post('/api-keys', { name, permissions, rate_limit: rateLimit });
    setNewKey(data.key);
    setName('');
    load();
  };

  const del = async (id) => { if (confirm('Revoke this API key?')) { await api.delete(`/api-keys/${id}`); load(); } };
  const toggle = async (id, is_active) => { await api.patch(`/api-keys/${id}`, { is_active: is_active ? 0 : 1 }); load(); };
  const copy = (text) => { navigator.clipboard.writeText(text); };
  const togglePerm = (p) => setPermissions(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Key className="h-8 w-8 text-[hsl(var(--primary))]" />
          <h1 className="text-3xl font-bold">API Keys</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open('/api/docs', '_blank')}><ExternalLink className="h-4 w-4 mr-2" />API Docs</Button>
          <Button onClick={() => { setShowCreate(true); setNewKey(''); }}><Plus className="h-4 w-4 mr-2" />Generate Key</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold">{keys.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Total Keys</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-green-400">{keys.filter(k => k.is_active).length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Active</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-blue-400">{keys.filter(k => k.last_used_at || k.last_used).length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Used At Least Once</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Key</TableHead><TableHead>Permissions</TableHead>
              <TableHead>Rate Limit</TableHead><TableHead>Status</TableHead><TableHead>Last Used</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {keys.map(k => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-[hsl(var(--secondary))] px-2 py-1 rounded">{k.key_preview || (k.key?.slice(0, 12) + '...')}</code>
                      {k.key && <Button size="sm" variant="ghost" onClick={() => copy(k.key)}><Copy className="h-3 w-3" /></Button>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(k.permissions || []).map(p => <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>{k.rate_limit || 100}/min</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => toggle(k.id, k.is_active)}>
                      <Badge variant={k.is_active ? 'default' : 'destructive'}>{k.is_active ? 'Active' : 'Revoked'}</Badge>
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs">{(k.last_used_at || k.last_used)?.slice(0, 16) || 'Never'}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => del(k.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {!keys.length && <TableRow><TableCell colSpan={7} className="text-center py-8 text-[hsl(var(--muted-foreground))]">No API keys</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate API Key</DialogTitle></DialogHeader>
          {newKey ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                <p className="text-sm font-medium text-green-400 mb-2">🔑 Your new API key (save it now!):</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-[hsl(var(--secondary))] px-3 py-2 rounded flex-1 break-all">{newKey}</code>
                  <Button size="sm" onClick={() => copy(newKey)}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">This key won't be shown again.</p>
              </div>
              <Button onClick={() => setShowCreate(false)} className="w-full">Done</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input placeholder="Key name (e.g. Production API)" value={name} onChange={e => setName(e.target.value)} />
              <div>
                <label className="text-sm font-medium mb-2 block">Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={permissions.includes(p)} onChange={() => togglePerm(p)} />
                      {p.replace(/_/g, ' ')}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Rate Limit (requests/min)</label>
                <Input type="number" value={rateLimit} onChange={e => setRateLimit(parseInt(e.target.value))} />
              </div>
              <Button onClick={create} className="w-full" disabled={!name}>Generate Key</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
