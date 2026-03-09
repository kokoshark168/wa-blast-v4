import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { FlaskConical, Plus, Rocket, Trophy, ChevronLeft } from 'lucide-react';

export default function ABTestingPage() {
  const [tests, setTests] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [contactLists, setContactLists] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [form, setForm] = useState({
    name: '', contact_list_id: '', message_a: '', message_b: '',
    template_id_a: '', template_id_b: '', delay_min: 5, delay_max: 15
  });

  const load = () => {
    api.get('/ab-tests').then(r => setTests(r.data?.data || [])).catch(() => setTests([]));
    api.get('/templates').then(r => setTemplates(r.data?.data || r.data || [])).catch(() => {});
    api.get('/contact-lists').then(r => setContactLists(r.data?.data || r.data || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api.post('/ab-tests', {
      ...form,
      contact_list_id: Number(form.contact_list_id),
      template_id_a: form.template_id_a ? Number(form.template_id_a) : null,
      template_id_b: form.template_id_b ? Number(form.template_id_b) : null,
    });
    setShowCreate(false);
    setForm({ name: '', contact_list_id: '', message_a: '', message_b: '', template_id_a: '', template_id_b: '', delay_min: 5, delay_max: 15 });
    load();
  };

  const launchTest = async (groupId) => {
    if (!confirm('Launch A/B test? Contacts will be split 50/50.')) return;
    await api.post(`/ab-tests/${groupId}/launch`);
    load();
  };

  const viewComparison = async (groupId) => {
    const r = await api.get(`/ab-tests/${groupId}/compare`);
    setComparison(r.data);
  };

  if (comparison) {
    const { variant_a, variant_b, winner } = comparison;
    const MetricRow = ({ label, a, b, suffix = '' }) => (
      <TableRow>
        <TableCell className="font-medium">{label}</TableCell>
        <TableCell className={winner === 'A' ? 'text-green-400 font-bold' : ''}>{a}{suffix}</TableCell>
        <TableCell className={winner === 'B' ? 'text-green-400 font-bold' : ''}>{b}{suffix}</TableCell>
      </TableRow>
    );

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setComparison(null)}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
          <h1 className="text-3xl font-bold">A/B Test Comparison</h1>
          {winner && (
            <Badge variant="success" className="text-sm"><Trophy className="h-3 w-3 mr-1 inline" />Variant {winner} Wins!</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card className={winner === 'A' ? 'border-green-500/50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Variant A {winner === 'A' && <Trophy className="h-4 w-4 text-yellow-400" />}
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-[hsl(var(--muted-foreground))]">{variant_a.campaign.name}</p></CardContent>
          </Card>
          <Card className={winner === 'B' ? 'border-green-500/50' : ''}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Variant B {winner === 'B' && <Trophy className="h-4 w-4 text-yellow-400" />}
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-[hsl(var(--muted-foreground))]">{variant_b.campaign.name}</p></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Metrics Comparison</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Variant A</TableHead>
                  <TableHead>Variant B</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <MetricRow label="Total Contacts" a={variant_a.stats.total} b={variant_b.stats.total} />
                <MetricRow label="Sent" a={variant_a.stats.sent} b={variant_b.stats.sent} />
                <MetricRow label="Delivered" a={variant_a.stats.delivered} b={variant_b.stats.delivered} />
                <MetricRow label="Read" a={variant_a.stats.read} b={variant_b.stats.read} />
                <MetricRow label="Failed" a={variant_a.stats.failed} b={variant_b.stats.failed} />
                <MetricRow label="Delivery Rate" a={variant_a.stats.delivery_rate} b={variant_b.stats.delivery_rate} suffix="%" />
                <MetricRow label="Read Rate" a={variant_a.stats.read_rate} b={variant_b.stats.read_rate} suffix="%" />
                <MetricRow label="Link Clicks" a={variant_a.stats.clicks} b={variant_b.stats.clicks} />
                <MetricRow label="CTR" a={variant_a.stats.ctr} b={variant_b.stats.ctr} suffix="%" />
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">A/B Testing</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Compare message variants to find what works best</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New A/B Test</Button>
      </div>

      {!tests.length ? (
        <Card><CardContent className="p-12 text-center text-[hsl(var(--muted-foreground))]">
          <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No A/B tests yet. Create one to compare message variants.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test</TableHead>
                  <TableHead>Variant A</TableHead>
                  <TableHead>Variant B</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tests.map(t => (
                  <TableRow key={t.group_id}>
                    <TableCell className="font-medium">{t.campaigns[0]?.name?.replace(' (Variant A)', '') || t.group_id}</TableCell>
                    <TableCell><Badge variant="outline">A</Badge> {t.campaigns[0]?.status}</TableCell>
                    <TableCell><Badge variant="outline">B</Badge> {t.campaigns[1]?.status}</TableCell>
                    <TableCell><Badge variant={t.campaigns[0]?.status === 'running' ? 'success' : 'secondary'}>{t.campaigns[0]?.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.campaigns[0]?.status === 'draft' && (
                          <Button size="sm" variant="ghost" onClick={() => launchTest(t.group_id)} title="Launch"><Rocket className="h-3 w-3 text-green-400" /></Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => viewComparison(t.group_id)} title="Compare"><FlaskConical className="h-3 w-3 text-blue-400" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create A/B Test</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input placeholder="Test name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <Select value={form.contact_list_id} onChange={e => setForm({ ...form, contact_list_id: e.target.value })}>
              <option value="">Select contact list...</option>
              {contactLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.count || 0} contacts)</option>)}
            </Select>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Variant A</h3>
                <Select value={form.template_id_a} onChange={e => setForm({ ...form, template_id_a: e.target.value, message_a: e.target.value ? '' : form.message_a })}>
                  <option value="">No template (type below)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                {!form.template_id_a && (
                  <textarea className="w-full min-h-[100px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm" placeholder="Message A..." value={form.message_a} onChange={e => setForm({ ...form, message_a: e.target.value })} />
                )}
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Variant B</h3>
                <Select value={form.template_id_b} onChange={e => setForm({ ...form, template_id_b: e.target.value, message_b: e.target.value ? '' : form.message_b })}>
                  <option value="">No template (type below)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
                {!form.template_id_b && (
                  <textarea className="w-full min-h-[100px] rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm" placeholder="Message B..." value={form.message_b} onChange={e => setForm({ ...form, message_b: e.target.value })} />
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={create} disabled={!form.name || !form.contact_list_id}>Create A/B Test</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
