import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import {
  Activity, Bell, ChevronDown, CircleHelp, ClipboardCheck, Gauge, LogOut, Menu, Megaphone, RotateCcw, Settings, ShieldAlert, Snowflake, Truck, UserCircle, Users, Wrench, WifiOff, type LucideIcon,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useMe } from '@/lib/me';
import { useNotifications, useApprovals, useIncidents, useAccess } from '@/lib/queries';
import { useOnline } from '@/lib/paging';
import { ROLE_LABEL } from '@/lib/format';
import type { Perm } from '@/lib/types';
import { api } from '@/lib/api';
import { demoEnabled, demoUserId, setDemoIdentity } from '@/lib/demo';
import { toast } from 'sonner';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type Item = { href: string; label: string; icon: LucideIcon; perm?: Perm; owner?: boolean; badge?: 'notif' | 'approvals' | 'incidents' };
const NAV: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: Gauge },
  { href: '/report', label: 'Report a fault', icon: Megaphone },
  { href: '/incidents', label: 'Incidents', icon: ShieldAlert, badge: 'incidents' },
  { href: '/equipment', label: 'Equipment', icon: Snowflake },
  { href: '/approvals', label: 'Approvals', icon: ClipboardCheck, perm: 'decide_approval', badge: 'approvals' },
  { href: '/jobs', label: 'Vendor jobs', icon: Wrench, perm: 'manage_jobs' },
  { href: '/vendors', label: 'Vendors', icon: Truck, perm: 'view_vendors' },
  { href: '/notifications', label: 'Notifications', icon: Bell, badge: 'notif' },
  { href: '/activity', label: 'Activity', icon: Activity, perm: 'view_audit' },
  { href: '/team', label: 'Team', icon: Users, owner: true },
  { href: '/settings', label: 'Settings', icon: Settings, owner: true },
  { href: '/account', label: 'My account', icon: UserCircle },
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
  const items = NAV.filter((it) => (!it.perm || can(it.perm)) && (!it.owner || isOwner));
  return (
    <nav aria-label="Main">
      <ul className="space-y-1">
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
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5" data-testid="link-home">
      <img src={basePath + '/glacier-link-logo.png'} alt="Glacier Link" className="h-auto w-40 shrink-0 sm:w-56" />
    </Link>
  );
}

