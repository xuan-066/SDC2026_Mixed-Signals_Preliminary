import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import {
  Activity, Bell, Boxes, ClipboardCheck, Gauge, LogOut, Menu, Megaphone, Settings, ShieldAlert, Snowflake, Truck, UserCircle, Users, Wrench, WifiOff, type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useMe } from '@/lib/me';
import { useNotifications, useApprovals, useIncidents } from '@/lib/queries';
import { useOnline } from '@/lib/paging';
import { ROLE_LABEL } from '@/lib/format';
import type { Perm } from '@/lib/types';
import { useAccess } from '@/lib/queries';
import { api } from '@/lib/api';
import { demoEnabled, demoUserId, setDemoIdentity } from '@/lib/demo';
import { toast } from 'sonner';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type Item = { href: string; label: string; icon: LucideIcon; perm?: Perm; owner?: boolean; badge?: 'notif' | 'approvals' | 'incidents' };
const NAV: { group: string; items: Item[] }[] = [
  { group: 'Floor', items: [
    { href: '/dashboard', label: 'Dashboard', icon: Gauge },
    { href: '/report', label: 'Report a fault', icon: Megaphone },
    { href: '/incidents', label: 'Incidents', icon: ShieldAlert, badge: 'incidents' },
    { href: '/equipment', label: 'Equipment', icon: Snowflake },
  ] },
  { group: 'Response', items: [
    { href: '/approvals', label: 'Approvals', icon: ClipboardCheck, perm: 'decide_approval', badge: 'approvals' },
    { href: '/jobs', label: 'Vendor jobs', icon: Wrench, perm: 'manage_jobs' },
    { href: '/vendors', label: 'Vendors', icon: Truck, perm: 'view_vendors' },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: 'notif' },
  ] },
  { group: 'Business', items: [
    { href: '/activity', label: 'Activity', icon: Activity, perm: 'view_audit' },
    { href: '/team', label: 'Team', icon: Users, owner: true },
    { href: '/settings', label: 'Settings', icon: Settings, owner: true },
    { href: '/account', label: 'My account', icon: UserCircle },
  ] },
];

