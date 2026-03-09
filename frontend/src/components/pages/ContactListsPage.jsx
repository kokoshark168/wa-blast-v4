import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Upload, Users, ChevronRight, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ContactListsPage() {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [showAddList, setShowAddList] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [listForm, setListForm] = useState({ name: '' });
  const [bulkText, setBulkText] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  const loadLists = () => api.get('/contact-lists').then(r => setLists(r.data?.data || r.data || [])).catch(() => setLists([]));
  useEffect(() => { loadLists(); }, []);

  const loadContacts = (listId) => {
    setSelectedList(listId);
    api.get(`/contacts/lists/${listId}/contacts`).then(r => setContacts(r.data?.data || r.data || [])).catch(() => setContacts([]));
  };

  const addList = async () => {
    await api.post('/contact-lists', listForm);
    setShowAddList(false); setListForm({ name: '' }); loadLists();
  };

  const deleteList = async (id) => {
    if (!confirm('Delete this list and all contacts?')) return;
    await api.delete(`/contact-lists/${id}`); setSelectedList(null); setContacts([]); loadLists();
  };

  const fileImport = async () => {
    if (!importFile || !selectedList) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const r = await api.post(`/contact-lists/${selectedList}/import`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(r.data);
      loadContacts(selectedList); loadLists();
    } catch (e) {
      setImportResult({ error: e.response?.data?.error || e.message });
    }
    setImporting(false);
  };

  const bulkImport = async () => {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const cts = lines.map(l => {
      const [phone, name] = l.split(',').map(s => s.trim());
      return { phone, name: name || '' };
    });
    await api.post(`/contacts/lists/${selectedList}/bulk`, { contacts: cts });
    setShowBulk(false); setBulkText(''); loadContacts(selectedList); loadLists();
  };

  const deleteContact = async (id) => {
    await api.delete(`/contacts/contacts/${id}`); loadContacts(selectedList); loadLists();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Contact Lists</h1>
        <Button onClick={() => setShowAddList(true)}><Plus className="h-4 w-4 mr-2" />New List</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3">
          {lists.map(l => (
            <Card key={l.id} className={`cursor-pointer transition-colors ${selectedList === l.id ? 'ring-2 ring-[hsl(var(--primary))]' : ''}`} onClick={() => loadContacts(l.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{l.name}</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">{l.count || 0} contacts</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); deleteList(l.id); }}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                  <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
                </div>
              </CardContent>
            </Card>
          ))}
          {lists.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No lists yet</p>}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">{selectedList ? 'Contacts' : 'Select a list'}</CardTitle>
              {selectedList && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowBulk(true)}><Upload className="h-3 w-3 mr-1" />Text Import</Button>
                  <Button size="sm" onClick={() => { setShowFileImport(true); setImportFile(null); setImportResult(null); }}><FileSpreadsheet className="h-3 w-3 mr-1" />CSV/Excel Import</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedList ? (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono">{c.phone}</TableCell>
                        <TableCell>{c.name || '-'}</TableCell>
                        <TableCell><Button size="sm" variant="ghost" onClick={() => deleteContact(c.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {contacts.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No contacts in this list</p>}
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-[hsl(var(--muted-foreground))]">
                <Users className="h-8 w-8 mr-2" /> Select a contact list
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAddList} onOpenChange={setShowAddList}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Contact List</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="List name" value={listForm.name} onChange={e => setListForm({ ...listForm, name: e.target.value })} />
            <Button className="w-full" onClick={addList}>Create</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import Contacts (Text)</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Format: phone,name (one per line)</p>
            <textarea className="flex w-full rounded-md border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm min-h-[200px] font-mono" placeholder={"+6281234567890,John\n+6281234567891,Jane"} value={bulkText} onChange={e => setBulkText(e.target.value)} />
            <Button className="w-full" onClick={bulkImport}>Import</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showFileImport} onOpenChange={setShowFileImport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Import CSV / Excel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Upload a CSV or Excel file with columns: <strong>phone_number</strong> (required), <strong>name</strong> (optional), <strong>tags</strong> (optional)
            </p>
            <div className="border-2 border-dashed border-[hsl(var(--border))] rounded-lg p-6 text-center">
              <input type="file" accept=".csv,.xlsx,.xls" onChange={e => { setImportFile(e.target.files[0]); setImportResult(null); }} className="block w-full text-sm" />
              {importFile && <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">📄 {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</p>}
            </div>

            {importResult && !importResult.error && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-1">
                <div className="flex items-center gap-2 text-green-400 font-medium"><CheckCircle className="h-4 w-4" /> Import Complete</div>
                <div className="grid grid-cols-2 gap-2 text-sm mt-2">
                  <div>✅ Imported: <strong>{importResult.imported}</strong></div>
                  <div>⏭️ Skipped: <strong>{importResult.skipped}</strong></div>
                  <div>🔄 Duplicates: <strong>{importResult.duplicates}</strong></div>
                  <div>❌ Invalid: <strong>{importResult.invalid}</strong></div>
                </div>
              </div>
            )}
            {importResult?.error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-400"><AlertCircle className="h-4 w-4" /> {importResult.error}</div>
              </div>
            )}

            <Button className="w-full" onClick={fileImport} disabled={!importFile || importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
