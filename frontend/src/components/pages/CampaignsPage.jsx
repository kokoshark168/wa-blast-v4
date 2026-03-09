import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Plus, Play, Pause, XCircle, Trash2, Rocket, BarChart3, Image, AlertTriangle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import RichMessageEditor from '@/components/editor/RichMessageEditor';
import InteractiveEditor from '@/components/editor/InteractiveEditor';

const statusColors = { draft: 'secondary', scheduled: 'info', running: 'success', paused: 'warning', completed: 'default' };

// === Reassign Modal Component ===
function ReassignModal({ campaign, onClose, onDone }) {
  const [activeNumbers, setActiveNumbers] = useState([]);
  const [allNumbers, setAllNumbers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [stuckInfo, setStuckInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reassigning, setReassigning] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/campaigns/${campaign.id}/stuck`),
      api.get('/phone-numbers'),
    ]).then(([stuckRes, numRes]) => {
      const nums = (numRes.data?.data || numRes.data || []);
      const active = nums.filter(n => n.status === 'active');
      setStuckInfo(stuckRes.data);
      setAllNumbers(nums);
      setActiveNumbers(active);
      setSelectedIds(active.map(n => n.id));
    }).catch(console.error).finally(() => setLoading(false));
  }, [campaign.id]);

  const toggleNumber = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const doReassign = async () => {
    setReassigning(true);
    try {
      const res = await api.post(`/campaigns/${campaign.id}/reassign`, { number_ids: selectedIds });
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    }
    setReassigning(false);
  };

  if (loading) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent><div className="text-center py-8 text-[hsl(var(--muted-foreground))]">Loading...</div></DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-yellow-400" />
            Reassign Senders — {campaign.name}
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {result.error ? (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400">
                ❌ {result.error}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400">
                ✅ {result.reassigned.toLocaleString()} pesan berhasil di-reassign ke {result.newSenders.length} nomor aktif
              </div>
            )}
            <Button onClick={() => { onDone(); onClose(); }} className="w-full">OK</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {stuckInfo && stuckInfo.stuck > 0 && (
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
                ⚠️ {stuckInfo.stuck.toLocaleString()} pesan pending dengan nomor tidak aktif
                {stuckInfo.totalPending > stuckInfo.stuck && (
                  <span className="text-[hsl(var(--muted-foreground))]"> (dari {stuckInfo.totalPending.toLocaleString()} total pending)</span>
                )}
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Pilih nomor aktif untuk reassign:</p>
              <div className="max-h-[250px] overflow-y-auto space-y-1.5">
                {activeNumbers.length > 0 ? activeNumbers.map(n => (
                  <label key={n.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors text-sm ${
                    selectedIds.includes(n.id) ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5' : 'border-[hsl(var(--border))]'
                  }`}>
                    <input type="checkbox" checked={selectedIds.includes(n.id)} onChange={() => toggleNumber(n.id)} className="rounded" />
                    <span className="font-mono">{n.number || `#${n.id}`}</span>
                    <Badge variant="success" className="ml-auto text-xs">Health: {n.health_score}</Badge>
                  </label>
                )) : (
                  <p className="text-center py-4 text-red-400 text-sm">❌ Tidak ada nomor aktif. Sambungkan nomor baru terlebih dahulu.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">Batal</Button>
              <Button onClick={doReassign} disabled={!selectedIds.length || reassigning} className="flex-1">
                <RefreshCw className={`h-4 w-4 mr-2 ${reassigning ? 'animate-spin' : ''}`} />
                {reassigning ? 'Reassigning...' : 'Reassign'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [contactLists, setContactLists] = useState([]);
  const [numbers, setNumbers] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '', template_id: '', contact_list_id: '', numbers_used: [],
    schedule_at: '', delay_min: 5, delay_max: 15, message: '',
    interactive_type: 'none', interactive_data: {}
  });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [reassignCampaign, setReassignCampaign] = useState(null);
  const [stuckCounts, setStuckCounts] = useState({});

  const navigate = useNavigate();

  const load = () => {
    api.get('/campaigns').then(r => {
      const camps = r.data?.data || r.data || [];
      setCampaigns(camps);
      // Check stuck counts for running/paused campaigns
      camps.filter(c => ['running', 'paused'].includes(c.status)).forEach(c => {
        api.get(`/campaigns/${c.id}/stuck`).then(sr => {
          if (sr.data?.stuck > 0) setStuckCounts(prev => ({ ...prev, [c.id]: sr.data }));
        }).catch(() => {});
      });
    }).catch(() => setCampaigns([]));
    api.get('/templates').then(r => setTemplates(r.data?.data || r.data || [])).catch(() => setTemplates([]));
    api.get('/contact-lists').then(r => setContactLists(r.data?.data || r.data || [])).catch(() => setContactLists([]));
    api.get('/phone-numbers').then(r => setNumbers((r.data?.data || r.data || []).filter(n => n.status === 'active'))).catch(() => setNumbers([]));
  };
  useEffect(() => { load(); }, []);

  const toggleSender = (id) => {
    setForm(f => ({
      ...f,
      numbers_used: f.numbers_used.includes(id) ? f.numbers_used.filter(n => n !== id) : [...f.numbers_used, id]
    }));
  };

  const handleMediaUpload = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return; }
    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setMediaPreview(e.target.result);
    reader.readAsDataURL(file);
  }, []);

  const handleMediaRemove = useCallback(() => {
    setMediaFile(null);
    setMediaPreview(null);
  }, []);

  const [createError, setCreateError] = useState('');
  const createCampaign = async () => {
    try {
      setCreateError('');
      const res = await api.post('/campaigns', {
        name: form.name,
        template_id: form.template_id || null,
        contact_list_id: form.contact_list_id || null,
        numbers_used: JSON.stringify(form.numbers_used),
        schedule_at: form.schedule_at || null,
        delay_min: form.delay_min,
        delay_max: form.delay_max,
        message: form.message || null,
        interactive_type: form.interactive_type || 'none',
        interactive_data: form.interactive_type !== 'none' ? JSON.stringify(form.interactive_data) : null,
      });

      // Upload media if present
      const campaignId = res.data?.id || res.data?.data?.id;
      if (mediaFile && campaignId) {
        const fd = new FormData();
        fd.append('media', mediaFile);
        await api.post(`/campaigns/${campaignId}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }

      setShowCreate(false); setStep(1);
      setForm({ name: '', template_id: '', contact_list_id: '', numbers_used: [], schedule_at: '', delay_min: 5, delay_max: 15, message: '', interactive_type: 'none', interactive_data: {} });
      setMediaFile(null); setMediaPreview(null);
      load();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Unknown error';
      setCreateError(msg);
      console.error('Create campaign error:', msg);
    }
  };

  const launch = async (id) => { if (confirm('Launch campaign?')) { await api.post(`/campaigns/${id}/launch`); load(); } };
  const pause = async (id) => { await api.post(`/campaigns/${id}/pause`); load(); };
  const resume = async (id) => { await api.post(`/campaigns/${id}/resume`); load(); };
  const cancel = async (id) => { if (confirm('Cancel?')) { await api.post(`/campaigns/${id}/cancel`); load(); } };
  const del = async (id) => { if (confirm('Delete?')) { await api.delete(`/campaigns/${id}`); load(); } };

  const wizardSteps = ['Name', 'Senders', 'Targets', 'Template', 'Review'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campaigns</h1>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New Campaign</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Contact List</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {c.name}
                      {c.media_url && <Image className="h-3.5 w-3.5 text-blue-400" title="Has image" />}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={statusColors[c.status] || 'secondary'}>{c.status}</Badge></TableCell>
                  <TableCell>{templates.find(t => t.id === c.template_id)?.name || '-'}</TableCell>
                  <TableCell>{contactLists.find(l => l.id === c.contact_list_id)?.name || '-'}</TableCell>
                  <TableCell className="text-xs">{c.created_at?.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {c.status === 'draft' && <Button size="sm" variant="ghost" onClick={() => launch(c.id)} title="Launch"><Rocket className="h-3 w-3 text-green-400" /></Button>}
                      {c.status === 'running' && <Button size="sm" variant="ghost" onClick={() => pause(c.id)}><Pause className="h-3 w-3" /></Button>}
                      {c.status === 'paused' && <Button size="sm" variant="ghost" onClick={() => resume(c.id)}><Play className="h-3 w-3" /></Button>}
                      {stuckCounts[c.id]?.stuck > 0 && ['running', 'paused'].includes(c.status) && (
                        <Button size="sm" variant="ghost" onClick={() => setReassignCampaign(c)} title="Reassign senders">
                          <RefreshCw className="h-3 w-3 text-yellow-400" />
                        </Button>
                      )}
                      {['running', 'scheduled', 'paused'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => cancel(c.id)}><XCircle className="h-3 w-3 text-red-400" /></Button>}
                      {['sent', 'running', 'completed', 'paused'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => navigate(`/campaigns/${c.id}/report`)} title="Report"><BarChart3 className="h-3 w-3 text-blue-400" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => del(c.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                    {stuckCounts[c.id]?.stuck > 0 && ['running', 'paused'].includes(c.status) && (
                      <div className="mt-1 text-xs text-yellow-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {stuckCounts[c.id].stuck} pesan stuck
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {campaigns.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No campaigns yet</p>}
        </CardContent>
      </Card>

      {/* Reassign Modal */}
      {reassignCampaign && (
        <ReassignModal
          campaign={reassignCampaign}
          onClose={() => setReassignCampaign(null)}
          onDone={() => { setStuckCounts({}); load(); }}
        />
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Campaign - Step {step}: {wizardSteps[step - 1]}</DialogTitle>
            <div className="flex gap-2 mt-2">
              {wizardSteps.map((s, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--border))]'}`} />
              ))}
            </div>
          </DialogHeader>

          <div className="space-y-4 min-h-[200px]">
            {step === 1 && (
              <>
                <Input placeholder="Campaign name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-[hsl(var(--muted-foreground))]">Min Delay (s)</label><Input type="number" value={form.delay_min} onChange={e => setForm({ ...form, delay_min: Number(e.target.value) })} /></div>
                  <div><label className="text-xs text-[hsl(var(--muted-foreground))]">Max Delay (s)</label><Input type="number" value={form.delay_max} onChange={e => setForm({ ...form, delay_max: Number(e.target.value) })} /></div>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--muted-foreground))] mb-2 block">Kapan Jalankan?</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: '🚀 Sekarang', value: '' },
                      { label: '⏱️ 10 Menit', value: '10m' },
                      { label: '⏱️ 30 Menit', value: '30m' },
                      { label: '⏱️ 1 Jam', value: '1h' },
                      { label: '⏱️ 2 Jam', value: '2h' },
                      { label: '⏱️ 6 Jam', value: '6h' },
                      { label: '🌅 Besok 9 Pagi', value: 'tomorrow9' },
                      { label: '📅 Pilih Waktu', value: 'custom' },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => {
                          if (opt.value === '') setForm(f => ({ ...f, schedule_at: '', _scheduleLabel: 'Sekarang' }));
                          else if (opt.value === 'custom') setForm(f => ({ ...f, _scheduleLabel: 'custom' }));
                          else if (opt.value === 'tomorrow9') {
                            const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0);
                            setForm(f => ({ ...f, schedule_at: d.toISOString(), _scheduleLabel: 'Besok 9 Pagi' }));
                          } else {
                            const mins = opt.value.endsWith('h') ? parseInt(opt.value) * 60 : parseInt(opt.value);
                            const d = new Date(Date.now() + mins * 60000);
                            setForm(f => ({ ...f, schedule_at: d.toISOString(), _scheduleLabel: opt.label }));
                          }
                        }}
                        className={`p-2 rounded-lg border text-sm font-medium transition-colors ${
                          (opt.value === '' && !form.schedule_at && form._scheduleLabel !== 'custom') ||
                          (opt.value === 'custom' && form._scheduleLabel === 'custom') ||
                          (form._scheduleLabel === opt.label)
                            ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                            : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
                        }`}
                      >{opt.label}</button>
                    ))}
                  </div>
                  {form._scheduleLabel === 'custom' && (
                    <Input type="datetime-local" className="mt-2" value={form.schedule_at ? new Date(form.schedule_at).toISOString().slice(0, 16) : ''} onChange={e => setForm({ ...form, schedule_at: new Date(e.target.value).toISOString() })} />
                  )}
                </div>
              </>
            )}
            {step === 2 && (
              <div className="space-y-2">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Select sender numbers ({form.numbers_used.length} selected, leave empty for auto)</p>
                <div className="max-h-[300px] overflow-y-auto space-y-2">
                  {numbers.map(n => (
                    <label key={n.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${form.numbers_used.includes(n.id) ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5' : 'border-[hsl(var(--border))]'}`}>
                      <input type="checkbox" checked={form.numbers_used.includes(n.id)} onChange={() => toggleSender(n.id)} className="rounded" />
                      <span className="font-mono text-sm">{n.number}</span>
                      <Badge variant="success" className="ml-auto text-xs">{n.health_score}</Badge>
                    </label>
                  ))}
                  {numbers.length === 0 && <p className="text-[hsl(var(--muted-foreground))] text-center py-4">No active numbers</p>}
                </div>
              </div>
            )}
            {step === 3 && (
              <Select value={form.contact_list_id} onChange={e => setForm({ ...form, contact_list_id: Number(e.target.value) })}>
                <option value="">Select contact list...</option>
                {contactLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count || 0} contacts)</option>)}
              </Select>
            )}
            {step === 4 && (
              <div className="space-y-4">
                <Select value={form.template_id} onChange={e => setForm({ ...form, template_id: Number(e.target.value), message: e.target.value ? '' : form.message })}>
                  <option value="">No template (type message below)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                {!form.template_id && (
                  <div className="space-y-4">
                    <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">Message Content</label>
                    <RichMessageEditor
                      value={form.message}
                      onChange={(msg) => setForm({ ...form, message: msg })}
                      mediaPreview={mediaPreview}
                      onMediaUpload={handleMediaUpload}
                      onMediaRemove={handleMediaRemove}
                    />

                    {/* Interactive Message Type */}
                    <div>
                      <label className="text-xs text-[hsl(var(--muted-foreground))] mb-1 block">Message Type</label>
                      <div className="flex gap-2">
                        {[
                          { value: 'none', label: '📝 Text Only' },
                          { value: 'buttons', label: '🔗 CTA Buttons' },
                          { value: 'list', label: '📋 List Menu' },
                        ].map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setForm(f => ({ ...f, interactive_type: opt.value, interactive_data: opt.value === 'none' ? {} : (f.interactive_data || {}) }))}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                              form.interactive_type === opt.value
                                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                                : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary))]/50'
                            }`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>

                    {form.interactive_type !== 'none' && (
                      <InteractiveEditor
                        type={form.interactive_type}
                        data={form.interactive_data}
                        onChange={(data) => setForm(f => ({ ...f, interactive_data: data }))}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
            {step === 5 && (
              <div className="space-y-3 text-sm">
                <div><span className="text-[hsl(var(--muted-foreground))]">Name:</span> {form.name}</div>
                <div><span className="text-[hsl(var(--muted-foreground))]">Senders:</span> {form.numbers_used.length || 'Auto'}</div>
                <div><span className="text-[hsl(var(--muted-foreground))]">Contact List:</span> {contactLists.find(l => l.id === form.contact_list_id)?.name || '-'}</div>
                <div><span className="text-[hsl(var(--muted-foreground))]">Template:</span> {templates.find(t => t.id === form.template_id)?.name || 'Direct message'}</div>
                {!form.template_id && form.message && <div><span className="text-[hsl(var(--muted-foreground))]">Message:</span> <span className="whitespace-pre-wrap">{form.message.slice(0, 200)}{form.message.length > 200 ? '...' : ''}</span></div>}
                {mediaPreview && <div className="flex items-center gap-2"><span className="text-[hsl(var(--muted-foreground))]">Media:</span><img src={mediaPreview} alt="" className="h-12 rounded" /><Badge variant="info">Image attached</Badge></div>}
                {form.interactive_type !== 'none' && <div><span className="text-[hsl(var(--muted-foreground))]">Interactive:</span> <Badge variant="info">{form.interactive_type}</Badge></div>}
                <div><span className="text-[hsl(var(--muted-foreground))]">Delay:</span> {form.delay_min}-{form.delay_max}s</div>
                <div><span className="text-[hsl(var(--muted-foreground))]">Schedule:</span> {!form.schedule_at ? '🚀 Jalankan Sekarang' : form._scheduleLabel || new Date(form.schedule_at).toLocaleString('id-ID')}</div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : setShowCreate(false)}>
              {step > 1 ? 'Back' : 'Cancel'}
            </Button>
            {step < 5 ? (
              <Button onClick={() => setStep(step + 1)}>Next</Button>
            ) : (
              <div className="flex flex-col items-end gap-2">
                {createError && <p className="text-red-500 text-sm">❌ {createError}</p>}
                <Button onClick={createCampaign}><Rocket className="h-4 w-4 mr-2" />Create Campaign</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