function useBadges() {
  const { can } = useMe();
  const n = useNotifications();
  const a = useApprovals(can('decide_approval'));
  const i = useIncidents();
  return {
    notif: n.data?.filter((x) => !x.read_at).length ?? 0,
    approvals: a.data?.filter((x) => x.can_decide).length ?? 0,
    incidents: i.data?.filter((x) => x.status !== 'RESOLVED').length ?? 0,
  };
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { can, isOwner } = useMe();
  const [loc] = useLocation();
  const badges = useBadges();
  return (
    <nav aria-label="Main" className="space-y-6">
      {NAV.map((g) => {
        const items = g.items.filter((it) => (!it.perm || can(it.perm)) && (!it.owner || isOwner));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-sidebar-foreground/45">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((it) => {
                const active = loc === it.href || loc.startsWith(it.href + '/');
                const count = it.badge ? badges[it.badge] : 0;
                return (
                  <li key={it.href}>
                    <Link href={it.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} data-testid={'link-nav-' + it.href.slice(1)}
                      className={cn('group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground')}>
                      <span className={cn('h-4 w-[3px] rounded-full transition-opacity', active ? 'bg-sidebar-primary opacity-100' : 'opacity-0')} />
                      <it.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{it.label}</span>
                      {count > 0 && (
                        <span className={cn('min-w-5 rounded-full px-1.5 text-center font-mono text-[11px] font-bold', it.badge === 'incidents' ? 'bg-thaw text-white' : 'bg-sidebar-primary text-sidebar-primary-foreground')}>{count}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" data-testid="link-home">
      <img src={basePath + '/logo.svg'} alt="" className="h-8 w-8" />
      <span className="font-display text-lg font-extrabold tracking-tight text-[#1d3047]">Sejuk<span className="text-primary">Guard</span></span>
    </Link>
  );
}

function Who() {
  const { me } = useMe();
  const { signOut } = useClerk();
  return (
    <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3">
      <p className="truncate text-sm font-semibold text-sidebar-accent-foreground" data-testid="text-user-name">{me.name}</p>
      <p className="truncate text-xs text-sidebar-foreground/60" data-testid="text-business-name">{ROLE_LABEL[me.role]} at {me.business_name}</p>
      <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out"
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground/70 hover:text-sidebar-primary">
        <LogOut className="h-3.5 w-3.5" />Sign out
      </button>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const online = useOnline();
  const badges = useBadges();
  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b-2 border-[#d99546] bg-[#f4bd78] text-[#1d3047] shadow-[0_3px_0_hsl(31_56%_48%/.08)]">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Brand />
          <div className="flex items-center gap-1">
            <Link href="/notifications" className="relative rounded-lg p-2 text-[#1d3047] lg:hidden" aria-label={'Notifications, ' + badges.notif + ' unread'} data-testid="link-mobile-notifications">
              <Bell className="h-5 w-5" />
              {badges.notif > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-thaw" />}
            </Link>
            <div className="hidden lg:block"><Who /></div>
            <button type="button" onClick={() => setOpen(true)} className="rounded-lg p-2 text-[#1d3047] lg:hidden" aria-label="Open menu" data-testid="button-open-menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
          </div>
          <div className="hidden border-t border-[#b87936]/35 bg-[#f7c98f] lg:block">
            <TopNavigation />
          </div>
        </header>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="left" className="flex w-[300px] flex-col gap-6 overflow-y-auto border-sidebar-border bg-sidebar p-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
            <div className="flex-1"><NavList onNavigate={() => setOpen(false)} /></div>
            <Who />
          </SheetContent>
        </Sheet>
        {!online && (
          <div role="status" className="sticky top-0 z-20 flex items-center gap-2 bg-amber px-4 py-2 text-sm font-semibold text-white" data-testid="banner-offline">
            <WifiOff className="h-4 w-4" />You are offline. Showing last loaded data; actions will not send until you reconnect.
          </div>
        )}
        {demoEnabled() && <DemoPreview />}
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-14 lg:pt-8">{children}</main>
        <MobileTabs />
      </div>
    </div>
  );
}

function TopNavigation() {
  const { can, isOwner } = useMe();
  const [loc] = useLocation();
  const badges = useBadges();
  const items = NAV.flatMap((g) => g.items).filter((it) => (!it.perm || can(it.perm)) && (!it.owner || isOwner));
  return <nav aria-label="Workspace" className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2.5 sm:px-6" data-testid="nav-workspace">
    {items.map((it) => {
      const active = loc === it.href || loc.startsWith(it.href + '/');
      const count = it.badge ? badges[it.badge] : 0;
      return <Link key={it.href} href={it.href} aria-current={active ? 'page' : undefined} data-testid={'link-nav-' + it.href.slice(1)}
        className={cn('inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold transition-colors', active ? 'bg-[#fff7e9] text-[#1c3047] shadow-sm' : 'text-[#34465a] hover:bg-[#ffefd8]')}>
        <it.icon className="h-3.5 w-3.5" />{it.label}
        {count > 0 && <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-[10px]', it.badge === 'incidents' ? 'bg-thaw text-white' : 'bg-[#20364d] text-white')}>{count}</span>}
      </Link>;
    })}
  </nav>;
}

function DemoPreview() {
  const access = useAccess();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [, navigate] = useLocation();
  const users = access.data?.demo_users ?? [];
  const current = demoUserId() ?? '';
  const changeRole = (id: string) => {
    if (!id || id === current) return;
    setDemoIdentity(id);
    qc.clear();
    window.location.reload();
  };
  const reset = async () => {
    if (!window.confirm('Reset the demo workspace? All demo changes will be replaced with the Freezer 2 compressor-failure scenario.')) return;
    setBusy(true);
    try {
      await api('/sim/reset', 'POST');
      await api('/sim/sensor', 'POST', { asset_id: 'a_fz2', pattern: 'compressor_fail' });
      for (const assetId of ['a_fz1', 'a_ch1', 'a_ch2']) {
        await api('/sim/sensor', 'POST', { asset_id: assetId, pattern: 'recover' });
      }
      await qc.invalidateQueries();
      toast.success('Demo reset. Freezer 2 incident is ready.');
      navigate('/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reset demo');
    } finally {
      setBusy(false);
    }
  };
  return <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#d8903d] bg-[#f5bd72] px-4 py-2 text-[#1d3047] shadow-sm sm:px-6" data-testid="banner-demo-preview">
    <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.12em]"><span className="h-2 w-2 rounded-full bg-[#a52e43]" />Demo preview <span className="hidden font-medium normal-case tracking-normal sm:inline">· isolated workspace</span></div>
    <div className="flex items-center gap-2">
      <label htmlFor="demo-role-switch" className="sr-only">Switch demo role</label>
      <select id="demo-role-switch" value={current} onChange={(e) => changeRole(e.target.value)} className="h-8 max-w-[150px] rounded border border-[#b47a39] bg-[#fff0d9] px-2 text-xs font-bold" data-testid="select-demo-user">
        {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {ROLE_LABEL[u.role]}</option>)}
      </select>
      <button type="button" onClick={reset} disabled={busy} className="h-8 rounded-full border border-[#8b5c2b] px-3 text-xs font-bold hover:bg-[#ffdda9] disabled:opacity-50" data-testid="button-reset-demo">{busy ? 'Resetting…' : 'Reset demo'}</button>
    </div>
  </div>;
}

function MobileTabs() {
  const [loc] = useLocation();
  const tabs: { href: string; label: string; icon: LucideIcon }[] = [
    { href: '/dashboard', label: 'Home', icon: Gauge },
    { href: '/incidents', label: 'Incidents', icon: ShieldAlert },
    { href: '/report', label: 'Report', icon: Megaphone },
    { href: '/equipment', label: 'Units', icon: Boxes },
  ];
  return (
    <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {tabs.map((t) => {
        const active = loc === t.href || loc.startsWith(t.href + '/');
        return (
          <Link key={t.href} href={t.href} data-testid={'link-tab-' + t.href.slice(1)} aria-current={active ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold', active ? 'text-primary' : 'text-muted-foreground')}>
            <t.icon className="h-5 w-5" />{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
