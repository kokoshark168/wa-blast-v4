import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Trash2, Play, Pause, ArrowUp, ArrowDown, Users, ChevronLeft } from 'lucide-react';

export default function DripCampaignsPage() {
  const [sequences, setSequences] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showAddStep, setShowAddStep] = useState(false);
  const [editStep, setEditStep] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [stepForm, setStepForm] = useState({ delay_hours: 1, delay_unit: 'hours', message_text: '', template_id: '' });
  const [enrollListId, setEnrollListId] = useState('');
  const [contactLists, setContactLists] = useState([]);
  const [templates, setTemplates] = useState([]);

  const load = () => {
    api.get('/drip-sequences').then(r => setSequences(r.data?.data || [])).catch(() => setSequences([]));
    api.get('/contact-lists').then(r => setContactLists(r.data?.data || r.data || [])).catch(() => {});
    api.get('/templates').then(r => setTemplates(r.data?.data || r.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const loadDetail = (id) => {
    api.get(`/drip-sequences/${id}`).then(r => setSelected(r.data)).catch(() => {});
  };

  const create = async () => {
    await api.post('/drip-sequences', form);
    setShowCreate(false); setForm({ name: '', description: '' }); load();
  };

  const toggleActive = async (seq) => {
    await api.patch(`/drip-sequences/${seq.id}`, { is_active: seq.is_active ? 0 : 1 });
    load(); if (selected?.id === seq.id) loadDetail(seq.id);
  };

  const del = async (id) => {
    if (!confirm('Delete this sequence?')) return;
    await api.delete(`/drip-sequences/${id}`);
    if (selected?.id === id) setSelected(null);
    load();
  };

  const addStep = async () => {
    const hours = stepForm.delay_unit === 'days' ? stepForm.delay_hours * 24 : stepForm.delay_hours;
    await api.post(`/drip-sequences/${selected.id}/steps`, {
      delay_hours: hours,
      message_text: stepForm.message_text || null,
      template_id: stepForm.template_id || null,
    });
    setShowAddStep(false);
    setStepForm({ delay_hours: 1, delay_unit: 'hours', message_text: '', template_id: '' });
    loadDetail(selected.id);
  };

  const updateStep = async () => {
    const hours = stepForm.delay_unit === 'days' ? stepForm.delay_hours * 24 : stepForm.delay_hours;
    await api.patch(`/drip-sequences/${selected.id}/steps/${editStep.id}`, {
      delay_hours: hours,
      message_text: stepForm.message_text || null,
      template_id: stepForm.template_id || null,
    });
    setEditStep(null);
    setStepForm({ delay_hours: 1, delay_unit: 'hours', message_text: '', template_id: '' });
    loadDetail(selected.id);
  };

  const deleteStep = async (stepId) => {
    if (!confirm('Delete step?')) return;
    await api.delete(`/drip-sequences/${selected.id}/steps/${stepId}`);
    loadDetail(selected.id);
  };

  const moveStep = async (stepId, direction) => {
    const steps = selected.steps || [];
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    const newOrder = [...steps.map(s => s.id)];
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newOrder.length) return;
    [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
    await api.post(`/drip-sequences/${selected.id}/steps/reorder`, { order: newOrder });
    loadDetail(selected.id);
  };

  const enroll = async () => {
    if (!enrollListId) return;
    await api.post(`/drip-sequences/${selected.id}/enroll`, { contact_list_id: Number(enrollListId) });
    setShowEnroll(false); setEnrollListId('');
    loadDetail(selected.id);
  };

  const cancelEnrollment = async (enrollId) => {
    await api.post(`/drip-sequences/${selected.id}/enrollments/${enrollId}/cancel`);
    loadDetail(selected.id);
  };

  const formatDelay = (hours) => {
    if (hours >= 24) return `${Math.round(hours / 24 * 10) / 10} days`;
    return `${hours} hours`;
  };

  // Detail view
  if (selected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => { setSelected(null); load(); }}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
          <h1 className="text-3xl font-bold">{selected.name}</h1>
          <Badge variant={selected.is_active ? 'success' : 'secondary'}>{selected.is_active ? 'Active' : 'Paused'}</Badge>
        </div>
        {selected.description && <p className="text-[hsl(var(--muted-foreground))]">{selected.description}</p>}

        {/* Steps */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Steps ({(selected.steps || []).length})</CardTitle>
            <Button size="sm" onClick={() => { setStepForm({ delay_hours: 1, delay_unit: 'hours', message_text: '', template_id: '' }); setShowAddStep(true); }}><Plus className="h-4 w-4 mr-1" />Add Step</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(selected.steps || []).map((step, idx) => (
                <div key={step.id} className="flex items-start gap-4 p-4 rounded-lg border border-[hsl(var(--border))]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-8 h-8 rounded-full bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] flex items-center justify-center font-bold text-sm">{idx + 1}</div>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveStep(step.id, 'up')} disabled={idx === 0} className="p-0.5 hover:bg-[hsl(var(--accent))] rounded disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => moveStep(step.id, 'down')} disabled={idx === (selected.steps || []).length - 1} className="p-0.5 hover:bg-[hsl(var(--accent))] rounded disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">Wait {formatDelay(step.delay_hours)}</Badge>
                      {step.template_id && <Badge variant="info">Template #{step.template_id}</Badge>}
                    </div>
                    <p className="text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">{step.message_text || (step.template_id ? `Using template #${step.template_id}` : 'No message')}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      const hours = step.delay_hours >= 24 ? step.delay_hours / 24 : step.delay_hours;
                      const unit = step.delay_hours >= 24 ? 'days' : 'hours';
                      setStepForm({ delay_hours: hours, delay_unit: unit, message_text: step.message_text || '', template_id: step.template_id || '' });
                      setEditStep(step);
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteStep(step.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                  </div>
                </div>
              ))}
              {!(selected.steps || []).length && <p className="text-center py-4 text-[hsl(var(--muted-foreground))]">No steps yet. Add your first step.</p>}
            </div>
          </CardContent>
        </Card>

        {/* Enrollments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Enrollments ({(selected.enrollments || []).length})</CardTitle>
            <Button size="sm" onClick={() => setShowEnroll(true)}><Users className="h-4 w-4 mr-1" />Enroll Contacts</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Phone</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Send</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(selected.enrollments || []).map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{e.contact_phone}</TableCell>
                    <TableCell>{e.current_step}/{(selected.steps || []).length}</TableCell>
                    <TableCell><Badge variant={e.status === 'active' ? 'success' : e.status === 'completed' ? 'default' : 'secondary'}>{e.status}</Badge></TableCell>
                    <TableCell className="text-xs">{e.next_send_at ? new Date(e.next_send_at).toLocaleString() : '-'}</TableCell>
                    <TableCell>
                      {e.status === 'active' && <Button size="sm" variant="ghost" onClick={() => cancelEnrollment(e.id)}>Cancel</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!(selected.enrollments || []).length && <p className="text-center py-4 text-[hsl(var(--muted-foreground))]">No enrollments yet</p>}
          </CardContent>
        </Card>

        {/* Add/Edit Step Dialog */}
        <Dialog open={showAddStep || !!editStep} onOpenChange={(v) => { if (!v) { setShowAddStep(false); setEditStep(null); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editStep ? 'Edit Step' : 'Add Step'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">Delay</label>
                  <Input type="number" min="0" step="0.5" value={stepForm.delay_hours} onChange={e => setStepForm({ ...stepForm, delay_hours: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))]">Unit</label>
                  <Select value={stepForm.delay_unit} onChange={e => setStepForm({ ...stepForm, delay_unit: e.target.value })}>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Template (optional)</label>
                <Select value={stepForm.template_id} onChange={e => setStepForm({ ...stepForm, template_id: Number(e.target.value) || '' })}>
                  <option value="">No template</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--muted-foreground))]">Message (or use template above)</label>
                <textarea className="w-full min-h-[100px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm" value={stepForm.message_text} onChange={e => setStepForm({ ...stepForm, message_text: e.target.value })} placeholder="Type message..." />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setShowAddStep(false); setEditStep(null); }}>Cancel</Button>
                <Button onClick={editStep ? updateStep : addStep}>{editStep ? 'Update' : 'Add'} Step</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Enroll Dialog */}
        <Dialog open={showEnroll} onOpenChange={setShowEnroll}>
          <DialogContent>
            <DialogHeader><DialogTitle>Enroll Contacts</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={enrollListId} onChange={e => setEnrollListId(e.target.value)}>
                <option value="">Select contact list...</option>
                {contactLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count || 0})</option>)}
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEnroll(false)}>Cancel</Button>
                <Button onClick={enroll} disabled={!enrollListId}>Enroll</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Drip Campaigns</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Sequence</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Steps</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sequences.map(s => (
                <TableRow key={s.id} className="cursor-pointer" onClick={() => loadDetail(s.id)}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Paused'}</Badge></TableCell>
                  <TableCell>{s.step_count}</TableCell>
                  <TableCell>{s.enrollment_count}</TableCell>
                  <TableCell>{s.active_count}</TableCell>
                  <TableCell>{s.completed_count}</TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
                        {s.is_active ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => del(s.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!sequences.length && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No drip sequences yet</p>}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Drip Sequence</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Sequence name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <textarea className="w-full min-h-[80px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm" placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
