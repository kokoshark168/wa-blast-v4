import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';

export default function AntiBanPage() {
  const [profiles, setProfiles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', min_delay: 5, max_delay: 15, typing_simulation: true, online_status: true });

  const load = () => api.get('/settings/antiban').then(r => setProfiles(r.data?.data || r.data || [])).catch(() => setProfiles([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) await api.put(`/settings/antiban/${editing}`, form);
    else await api.post('/settings/antiban', form);
    setShowForm(false); setEditing(null); load();
  };

  const edit = (p) => {
    setEditing(p.id);
    setForm({ name: p.name, min_delay: p.min_delay, max_delay: p.max_delay, typing_simulation: !!p.typing_simulation, online_status: !!p.online_status });
    setShowForm(true);
  };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/settings/antiban/${id}`); load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Anti-Ban Profiles</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Configure profiles to minimize ban risk</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ name: '', min_delay: 5, max_delay: 15, typing_simulation: true, online_status: true }); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />New Profile
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map(p => (
          <Card key={p.id}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" />{p.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Delay range</span><span>{p.min_delay}-{p.max_delay}s</span></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Typing simulation</span><Badge variant={p.typing_simulation ? 'success' : 'secondary'}>{p.typing_simulation ? 'On' : 'Off'}</Badge></div>
                <div className="flex justify-between"><span className="text-[hsl(var(--muted-foreground))]">Online status</span><Badge variant={p.online_status ? 'success' : 'secondary'}>{p.online_status ? 'On' : 'Off'}</Badge></div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="ghost" onClick={() => edit(p)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {profiles.length === 0 && <p className="text-center py-12 text-[hsl(var(--muted-foreground))] col-span-3">No profiles yet</p>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Anti-Ban Profile</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Profile name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div className="grid grid-cols-2 gap-4">
              <div><label className="text-xs text-[hsl(var(--muted-foreground))]">Min delay (s)</label><Input type="number" value={form.min_delay} onChange={e => setForm({ ...form, min_delay: Number(e.target.value) })} /></div>
              <div><label className="text-xs text-[hsl(var(--muted-foreground))]">Max delay (s)</label><Input type="number" value={form.max_delay} onChange={e => setForm({ ...form, max_delay: Number(e.target.value) })} /></div>
            </div>
            <div className="space-y-2">
              {[['typing_simulation', 'Typing Simulation'], ['online_status', 'Online Status']].map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form[key]} onChange={e => setForm({ ...form, [key]: e.target.checked })} className="rounded" />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
            <Button className="w-full" onClick={save}>Save Profile</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
