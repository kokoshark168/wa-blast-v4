import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, FolderOpen } from 'lucide-react';

export default function NumberGroupsPage() {
  const [groups, setGroups] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const load = () => api.get('/settings/number-groups').then(r => setGroups(r.data?.data || r.data || [])).catch(() => setGroups([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) await api.put(`/settings/number-groups/${editing}`, form);
    else await api.post('/settings/number-groups', form);
    setShowForm(false); setEditing(null); setForm({ name: '', description: '' }); load();
  };

  const edit = (g) => { setEditing(g.id); setForm({ name: g.name, description: g.description }); setShowForm(true); };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/settings/number-groups/${id}`); load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Number Groups</h1>
        <Button onClick={() => { setEditing(null); setForm({ name: '', description: '' }); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" />New Group</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map(g => (
          <Card key={g.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-[hsl(var(--primary))]/10"><FolderOpen className="h-5 w-5 text-[hsl(var(--primary))]" /></div>
                  <div>
                    <h3 className="font-medium">{g.name}</h3>
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{g.description || 'No description'}</p>
                    <p className="text-sm mt-1">{g.number_count} numbers</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => edit(g)}><Pencil className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => del(g.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Group</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Group name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <Button className="w-full" onClick={save}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
