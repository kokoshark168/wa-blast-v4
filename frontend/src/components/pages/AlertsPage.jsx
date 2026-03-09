import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCheck, Trash2, AlertTriangle, Info, AlertCircle, CheckCircle } from 'lucide-react';

const typeIcons = { info: Info, warning: AlertTriangle, error: AlertCircle, success: CheckCircle, ban: AlertCircle, disconnect: AlertTriangle, reply: Info, blast_error: AlertCircle };
const typeColors = { info: 'text-blue-400', warning: 'text-yellow-400', error: 'text-red-400', success: 'text-green-400', ban: 'text-red-400', disconnect: 'text-yellow-400', reply: 'text-blue-400', blast_error: 'text-red-400' };

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);

  const load = () => api.get('/alerts').then(r => setAlerts(r.data?.data || r.data || [])).catch(() => setAlerts([]));
  useEffect(() => { load(); }, []);

  const markRead = async (id) => { await api.put(`/alerts/${id}/read`); load(); };
  const markAllRead = async () => { await api.post('/alerts/mark-all-read'); load(); };
  const del = async (id) => { await api.delete(`/alerts/${id}`); load(); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Alerts</h1>
        <Button variant="outline" onClick={markAllRead}><CheckCheck className="h-4 w-4 mr-2" />Mark All Read</Button>
      </div>

      <div className="space-y-3">
        {alerts.map(a => {
          const Icon = typeIcons[a.type] || Info;
          return (
            <Card key={a.id} className={a.read ? 'opacity-60' : ''}>
              <CardContent className="p-4 flex items-start gap-4">
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${typeColors[a.type] || 'text-blue-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{a.type}</Badge>
                    {!a.read && <Badge variant="info" className="text-xs">New</Badge>}
                  </div>
                  <p className="text-sm mt-1">{a.message}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{a.created_at?.slice(0, 16)}</p>
                </div>
                <div className="flex gap-1">
                  {!a.read && <Button size="sm" variant="ghost" onClick={() => markRead(a.id)}><CheckCircle className="h-3 w-3" /></Button>}
                  <Button size="sm" variant="ghost" onClick={() => del(a.id)}><Trash2 className="h-3 w-3 text-red-400" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {alerts.length === 0 && <p className="text-center py-12 text-[hsl(var(--muted-foreground))]">No alerts</p>}
      </div>
    </div>
  );
}
