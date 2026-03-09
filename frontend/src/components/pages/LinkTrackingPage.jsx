import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, ExternalLink, MousePointerClick, BarChart3, Link2 } from 'lucide-react';

export default function LinkTrackingPage() {
  const [links, setLinks] = useState([]);
  const [domains, setDomains] = useState([]);
  const [stats, setStats] = useState({ totalLinks: 0, totalClicks: 0, activeLinks: 0 });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/tracked-links').then(r => r.data?.data || r.data || []).catch(() => []),
      api.get('/tracked-links/stats').then(r => r.data?.data || r.data || {}).catch(() => ({})),
      api.get('/domains').then(r => r.data?.data || r.data || []).catch(() => []),
    ]).then(([l, s, d]) => {
      setLinks(Array.isArray(l) ? l : []);
      setStats(s);
      setDomains(Array.isArray(d) ? d : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Link Tracking</h1>
          <p className="text-[hsl(var(--muted-foreground))]">Track clicks on shortened links in your campaigns</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <Link2 className="h-8 w-8 mx-auto mb-2 text-blue-400" />
            <div className="text-2xl font-bold">{stats.totalLinks || links.length || 0}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Links</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <MousePointerClick className="h-8 w-8 mx-auto mb-2 text-green-400" />
            <div className="text-2xl font-bold">{stats.totalClicks || 0}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Clicks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <BarChart3 className="h-8 w-8 mx-auto mb-2 text-purple-400" />
            <div className="text-2xl font-bold">{domains.length}</div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Domains</p>
          </CardContent>
        </Card>
      </div>

      {/* Domains */}
      {domains.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Domains</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {domains.map(d => (
                <Badge key={d.id} variant={d.is_primary ? 'default' : 'secondary'} className="text-sm py-1 px-3">
                  {d.domain} {d.is_primary ? '⭐' : ''} 
                  {d.is_verified ? '✅' : '❌'}
                  {d.total_clicks > 0 && ` (${d.total_clicks} clicks)`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Links Table */}
      <Card>
        <CardHeader><CardTitle>Tracked Links ({links.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Short URL</TableHead>
                <TableHead>Original URL</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Clicks</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {links.map(l => (
                <TableRow key={l.id}>
                  <TableCell>
                    <a href={l.short_url} target="_blank" rel="noopener" className="text-blue-400 hover:underline flex items-center gap-1 text-sm font-mono">
                      {l.short_code || l.short_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-[hsl(var(--muted-foreground))]">{l.original_url}</TableCell>
                  <TableCell className="text-sm">{l.campaign_name || l.campaign_id || '-'}</TableCell>
                  <TableCell><Badge variant="default">{l.clicks || l.click_count || 0}</Badge></TableCell>
                  <TableCell className="text-xs text-[hsl(var(--muted-foreground))]">{l.created_at?.slice(0, 16)}</TableCell>
                </TableRow>
              ))}
              {!links.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-[hsl(var(--muted-foreground))]">
                    No tracked links yet. Links are created automatically when you launch a campaign with link tracking enabled.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
