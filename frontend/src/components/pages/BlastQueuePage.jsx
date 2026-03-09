import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Play, RotateCw } from 'lucide-react';

const statusColors = { pending: 'warning', sent: 'success', failed: 'error' };

export default function BlastQueuePage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [filterStatus, setFilterStatus] = useState('');

  const load = () => {
    api.get('/blast-queue', { params: { status: filterStatus || undefined } }).then(r => { setItems(r.data?.data || r.data || []); }).catch(() => setItems([]));
    api.get('/blast-queue/stats').then(r => setStats(r.data || {})).catch(() => setStats({}));
  };
  useEffect(() => { load(); }, [filterStatus]);

  const processBatch = async () => {
    await api.post('/blast-queue/process-batch', { batch_size: 20 });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Blast Queue</h1>
        <Button onClick={processBatch}><Play className="h-4 w-4 mr-2" />Process Batch</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[['pending', stats.pending], ['sent', stats.sent], ['failed', stats.failed], ['total', stats.total]].map(([k, v]) => (
          <Card key={k}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{v || 0}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] capitalize">{k}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="w-40">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </Select>
            <Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(q => (
                <TableRow key={q.id}>
                  <TableCell>#{q.id}</TableCell>
                  <TableCell>Campaign #{q.campaign_id}</TableCell>
                  <TableCell>#{q.sender_number_id || '-'}</TableCell>
                  <TableCell className="font-mono text-xs">{q.target_phone}</TableCell>
                  <TableCell><Badge variant={statusColors[q.status] || 'secondary'}>{q.status}</Badge></TableCell>
                  <TableCell className="text-xs">{q.sent_at?.slice(0, 16) || '-'}</TableCell>
                  <TableCell className="text-xs text-red-400">{q.error || '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {items.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No queue items</p>}
        </CardContent>
      </Card>
    </div>
  );
}