function ProfileMenu({ onNavigate }: { onNavigate?: () => void }) {
  const { me, isOwner } = useMe();
  const { signOut } = useClerk();
  const access = useAccess();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const users = access.data?.demo_users ?? [];
  const current = demoUserId() ?? '';
  const isDemo = demoEnabled();

  const changeRole = (id: string) => {
    if (!id || id === current) return;
    setDemoIdentity(id);
    qc.clear();
    window.location.reload();
  };

  const resetDemo = async () => {
    if (!window.confirm('Reset the demo workspace? All demo changes will be replaced with the Freezer 2 compressor-failure scenario.')) return;
    setResetBusy(true);
    try {
      await api('/sim/reset', 'POST');
      await api('/sim/sensor', 'POST', { asset_id: 'a_fz2', pattern: 'compressor_fail' });
      for (const assetId of ['a_fz1', 'a_ch1', 'a_ch2']) {
        await api('/sim/sensor', 'POST', { asset_id: assetId, pattern: 'recover' });
      }
      await qc.invalidateQueries();
      toast.success('Demo reset. Freezer 2 incident is ready.');
      onNavigate?.();
      navigate('/dashboard');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reset demo');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex h-12 w-full items-center gap-3 rounded-xl border border-[#29424f] bg-[#102331]/70 px-3 text-sidebar-accent-foreground transition-colors hover:bg-[#1c3b4a]" aria-label={'Open profile menu for ' + me.name} data-testid="button-profile-menu">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#164351] text-sm font-bold text-[#64d5dc]">{me.name.trim().charAt(0).toUpperCase()}</span>
            <span className="truncate text-sm font-bold" data-testid="text-user-name">{me.name}</span>
            <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-75" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-[268px] max-w-[calc(100vw-2rem)] border-[#29424f] bg-[#102331] p-3 text-[#eaf1f2] shadow-xl">
          <div className="flex items-center gap-3 px-2 py-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#164351] text-lg font-bold text-[#64d5dc]">{me.name.trim().charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-white">{me.name}</p>
              <p className="truncate text-xs text-[#aab8c1]">{ROLE_LABEL[me.role]} · {me.business_name}</p>
            </div>
          </div>
          <DropdownMenuSeparator className="bg-[#29424f]" />
          <DropdownMenuItem asChild className="cursor-pointer text-[#eaf1f2] focus:bg-[#1c3b4a] focus:text-white">
            <Link href={isOwner ? '/settings' : '/account'} onClick={onNavigate} className="flex w-full items-center gap-3 px-3 py-2.5">
              <Settings className="h-4 w-4" />Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setHelpOpen(true)} className="cursor-pointer text-[#eaf1f2] focus:bg-[#1c3b4a] focus:text-white">
            <CircleHelp className="h-4 w-4" />Help
          </DropdownMenuItem>
          {isDemo && users.length > 1 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer text-[#eaf1f2] focus:bg-[#1c3b4a] focus:text-white">
                <Users className="h-4 w-4" />Switch demo user
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56 border-[#29424f] bg-[#102331] text-[#eaf1f2]">
                <DropdownMenuRadioGroup value={current} onValueChange={changeRole}>
                  {users.map((user) => (
                    <DropdownMenuRadioItem key={user.id} value={user.id} className="cursor-pointer focus:bg-[#1c3b4a] focus:text-white">
                      {user.name} · {ROLE_LABEL[user.role]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {isDemo && (
            <DropdownMenuItem onSelect={resetDemo} disabled={resetBusy} className="cursor-pointer text-[#eaf1f2] focus:bg-[#1c3b4a] focus:text-white">
              <RotateCcw className="h-4 w-4" />{resetBusy ? 'Resetting demo…' : 'Reset demo'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="bg-[#29424f]" />
          <DropdownMenuItem onSelect={() => signOut({ redirectUrl: basePath || '/' })} className="cursor-pointer text-[#eaf1f2] focus:bg-[#1c3b4a] focus:text-white" data-testid="button-sign-out">
            <LogOut className="h-4 w-4" />Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="border-[#29424f] bg-[#102331] text-[#eaf1f2] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Glacier Link help</DialogTitle>
            <DialogDescription className="text-[#aab8c1]">Quick ways to respond to a cold-chain issue.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Link href="/report" onClick={() => { setHelpOpen(false); onNavigate?.(); }} className="rounded-lg border border-[#29424f] px-3 py-2.5 text-sm font-semibold hover:bg-[#1c3b4a]">Report a fault</Link>
            <Link href="/incidents" onClick={() => { setHelpOpen(false); onNavigate?.(); }} className="rounded-lg border border-[#29424f] px-3 py-2.5 text-sm font-semibold hover:bg-[#1c3b4a]">Review incidents</Link>
            <Link href="/equipment" onClick={() => { setHelpOpen(false); onNavigate?.(); }} className="rounded-lg border border-[#29424f] px-3 py-2.5 text-sm font-semibold hover:bg-[#1c3b4a]">Check equipment</Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);
  const online = useOnline();
  return (
    <div className="min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:px-3 focus:py-2">Skip to content</a>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b-2 border-[#d99546] bg-[#f4bd78] text-[#1d3047] shadow-[0_3px_0_hsl(31_56%_48%/.08)]">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6">
            <Brand />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setNavOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#b87936]/45 bg-[#fff1da]/50 text-[#1d3047] transition-colors hover:bg-[#fff1da]" aria-label="Open navigation menu" data-testid="button-open-menu">
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent side="left" className="flex w-[300px] flex-col gap-6 overflow-y-auto border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
            <SheetTitle className="sr-only">Main navigation</SheetTitle>
            <div className="border-b border-sidebar-border pb-4"><Brand /></div>
            <div className="flex-1"><NavList onNavigate={() => setNavOpen(false)} /></div>
            <div className="border-t border-sidebar-border pt-4">
              <ProfileMenu onNavigate={() => setNavOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
        {!online && (
          <div role="status" className="sticky top-0 z-20 flex items-center gap-2 bg-amber px-4 py-2 text-sm font-semibold text-white" data-testid="banner-offline">
            <WifiOff className="h-4 w-4" />You are offline. Showing last loaded data; actions will not send until you reconnect.
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1440px] px-4 pb-14 pt-6 sm:px-6 lg:px-10 lg:pt-8">{children}</main>
      </div>
    </div>
  );
}
