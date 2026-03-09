import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'reseller', max_numbers: 5, max_messages_per_day: 1000 });

  const load = () => api.get('/tenants').then(r => setTenants(Array.isArray(r.data) ? r.data : [])).catch(() => setTenants([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) {
      await api.patch(`/tenants/${editing.id}`, form);
    } else {
      await api.post('/tenants', form);
    }
    setShowForm(false); setEditing(null); load();
  };

  const del = async (id) => { if (confirm('Delete tenant?')) { await api.delete(`/tenants/${id}`); load(); } };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ name: t.name, email: t.email, role: t.role, max_numbers: t.max_numbers, max_messages_per_day: t.max_messages_per_day, is_active: t.is_active });
    setShowForm(true);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', email: '', role: 'reseller', max_numbers: 5, max_messages_per_day: 1000 });
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-[hsl(var(--primary))]" />
          <h1 className="text-3xl font-bold">Tenants</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Tenant</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold">{tenants.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Total Tenants</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-green-400">{tenants.filter(t => t.is_active).length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Active</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 text-center">
          <div className="text-3xl font-bold text-blue-400">{tenants.reduce((s, t) => s + (t.today_messages || 0), 0)}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))]">Messages Today</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Numbers</TableHead><TableHead>Campaigns</TableHead><TableHead>Today Msgs</TableHead>
              <TableHead>Limits</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {tenants.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm">{t.email}</TableCell>
                  <TableCell><Badge variant={t.role === 'admin' ? 'default' : 'secondary'}>{t.role}</Badge></TableCell>
                  <TableCell>{t.number_count || 0}</TableCell>
                  <TableCell>{t.campaign_count || 0}</TableCell>
                  <TableCell>{t.today_messages || 0}</TableCell>
                  <TableCell className="text-xs">{t.max_numbers} nums / {t.max_messages_per_day} msgs</TableCell>
                  <TableCell><Badge variant={t.is_active ? 'default' : 'destructive'}>{t.is_active ? 'Active' : 'Disabled'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del(t.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!tenants.length && <TableRow><TableCell colSpan={9} className="text-center py-8 text-[hsl(var(--muted-foreground))]">No tenants yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Tenant' : 'New Tenant'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Tenant name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <select className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="reseller">Reseller</option>
              <option value="admin">Admin</option>
            </select>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Max Numbers</label>
                <Input type="number" value={form.max_numbers} onChange={e => setForm({ ...form, max_numbers: parseInt(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Max Messages/Day</label>
                <Input type="number" value={form.max_messages_per_day} onChange={e => setForm({ ...form, max_messages_per_day: parseInt(e.target.value) })} />
              </div>
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active !== 0} onChange={e => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} />
                Active
              </label>
            )}
            <Button onClick={save} className="w-full">{editing ? 'Update' : 'Create'} Tenant</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
