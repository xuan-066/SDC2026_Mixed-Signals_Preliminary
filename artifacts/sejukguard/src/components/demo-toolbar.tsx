import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DEMO_USERS, getDemoUserId, setDemoUserId } from '@/lib/demo';

type ClockResponse = { now: string };
type AdvanceResponse = ClockResponse & { actions: string[] };

function formatDemoTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Loading…';
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short',
  }).format(date) + ' MYT';
}

export function DemoToolbar() {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState(getDemoUserId);
  const [now, setNow] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void api<ClockResponse>('/sim/clock').then((result) => {
      if (active) setNow(result.now);
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : 'Could not read demo clock');
    });
    return () => { active = false; };
  }, []);

  const changeUser = (next: string) => {
    setDemoUserId(next);
    setUserId(next);
    window.location.reload();
  };

  const reset = async () => {
    setBusy(true);
    try {
      const result = await api<ClockResponse>('/sim/reset', 'POST');
      setNow(result.now);
      await queryClient.invalidateQueries();
      toast.success('Demo reset to its starting state');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset demo');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    setBusy(true);
    try {
      const result = await api<AdvanceResponse>('/sim/advance', 'POST', { minutes: 60 });
      setNow(result.now);
      await queryClient.invalidateQueries();
      if (result.actions.length) result.actions.forEach((action) => toast.success(action));
      else toast.success('Demo clock advanced by 60 minutes');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not advance demo clock');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Demo controls" className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" data-testid="demo-toolbar">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Demo mode · sample data</p>
        <p className="mt-1 text-sm font-semibold text-foreground" data-testid="text-demo-clock">Simulated time: {now ? formatDemoTime(now) : 'Loading…'}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="demo-role" className="text-xs font-semibold text-muted-foreground">Viewing as</label>
        <select id="demo-role" value={userId} onChange={(event) => changeUser(event.target.value)} disabled={busy}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm font-semibold text-foreground" data-testid="select-demo-role">
          {DEMO_USERS.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.role}</option>)}
        </select>
        <button type="button" onClick={() => void reset()} disabled={busy}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50" data-testid="button-demo-reset">
          Reset demo
        </button>
        <button type="button" onClick={() => void advance()} disabled={busy}
          className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50" data-testid="button-demo-advance">
          +60 min
        </button>
      </div>
    </section>
  );
}

