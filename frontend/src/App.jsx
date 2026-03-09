import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/toast';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/components/pages/LoginPage';
import DashboardPage from '@/components/pages/DashboardPage';
import WhatsAppPage from '@/components/pages/WhatsAppPage';
import PhoneNumbersPage from '@/components/pages/PhoneNumbersPage';
import NumberGroupsPage from '@/components/pages/NumberGroupsPage';
import ProxiesPage from '@/components/pages/ProxiesPage';
import TemplatesPage from '@/components/pages/TemplatesPage';
import CampaignsPage from '@/components/pages/CampaignsPage';
import ContactListsPage from '@/components/pages/ContactListsPage';
import BlastQueuePage from '@/components/pages/BlastQueuePage';
import BreedingPage from '@/components/pages/BreedingPage';
import StatisticsPage from '@/components/pages/StatisticsPage';
import RepliesPage from '@/components/pages/RepliesPage';
import BlacklistPage from '@/components/pages/BlacklistPage';
import MediaPage from '@/components/pages/MediaPage';
import UsersPage from '@/components/pages/UsersPage';
import AuditLogPage from '@/components/pages/AuditLogPage';
import SettingsPage from '@/components/pages/SettingsPage';
import AlertsPage from '@/components/pages/AlertsPage';
import ApiKeysPage from '@/components/pages/ApiKeysPage';
import CampaignReportPage from '@/components/pages/CampaignReportPage';
import ShortLinkDomainsPage from '@/components/pages/ShortLinkDomainsPage';
import LinkTrackingPage from '@/components/pages/LinkTrackingPage';
import AutoReplyPage from '@/components/pages/AutoReplyPage';
import ReportPage from '@/components/pages/ReportPage';
import ABTestingPage from '@/components/pages/ABTestingPage';
import DripCampaignsPage from '@/components/pages/DripCampaignsPage';
import SegmentsPage from '@/components/pages/SegmentsPage';
import TenantsPage from '@/components/pages/TenantsPage';
import BillingPage from '@/components/pages/BillingPage';
import WebhooksPage from '@/components/pages/WebhooksPage';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[hsl(var(--muted-foreground))]">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="whatsapp" element={<WhatsAppPage />} />
              <Route path="phone-numbers" element={<PhoneNumbersPage />} />
              <Route path="phone-groups" element={<NumberGroupsPage />} />
              <Route path="proxies" element={<ProxiesPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="contact-lists" element={<ContactListsPage />} />
              <Route path="campaigns" element={<CampaignsPage />} />
              <Route path="campaigns/:id/report" element={<CampaignReportPage />} />
              <Route path="blast-queue" element={<BlastQueuePage />} />
              <Route path="breeding" element={<BreedingPage />} />
              <Route path="statistics" element={<StatisticsPage />} />
              <Route path="replies" element={<RepliesPage />} />
              <Route path="blacklist" element={<BlacklistPage />} />
              <Route path="media" element={<MediaPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit-log" element={<AuditLogPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="api-keys" element={<ApiKeysPage />} />
              <Route path="shortlink-domains" element={<ShortLinkDomainsPage />} />
              <Route path="link-tracking" element={<LinkTrackingPage />} />
              <Route path="auto-reply" element={<AutoReplyPage />} />
              <Route path="reports" element={<ReportPage />} />
              <Route path="ab-testing" element={<ABTestingPage />} />
              <Route path="drip-campaigns" element={<DripCampaignsPage />} />
              <Route path="segments" element={<SegmentsPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="webhooks" element={<WebhooksPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
