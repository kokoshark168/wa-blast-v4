import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Trash2, Pencil } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ phone: '', email: '', name: '', role: 'operator' });

  const load = () => api.get('/users').then(r => setUsers(r.data?.data || r.data || [])).catch(() => setUsers([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) await api.put(`/users/${editing}`, form);
    else await api.post('/users', form);
    setShowForm(false); setEditing(null); setForm({ phone: '', email: '', name: '', role: 'operator' }); load();
  };

  const edit = (u) => { setEditing(u.id); setForm({ phone: u.phone || '', email: u.email || '', name: u.name || '', role: u.role }); setShowForm(true); };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/users/${id}`); load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Users</h1>
        <Button onClick={() => { setEditing(null); setForm({ phone: '', email: '', name: '', role: 'operator' }); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" />Add User</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono">{u.email || '-'}</TableCell>
                  <TableCell className="font-mono">{u.phone || '-'}</TableCell>
                  <TableCell>{u.name || '-'}</TableCell>
                  <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge></TableCell>
                  <TableCell className="text-xs">{u.created_at?.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => edit(u)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => del(u.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {users.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No users yet</p>}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input type="email" placeholder="Email (required for login)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="Phone (+628...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="operator">Operator</option></Select>
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
