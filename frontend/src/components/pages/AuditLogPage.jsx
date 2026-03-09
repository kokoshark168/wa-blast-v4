import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

export default function AuditLogPage() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const load = () => api.get('/audit-log', { params: { limit: 50, offset: (page - 1) * 50 } }).then(r => { setLogs(r.data?.data || r.data || []); setTotal(r.data?.total || 0); }).catch(() => { setLogs([]); setTotal(0); });
  useEffect(() => { load(); }, [page]);

  const actionColors = { create: 'success', update: 'info', delete: 'error' };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Audit Log</h1>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map(l => {
                const actionBase = l.action?.split('.')[1] || l.action;
                return (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs whitespace-nowrap">{l.created_at?.slice(0, 16)}</TableCell>
                    <TableCell>#{l.user_id || '-'}</TableCell>
                    <TableCell><Badge variant={actionColors[actionBase] || 'outline'}>{l.action}</Badge></TableCell>
                    <TableCell className="text-xs max-w-xs truncate">{l.details}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {logs.length === 0 && <p className="text-center py-8 text-[hsl(var(--muted-foreground))]">No audit logs</p>}
          <div className="flex justify-center gap-2 mt-4">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="text-sm py-2">Page {page} of {Math.ceil(total / 50) || 1}</span>
            <Button size="sm" variant="outline" disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
