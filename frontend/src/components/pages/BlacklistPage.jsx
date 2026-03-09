import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Search, Upload } from 'lucide-react';

export default function BlacklistPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ phone: '', reason: '' });
  const [bulkText, setBulkText] = useState('');

  const load = () => api.get('/blacklist', { params: { search: search || undefined, limit: 200 } }).then(r => setItems(r.data?.data || r.data || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, [search]);

  const add = async () => { await api.post('/blacklist', form); setShowAdd(false); setForm({ phone: '', reason: '' }); load(); };
  const bulkAdd = async () => {
    const phones = bulkText.trim().split('\n').filter(Boolean);
    await api.post('/blacklist/bulk', { phones });
    setShowBulk(false); setBulkText(''); load();
  };
  const del = async (id) => { await api.delete(`/blacklist/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Blacklist / DND</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowBulk(true)}><Upload className="h-4 w-4 mr-2" />Bulk Add</Button>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-2" />Add Number</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>Reason</TableHead><TableHead>Added</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.phone}</TableCell>
                  <TableCell>{b.reason || '-'}</TableCell>
                  <TableCell className="text-xs">{b.created_at?.slice(0, 10)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => del(b.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Blacklist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Phone number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Reason (optional)" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
            <Button className="w-full" onClick={add}>Add</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk Add to Blacklist</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <textarea className="flex w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm min-h-[200px] font-mono" placeholder="One number per line" value={bulkText} onChange={e => setBulkText(e.target.value)} />
            <Button className="w-full" onClick={bulkAdd}>Add All</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
