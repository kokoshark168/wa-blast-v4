import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Play, Square, Trash2, Flame } from 'lucide-react';

export default function BreedingPage() {
  const [sessions, setSessions] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', number_ids: [], frequency_minutes: 60, message_templates: 'Hey!\nHow are you?\nGood morning!' });

  const load = () => {
    api.get('/breeding').then(r => setSessions(r.data?.data || r.data || [])).catch(() => setSessions([]));
    api.get('/phone-numbers').then(r => setNumbers(r.data?.data || r.data || [])).catch(() => setNumbers([]));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api.post('/breeding', {
      name: form.name,
      number_ids: form.number_ids,
      frequency_minutes: form.frequency_minutes,
      message_templates: form.message_templates.split('\n').filter(Boolean)
    });
    setShowCreate(false); load();
  };

  const toggleNumber = (id) => {
    setForm(f => ({ ...f, number_ids: f.number_ids.includes(id) ? f.number_ids.filter(n => n !== id) : [...f.number_ids, id] }));
  };

  const startStop = async (id, action) => { await api.post(`/breeding/${id}/${action}`); load(); };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/breeding/${id}`); load(); } };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Breeding / Warming</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Auto-chat between numbers to warm them up</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Session</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map(s => {
          let numIds = [];
          try { numIds = JSON.parse(s.number_ids || '[]'); } catch {}
          const isActive = s.status === 'active';
          return (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Flame className={`h-4 w-4 ${isActive ? 'text-orange-400' : 'text-[hsl(var(--muted-foreground))]'}`} />
                    {s.name}
                  </CardTitle>
                  <Badge variant={isActive ? 'success' : 'secondary'}>{s.status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
                  <p>Numbers: {numIds.length}</p>
                  <p>Frequency: every {s.frequency_minutes} min</p>
                  <p>Last run: {s.last_run_at || 'Never'}</p>
                </div>
                <div className="flex gap-2 mt-4">
                  {isActive ? (
                    <Button size="sm" variant="outline" onClick={() => startStop(s.id, 'stop')}><Square className="h-3 w-3 mr-1" />Stop</Button>
                  ) : (
                    <Button size="sm" onClick={() => startStop(s.id, 'start')}><Play className="h-3 w-3 mr-1" />Start</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {sessions.length === 0 && <p className="text-center py-12 text-[hsl(var(--muted-foreground))] col-span-3">No breeding sessions yet</p>}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Breeding Session</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Session name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="Frequency (minutes)" type="number" value={form.frequency_minutes} onChange={e => setForm({ ...form, frequency_minutes: Number(e.target.value) })} />
            <div>
              <p className="text-sm mb-2">Select numbers ({form.number_ids.length})</p>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {numbers.map(n => (
                  <label key={n.id} className="flex items-center gap-2 p-2 rounded hover:bg-[hsl(var(--accent))] cursor-pointer text-sm">
                    <input type="checkbox" checked={form.number_ids.includes(n.id)} onChange={() => toggleNumber(n.id)} />
                    <span className="font-mono">{n.number}</span>
                    <Badge variant={n.status === 'active' ? 'success' : 'secondary'} className="ml-auto text-xs">{n.status}</Badge>
                  </label>
                ))}
              </div>
            </div>
            <Textarea placeholder="Messages (one per line)" value={form.message_templates} onChange={e => setForm({ ...form, message_templates: e.target.value })} />
            <Button className="w-full" onClick={create}>Create Session</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
