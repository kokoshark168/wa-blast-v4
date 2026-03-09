import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Trash2, Users, Download, Wand2, ChevronLeft } from 'lucide-react';

const CRITERIA_TYPES = [
  { value: 'replied', label: 'Replied to messages' },
  { value: 'clicked', label: 'Clicked links' },
  { value: 'ignored', label: 'Ignored (sent but no reply)' },
  { value: 'blacklisted', label: 'Blacklisted' },
  { value: 'never_contacted', label: 'Never contacted' },
];

export default function SegmentsPage() {
  const [segments, setSegments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', criteria: [{ type: 'replied' }] });

  const load = () => {
    api.get('/segments').then(r => setSegments(r.data?.data || [])).catch(() => setSegments([]));
  };
  useEffect(() => { load(); }, []);

  const loadDetail = (id) => {
    api.get(`/segments/${id}`).then(r => {
      setSelected(r.data);
      setContacts(r.data.contacts || []);
    }).catch(() => {});
  };

  const create = async () => {
    await api.post('/segments', { name: form.name, criteria_json: JSON.stringify(form.criteria) });
    setShowCreate(false); setForm({ name: '', criteria: [{ type: 'replied' }] }); load();
  };

  const del = async (id) => {
    if (!confirm('Delete segment?')) return;
    await api.delete(`/segments/${id}`);
    if (selected?.id === id) { setSelected(null); setContacts([]); }
    load();
  };

  const seedDefaults = async () => {
    await api.post('/segments/seed-defaults');
    load();
  };

  const addCriteria = () => setForm({ ...form, criteria: [...form.criteria, { type: 'replied' }] });
  const removeCriteria = (idx) => setForm({ ...form, criteria: form.criteria.filter((_, i) => i !== idx) });
  const updateCriteria = (idx, field, value) => {
    const c = [...form.criteria];
    c[idx] = { ...c[idx], [field]: value };
    setForm({ ...form, criteria: c });
  };

  const exportCSV = () => {
    if (!contacts.length) return;
    const header = 'phone,name,list_id';
    const rows = contacts.map(c => `"${c.phone}","${c.name || ''}",${c.list_id}`);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `segment-${selected?.id}-contacts.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (selected) {
    const criteria = JSON.parse(selected.criteria_json || '[]');
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => { setSelected(null); setContacts([]); load(); }}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
          <h1 className="text-3xl font-bold">{selected.name}</h1>
          <Badge variant="info">{selected.contact_count} contacts</Badge>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {criteria.map((c, i) => (
                <Badge key={i} variant="outline">{CRITERIA_TYPES.find(t => t.value === c.type)?.label || c.type}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Contacts ({contacts.length})</CardTitle>
            <Button size="sm" variant="outline" onClick={exportCSV} disabled={!contacts.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>List ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.slice(0, 100).map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                    <TableCell>{c.name || '-'}</TableCell>
                    <TableCell>{c.list_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {contacts.length > 100 && <p className="text-xs text-[hsl(var(--muted-foreground))] mt-2">Showing first 100 of {contacts.length}</p>}
            {!contacts.length && <p className="text-center py-4 text-[hsl(var(--muted-foreground))]">No contacts match this segment</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Segments</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seedDefaults}><Wand2 className="h-4 w-4 mr-1" />Seed Defaults</Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Segment</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead>Contacts</TableHead>
                <TableHead>Auto-Update</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map(s => {
                const criteria = JSON.parse(s.criteria_json || '[]');
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => loadDetail(s.id)}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {criteria.map((c, i) => <Badge key={i} variant="outline" className="text-xs">{c.type}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="info">{s.contact_count}</Badge></TableCell>
                    <TableCell>{s.auto_update ? '✅' : '❌'}</TableCell>
                    <TableCell>
                      <div onClick={e => e.stopPropagation()}>
                        <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!segments.length && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No segments yet. Try seeding defaults!</p>}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Segment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Segment name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div>
              <label className="text-xs text-[hsl(var(--muted-foreground))] mb-2 block">Criteria (all must match)</label>
              {form.criteria.map((c, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <Select value={c.type} onChange={e => updateCriteria(i, 'type', e.target.value)} className="flex-1">
                    {CRITERIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                  {form.criteria.length > 1 && <Button size="sm" variant="ghost" onClick={() => removeCriteria(i)}><Trash2 className="h-3 w-3" /></Button>}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addCriteria}><Plus className="h-3 w-3 mr-1" />Add Condition</Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={create} disabled={!form.name}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
