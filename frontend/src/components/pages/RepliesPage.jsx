import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Check, CheckCheck, Trash2 } from 'lucide-react';

export default function RepliesPage() {
  const [replies, setReplies] = useState([]);
  const [total, setTotal] = useState(0);

  const load = () => api.get('/replies').then(r => { setReplies(r.data?.data || r.data || []); setTotal(r.data?.total || 0); }).catch(() => { setReplies([]); setTotal(0); });
  useEffect(() => { load(); }, []);

  const markRead = async (id) => { await api.put(`/replies/${id}/read`); load(); };
  const markAllRead = async () => { await api.post('/replies/mark-all-read'); load(); };
  const del = async (id) => { await api.delete(`/replies/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Reply Inbox <Badge variant="info" className="ml-2">{total}</Badge></h1>
        <Button variant="outline" onClick={markAllRead}><CheckCheck className="h-4 w-4 mr-2" />Mark All Read</Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {replies.map(r => (
                <TableRow key={r.id} className={r.read ? '' : 'bg-[hsl(var(--primary))]/5'}>
                  <TableCell className="font-mono text-xs">{r.from_number}</TableCell>
                  <TableCell className="font-mono text-xs">{r.to_number}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.message}</TableCell>
                  <TableCell className="text-xs">{r.received_at?.slice(0, 16)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {!r.read && <Button size="sm" variant="ghost" onClick={() => markRead(r.id)}><Check className="h-3 w-3" /></Button>}
                      <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {replies.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No replies yet</p>}
        </CardContent>
      </Card>
    </div>
  );
}
