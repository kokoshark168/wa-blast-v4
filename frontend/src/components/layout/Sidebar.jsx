import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Phone, FileText, Megaphone, Flame,
  BarChart3, MessageSquare, Settings, Bell, Contact, Key, LogOut, X,
  Link, FileBarChart, FlaskConical, Timer, Tags, Zap, Filter,
  ChevronDown, ChevronRight, Send, Wifi, Shield
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const sidebarGroups = [
  {
    id: 'dashboard',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    id: 'blast',
    label: 'Blast',
    icon: Send,
    items: [
      { to: '/campaigns', icon: Megaphone, label: 'Campaigns' },
      { to: '/contact-lists', icon: Contact, label: 'Contact Lists' },
      { to: '/templates', icon: FileText, label: 'Templates' },
    ],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    icon: Phone,
    items: [
      { to: '/phone-numbers', icon: Phone, label: 'Phone Numbers' },
      { to: '/whatsapp', icon: Wifi, label: 'WhatsApp Sessions' },
      { to: '/auto-reply', icon: MessageSquare, label: 'Auto Reply' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Analytics',
    icon: BarChart3,
    items: [
      { to: '/reports', icon: FileBarChart, label: 'Reports' },
      { to: '/statistics', icon: BarChart3, label: 'Statistics' },
      { to: '/alerts', icon: Bell, label: 'Alerts' },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Zap,
    items: [
      { to: '/ab-testing', icon: FlaskConical, label: 'A/B Testing' },
      { to: '/drip-campaigns', icon: Timer, label: 'Drip Campaigns' },
      { to: '/segments', icon: Tags, label: 'Segments' },
      { to: '/shortlink-domains', icon: Link, label: 'Short Links' },
      { to: '/link-tracking', icon: Link, label: 'Link Tracking' },
      { to: '/proxies', icon: Shield, label: 'Proxies' },
      { to: '/breeding', icon: Flame, label: 'Warm-up' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
      { to: '/api-keys', icon: Key, label: 'API Keys' },
    ],
  },
];

const STORAGE_KEY = 'sidebar-expanded';

function getInitialExpanded() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { blast: true, whatsapp: true, reports: true };
}

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState(getInitialExpanded);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  // Auto-expand group containing active route
  useEffect(() => {
    for (const group of sidebarGroups) {
      if (group.items.some(item => 
        item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
      )) {
        if (group.label && !expanded[group.id]) {
          setExpanded(prev => ({ ...prev, [group.id]: true }));
        }
      }
    }
  }, [location.pathname]);

  const toggleGroup = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen w-60 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col transition-transform duration-200",
      "lg:translate-x-0",
      open ? "translate-x-0" : "-translate-x-full"
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[hsl(var(--primary))] flex items-center justify-center text-white font-bold text-xs">WA</div>
          <div>
            <h1 className="font-bold text-sm leading-tight">WA Blast</h1>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))] leading-tight">Backoffice</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-[hsl(var(--accent))] lg:hidden">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {sidebarGroups.map((group) => {
          const isExpanded = expanded[group.id] !== false;
          const GroupIcon = group.icon;

          // Standalone items (no group header)
          if (!group.label) {
            return group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onClose}
                className={({ isActive }) => cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </NavLink>
            ));
          }

          return (
            <div key={group.id} className="pt-1">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
              >
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <GroupIcon className="h-3.5 w-3.5" />
                {group.label}
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="ml-2 space-y-0.5">
                  {group.items.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      onClick={onClose}
                      className={({ isActive }) => cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                        isActive
                          ? "bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] font-medium"
                          : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--foreground))]"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-[hsl(var(--border))] p-3">
        <div className="flex items-center justify-between">
          <div className="text-sm min-w-0">
            <p className="font-medium truncate text-xs">{user?.name || user?.phone}</p>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{user?.role}</p>
          </div>
          <button onClick={logout} className="p-1.5 rounded-md hover:bg-[hsl(var(--accent))] shrink-0" title="Logout">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
