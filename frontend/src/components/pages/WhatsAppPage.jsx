import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, Smartphone, X, Loader2 } from 'lucide-react';

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState([]);
  const [qrModal, setQrModal] = useState(null); // { id, number, qr, status }
  const pollRef = useRef(null);
  const canvasRef = useRef(null);

  const load = () => api.get('/whatsapp/sessions').then(r => setSessions(r.data?.data || r.data || [])).catch(() => setSessions([]));
  useEffect(() => { load(); }, []);

  // QR polling
  useEffect(() => {
    if (!qrModal?.id) return;

    const poll = async () => {
      try {
        const r = await api.get(`/whatsapp/qr/${qrModal.id}`);
        const { qr, status } = r.data;

        if (status === 'active') {
          setQrModal(null);
          load();
          return;
        }

        setQrModal(prev => prev ? { ...prev, qr: qr || prev.qr, status } : null);
      } catch (e) {}
    };

    pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [qrModal?.id]);

  // Render QR to canvas
  useEffect(() => {
    if (qrModal?.qr && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, qrModal.qr, { width: 280, margin: 2 }, (err) => {
        if (err) console.error('QR render error:', err);
      });
    }
  }, [qrModal?.qr]);

  const connect = async (id, number) => {
    setQrModal({ id, number, qr: null, status: 'connecting' });
    try {
      const r = await api.post(`/whatsapp/connect/${id}`);
      if (r.data.status === 'active') {
        setQrModal(null);
        load();
      } else if (r.data.qr) {
        setQrModal(prev => prev ? { ...prev, qr: r.data.qr, status: r.data.status } : null);
      }
    } catch (err) {
      setQrModal(null);
      alert('Connection failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const disconnect = async (id) => { await api.post(`/whatsapp/disconnect/${id}`); load(); };
  const reconnect = async (id, number) => {
    setQrModal({ id, number, qr: null, status: 'reconnecting' });
    try {
      const r = await api.post(`/whatsapp/reconnect/${id}`);
      if (r.data.status === 'active') {
        setQrModal(null);
        load();
      } else if (r.data.qr) {
        setQrModal(prev => prev ? { ...prev, qr: r.data.qr, status: r.data.status } : null);
      }
    } catch (err) {
      setQrModal(null);
    }
  };
  const reportBan = async (id) => { if (confirm('Report this number as banned?')) { await api.post(`/whatsapp/report-ban/${id}`); load(); } };

  const closeModal = () => {
    clearInterval(pollRef.current);
    setQrModal(null);
  };

  const statusBadge = (status) => {
    const map = {
      active: { variant: 'success', icon: <Wifi className="h-3 w-3" /> },
      qr_pending: { variant: 'warning', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
      connecting: { variant: 'warning', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
      reconnecting: { variant: 'warning', icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
      inactive: { variant: 'secondary', icon: <WifiOff className="h-3 w-3" /> },
      banned: { variant: 'destructive', icon: <AlertTriangle className="h-3 w-3" /> },
      disconnected: { variant: 'secondary', icon: <WifiOff className="h-3 w-3" /> },
    };
    const m = map[status] || map.inactive;
    return (
      <Badge variant={m.variant} className="flex items-center gap-1 w-fit">
        {m.icon} {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">WhatsApp Sessions</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Manage WhatsApp connections via Baileys</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
          <Button onClick={async () => {
            if (!confirm('Force connect semua nomor yang belum active?')) return;
            try {
              await api.post('/whatsapp/force-connect-all');
              setTimeout(load, 3000);
            } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
          }}><Wifi className="h-4 w-4 mr-2" />Force Connect All</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Sent / Failed</TableHead>
                <TableHead>Connected</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono">{s.number}</TableCell>
                  <TableCell>{statusBadge(s.wa_status || s.status)}</TableCell>
                  <TableCell>{s.health_score}%</TableCell>
                  <TableCell>{s.total_sent || 0} / {s.total_failed || 0}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{s.connected_at || '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {(s.wa_status || s.status) !== 'active' ? (
                        <Button size="sm" onClick={() => connect(s.id, s.number)}>
                          <Wifi className="h-3 w-3 mr-1" />Connect
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => disconnect(s.id)}>
                            <WifiOff className="h-3 w-3 mr-1" />Disconnect
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => reconnect(s.id, s.number)}>
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => reportBan(s.id)}>
                        <AlertTriangle className="h-3 w-3 text-red-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!sessions.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No phone numbers registered. Add numbers first.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* QR Code Modal */}
      {qrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-[hsl(var(--card))] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Connect {qrModal.number}</h3>
              <Button size="sm" variant="ghost" onClick={closeModal}><X className="h-4 w-4" /></Button>
            </div>

            <div className="flex flex-col items-center gap-4">
              {qrModal.qr ? (
                <>
                  <canvas ref={canvasRef} className="rounded-lg" />
                  <p className="text-sm text-muted-foreground text-center">
                    Scan this QR code with WhatsApp on your phone
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {qrModal.status === 'active' ? 'Connected!' : 'Waiting for QR code...'}
                  </p>
                </>
              )}

              <Badge variant="outline" className="text-xs">
                Status: {qrModal.status}
              </Badge>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
