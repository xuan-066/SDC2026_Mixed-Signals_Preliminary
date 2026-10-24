import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, RefreshCw, Search, ShieldOff, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { errorMessage, ApiError } from '@/lib/api';
import { fmtRm, fmtTemp, INCIDENT_STATUS, JOB_STATUS, SEVERITY, ago } from '@/lib/format';
import type { IncidentStatus, JobStatus, ReadingState, Severity } from '@/lib/types';

export function PageHeader({ eyebrow, title, sub, actions, back }: { eyebrow?: string; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="sg-pagehead rise mb-7">
      {back && (
        <Link href={back.href} data-testid="link-back" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />{back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl" data-testid="text-page-title">{title}</h1>
          {sub && <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{sub}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-5 flex items-center gap-2"><span className="h-[5px] w-14 rounded-full bg-[#e3a454]" /><span className="h-[5px] w-5 rounded-full bg-primary" /><span className="h-[5px] w-2 rounded-full bg-frost" /></div>
    </header>
  );
}

export function Panel({ title, action, children, className, pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('sg-panel rise overflow-hidden rounded-xl border border-card-border bg-card shadow-[0_2px_0_hsl(var(--border)),0_12px_30px_-23px_hsl(var(--foreground)/0.45)]', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-[#f4eadb] px-4 py-3">
          <h2 className="text-[15px] font-bold text-[#1d3047]">{title}</h2>
          {action}
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Pill({ className, children, testid }: { className?: string; children: ReactNode; testid?: string }) {
  return <span data-testid={testid} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', className)}>{children}</span>;
}
export function SeverityPill({ s }: { s: Severity }) {
  const m = SEVERITY[s];
  return <Pill className={m.cls} testid={'status-severity-' + s}><span className={cn('h-1.5 w-1.5 rounded-full', m.dot, s === 'CRITICAL' && 'pulse-dot')} />{m.label}</Pill>;
}
export function IncidentStatusPill({ s }: { s: IncidentStatus }) {
  const m = INCIDENT_STATUS[s];
  return <Pill className={m.cls} testid="status-incident">{m.label}</Pill>;
}
export function JobStatusPill({ s }: { s: JobStatus }) {
  const m = JOB_STATUS[s];
  return <Pill className={m.cls} testid="status-job">{m.label}</Pill>;
}

/** Money null means the viewer is not permitted to see it. Never render it as zero. */
export function Money({ v, className }: { v: string | null | undefined; className?: string }) {
  if (v === null || v === undefined)
    return <span className={cn('inline-flex items-center gap-1 text-muted-foreground', className)} title="Restricted for your role" data-testid="text-money-restricted"><Lock className="h-3 w-3" />Restricted</span>;
  return <span className={cn('font-mono tabular-nums', className)} data-testid="text-money">{fmtRm(v)}</span>;
}

export function Temp({ t, className }: { t: number | null | undefined; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{fmtTemp(t)}</span>;
}

export function ReadingAge({ at, state }: { at: string | null; state?: ReadingState }) {
  const st = state ?? (at ? 'current' : 'missing');
  if (st === 'missing') return <span className="text-xs font-medium text-thaw" data-testid="text-reading-age">No readings yet</span>;
  return (
    <span className={cn('text-xs', st === 'stale' ? 'font-semibold text-amber' : 'text-muted-foreground')} data-testid="text-reading-age">
      {st === 'stale' ? 'Stale: ' : ''}read {ago(at)}
    </span>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg bg-muted" />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.status === 403) return <DeniedState message={error.message} />;
  if (error instanceof ApiError && error.status === 404) return <EmptyState icon={AlertTriangle} title="Not found" body="This record does not exist or was removed from your business." />;
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-thaw/30 bg-thaw/5 p-5">
      <div className="flex items-center gap-2 font-semibold text-thaw"><AlertTriangle className="h-4 w-4" />Could not load</div>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry} data-testid="button-retry"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Try again</Button>}
    </div>
  );
}

export function DeniedState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 px-6 py-14 text-center" data-testid="state-denied">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted"><ShieldOff className="h-5 w-5 text-muted-foreground" /></div>
      <h3 className="text-lg font-bold">Not available for your role</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{message || 'Ask an owner if you need access to this area.'}</p>
      <Link href="/dashboard" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">Back to dashboard</Link>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center" data-testid="state-empty">
      <div className="relative grid h-14 w-14 place-items-center rounded-2xl bg-accent">
        <Icon className="h-6 w-6 text-primary" />
        <span className="thermal-strip absolute -bottom-1 left-2 right-2 h-[3px] rounded-full" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {body && <div className="max-w-sm text-sm text-muted-foreground">{body}</div>}
      {action}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid="input-search"
        className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20" />
    </label>
  );
}

export function Chips<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: NoInfer<T>) => void; options: { value: NoInfer<T>; label: string; count?: number }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} data-testid={'chip-' + o.value}
          className={cn('h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
            value === o.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground')}>
          {o.label}{o.count !== undefined && <span className="ml-1.5 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pages, setPage, total }: { page: number; pages: number; setPage: (p: number) => void; total: number }) {
  if (pages <= 1) return <p className="mt-3 text-xs text-muted-foreground">{total} total</p>;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">Page {page} of {pages} - {total} total</p>
      <div className="flex gap-1.5">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-page-prev" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)} data-testid="button-page-next" aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </nav>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'thaw' | 'amber' | 'ok' | 'primary' }) {
  const toneCls = tone === 'thaw' ? 'text-thaw' : tone === 'amber' ? 'text-amber' : tone === 'ok' ? 'text-ok' : 'text-foreground';
  return (
    <div className="rise rounded-xl border border-card-border bg-card p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={cn('mt-1.5 font-display text-3xl font-extrabold tabular-nums', toneCls)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Mini thermometer: shows the safe band and where the latest reading sits. */
export function ThermoBar({ t, range }: { t: number | null; range: [number, number] }) {
  const [lo, hi] = range;
  const span = Math.max(hi - lo, 1);
  const min = lo - span * 1.5;
  const max = hi + span * 1.5;
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
  const inRange = t !== null && t >= lo && t <= hi;
  return (
    <div className="relative h-2 w-full rounded-full bg-muted" aria-hidden>
      <div className="absolute inset-y-0 rounded-full bg-primary/25" style={{ left: pct(lo) + '%', width: pct(hi) - pct(lo) + '%' }} />
      {t !== null && (
        <div className={cn('absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow', inRange ? 'bg-primary' : t > hi ? 'bg-thaw' : 'bg-frost')} style={{ left: pct(t) + '%' }} />
      )}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
