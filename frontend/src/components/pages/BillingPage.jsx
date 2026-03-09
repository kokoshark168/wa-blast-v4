import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, TrendingUp, BarChart3 } from 'lucide-react';

export default function BillingPage() {
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [tab, setTab] = useState('usage');

  useEffect(() => {
    api.get('/billing/plans').then(r => setPlans(r.data)).catch(() => {});
    api.get('/billing/usage').then(r => setUsage(r.data)).catch(() => {});
    api.get('/billing/admin').then(r => setAdminData(r.data)).catch(() => {});
  }, []);

  const subscribe = async (planId) => {
    if (!confirm('Subscribe to this plan?')) return;
    await api.post('/billing/subscribe', { plan_id: planId });
    api.get('/billing/usage').then(r => setUsage(r.data));
  };

  const usageByAction = {};
  (usage?.usage || []).forEach(u => { usageByAction[u.action] = u.total; });
  const msgSent = usageByAction['message_sent'] || 0;
  const msgLimit = usage?.subscription?.message_limit || usage?.tenant?.max_messages_per_day || 1000;
  const usagePct = Math.min(100, Math.round(msgSent / msgLimit * 100));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CreditCard className="h-8 w-8 text-[hsl(var(--primary))]" />
          <h1 className="text-3xl font-bold">Billing & Usage</h1>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'usage' ? 'default' : 'outline'} onClick={() => setTab('usage')}>My Usage</Button>
          <Button variant={tab === 'plans' ? 'default' : 'outline'} onClick={() => setTab('plans')}>Plans</Button>
          <Button variant={tab === 'admin' ? 'default' : 'outline'} onClick={() => setTab('admin')}>Admin Overview</Button>
        </div>
      </div>

      {tab === 'usage' && (
        <div className="space-y-6">
          {usage?.subscription && (
            <Card><CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Current Plan: <span className="text-[hsl(var(--primary))]">{usage.subscription.plan_name}</span></h3>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">${usage.subscription.monthly_price}/month · Period: {usage.subscription.current_period_start} → {usage.subscription.current_period_end}</p>
                </div>
                <Badge>{usage.subscription.status}</Badge>
              </div>
            </CardContent></Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{msgSent.toLocaleString()}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Messages Sent This Month</div>
              <div className="mt-3 w-full bg-[hsl(var(--secondary))] rounded-full h-3">
                <div className={`h-3 rounded-full transition-all ${usagePct > 80 ? 'bg-red-500' : usagePct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${usagePct}%` }} />
              </div>
              <div className="text-xs mt-1 text-[hsl(var(--muted-foreground))]">{usagePct}% of {msgLimit.toLocaleString()} limit</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-400">{(usageByAction['message_delivered'] || 0).toLocaleString()}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Delivered</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-400">{(usageByAction['api_call'] || 0).toLocaleString()}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">API Calls</div>
            </CardContent></Card>
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map(plan => (
            <Card key={plan.id} className={usage?.subscription?.plan_id === plan.id ? 'border-[hsl(var(--primary))] border-2' : ''}>
              <CardContent className="pt-6 text-center space-y-4">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                <div className="text-4xl font-bold">${plan.monthly_price}<span className="text-sm font-normal text-[hsl(var(--muted-foreground))]">/mo</span></div>
                <div className="space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
                  <p>📨 {plan.message_limit.toLocaleString()} messages/month</p>
                  <p>📱 {plan.number_limit} phone numbers</p>
                  {(plan.features || []).map(f => <p key={f}>✅ {f.replace(/_/g, ' ')}</p>)}
                </div>
                {usage?.subscription?.plan_id === plan.id
                  ? <Badge className="w-full justify-center py-2">Current Plan</Badge>
                  : <Button onClick={() => subscribe(plan.id)} className="w-full">
                      {plan.monthly_price === 0 ? 'Select Free' : 'Subscribe'}
                    </Button>
                }
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'admin' && adminData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{adminData.tenantUsage?.length || 0}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Tenants</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-400">${adminData.totalRevenue || 0}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Monthly Revenue</div>
            </CardContent></Card>
            <Card><CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-blue-400">{adminData.subscriptions?.length || 0}</div>
              <div className="text-sm text-[hsl(var(--muted-foreground))]">Active Subscriptions</div>
            </CardContent></Card>
          </div>

          <Card><CardHeader><CardTitle>Tenant Usage This Month</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-[hsl(var(--border))]">
                  <th className="text-left py-2">Tenant</th><th className="text-left">Email</th>
                  <th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">API Calls</th>
                </tr></thead>
                <tbody>
                  {(adminData.tenantUsage || []).map(t => (
                    <tr key={t.id} className="border-b border-[hsl(var(--border))]">
                      <td className="py-2 font-medium">{t.name}</td>
                      <td>{t.email}</td>
                      <td className="text-right">{t.messages_sent}</td>
                      <td className="text-right">{t.messages_delivered}</td>
                      <td className="text-right">{t.api_calls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
