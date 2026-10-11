import {
  Bell,
  Bookmark,
  Compass,
  Handshake,
  LayoutDashboard,
  MessagesSquare,
  Rocket,
  Settings,
  ShieldAlert,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { UserRole } from '@investfund/shared';

export interface NavItem {
  href: string;
  key:
    | 'dashboard'
    | 'startups'
    | 'discover'
    | 'recommended'
    | 'saved'
    | 'connections'
    | 'messages'
    | 'deals'
    | 'notifications'
    | 'settings'
    | 'adminOverview'
    | 'adminReports';
  icon: LucideIcon;
  badge?: 'messages' | 'notifications';
  /** Matches only the exact path (dashboards). */
  exact?: boolean;
}

const shared: NavItem[] = [
  { href: '/app/connections', key: 'connections', icon: Users },
  { href: '/app/messages', key: 'messages', icon: MessagesSquare, badge: 'messages' },
  { href: '/app/deals', key: 'deals', icon: Handshake },
  { href: '/app/notifications', key: 'notifications', icon: Bell, badge: 'notifications' },
  { href: '/app/settings', key: 'settings', icon: Settings },
];

export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  founder: [
    { href: '/app', key: 'dashboard', icon: LayoutDashboard, exact: true },
    { href: '/app/startups', key: 'startups', icon: Rocket },
    ...shared,
  ],
  supporter: [
    { href: '/app', key: 'dashboard', icon: LayoutDashboard, exact: true },
    { href: '/app/discover', key: 'discover', icon: Compass },
    { href: '/app/recommended', key: 'recommended', icon: Sparkles },
    { href: '/app/saved', key: 'saved', icon: Bookmark },
    ...shared,
  ],
  admin: [
    { href: '/app/admin', key: 'adminOverview', icon: LayoutDashboard, exact: true },
    { href: '/app/admin/reports', key: 'adminReports', icon: ShieldAlert },
    { href: '/app/notifications', key: 'notifications', icon: Bell, badge: 'notifications' },
    { href: '/app/settings', key: 'settings', icon: Settings },
  ],
};

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact === true
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
