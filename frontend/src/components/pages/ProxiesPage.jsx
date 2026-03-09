import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export default function ProxiesPage() {
  const [proxies, setProxies] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ host: '', port: '', username: '', password: '', type: 'http' });

  const load = () => api.get('/proxies').then(r => setProxies(r.data?.data || r.data || [])).catch(() => setProxies([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) await api.put(`/proxies/${editing}`, form);
    else await api.post('/proxies', form);
    setShowForm(false); setEditing(null); setForm({ host: '', port: '', username: '', password: '', type: 'http' }); load();
  };

  const edit = (p) => { setEditing(p.id); setForm({ host: p.host, port: p.port, username: p.username || '', password: p.password || '', type: p.type }); setShowForm(true); };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/proxies/${id}`); load(); } };

  const statusColors = { active: 'success', dead: 'error' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Proxies</h1>
        <Button onClick={() => { setEditing(null); setForm({ host: '', port: '', username: '', password: '', type: 'http' }); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" />Add Proxy</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Host</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proxies.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono">{p.host}</TableCell>
                  <TableCell>{p.port}</TableCell>
                  <TableCell><Badge variant="outline">{p.type}</Badge></TableCell>
                  <TableCell>{p.username ? '✓' : '-'}</TableCell>
                  <TableCell><Badge variant={statusColors[p.status] || 'secondary'}>{p.status}</Badge></TableCell>
                  <TableCell>{p.assigned_count || 0} numbers</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => edit(p)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {proxies.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No proxies yet</p>}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Proxy</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Host" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} />
            <Input placeholder="Port" type="number" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
            <Select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </Select>
            <Input placeholder="Username (optional)" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            <Input placeholder="Password (optional)" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
