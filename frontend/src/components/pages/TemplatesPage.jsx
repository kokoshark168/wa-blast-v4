import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editing, setEditing] = useState(null);
  const [preview, setPreview] = useState('');
  const [form, setForm] = useState({ name: '', content: '' });

  const load = () => api.get('/templates').then(r => setTemplates(r.data?.data || r.data || [])).catch(() => setTemplates([]));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) await api.put(`/templates/${editing}`, form);
    else await api.post('/templates', form);
    setShowForm(false); setEditing(null); setForm({ name: '', content: '' }); load();
  };

  const edit = (t) => { setEditing(t.id); setForm({ name: t.name, content: t.content }); setShowForm(true); };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/templates/${id}`); load(); } };

  const previewTemplate = async (t) => {
    const { data } = await api.post(`/templates/${t.id}/preview`, { variables: { name: 'John', company: 'Acme Corp' } });
    setPreview(data.content); setShowPreview(true);
  };

  const insertVar = (v) => setForm({ ...form, content: form.content + `{${v}}` });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Templates</h1>
        <Button onClick={() => { setEditing(null); setForm({ name: '', content: '' }); setShowForm(true); }}><Plus className="h-4 w-4 mr-2" />New Template</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="text-base">{t.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap line-clamp-4 mb-4">{t.content}</pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => previewTemplate(t)}><Eye className="h-3 w-3 mr-1" />Preview</Button>
                <Button size="sm" variant="ghost" onClick={() => edit(t)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="ghost" onClick={() => del(t.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {templates.length === 0 && <p className="text-center py-12 text-[hsl(var(--muted-foreground))] col-span-3">No templates yet</p>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Create'} Template</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Template name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <div className="flex gap-2 flex-wrap">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Insert:</span>
              {['name', 'company', 'phone'].map(v => (
                <button key={v} onClick={() => insertVar(v)} className="text-xs px-2 py-1 rounded bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))]">{`{${v}}`}</button>
              ))}
              <button onClick={() => insertVar('spin:option1|option2|option3')} className="text-xs px-2 py-1 rounded bg-[hsl(var(--secondary))] hover:bg-[hsl(var(--accent))]">{'{spin:...}'}</button>
            </div>
            <Textarea placeholder="Message body..." value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} className="min-h-[200px] font-mono" />
            <Button className="w-full" onClick={save}>Save Template</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent>
          <DialogHeader><DialogTitle>Template Preview</DialogTitle></DialogHeader>
          <div className="bg-[hsl(var(--secondary))] rounded-lg p-4">
            <pre className="whitespace-pre-wrap text-sm">{preview}</pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
