import { Link } from 'wouter';
import { AlertOctagon, ArrowUpRight, ClipboardCheck, Megaphone, ShieldCheck, Snowflake } from 'lucide-react';
import { EmptyState, ErrorState, IncidentStatusPill, ListSkeleton, Money, PageHeader, Panel, ReadingAge, SeverityPill, Stat, Temp, ThermoBar } from '@/components/common';
import { ApprovalActions } from '@/components/approval-actions';
import { useApprovals, useAssets, useIncidents, useJobs, useMetrics } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { ROLE_LABEL, SEVERITY, ago, fmtDT, fmtTime, humanize, isOpenIncident } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { me, can } = useMe();
  const assets = useAssets();
  const incidents = useIncidents();
  const approvals = useApprovals(can('decide_approval'));
  const jobs = useJobs(can('manage_jobs'));
  const metrics = useMetrics(can('view_metrics'));

  const open = (incidents.data ?? []).filter((i) => isOpenIncident(i.status)).sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank);
  const units = [...(assets.data ?? [])].sort((a, b) => SEVERITY[b.status].rank - SEVERITY[a.status].rank);
  const stale = units.filter((a) => a.reading_state === 'stale' || a.reading_state === 'missing' || !a.latest_reading_at).length;
  const mine = (approvals.data ?? []).filter((a) => a.can_decide);
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'DONE');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Selamat pagi' : hour < 19 ? 'Selamat petang' : 'Selamat malam';

  const priority = open[0];

  return (
    <div className="sg-dashboard space-y-6">
      <PageHeader eyebrow={me.business_name} title={greet + ', ' + me.name.split(' ')[0]}
        sub={open.length ? open.length + ' open incident' + (open.length > 1 ? 's' : '') + ' need attention.' : 'No open incidents right now.'}
        actions={<Link href="/report" className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" data-testid="link-dashboard-report"><Megaphone className="h-4 w-4" />Report a fault</Link>} />

      {incidents.data && priority && (
        <Panel className={cn('overflow-hidden border-2', priority.severity === 'CRITICAL' ? 'border-thaw/70' : 'border-amber/60')} pad={false}>
          <div className={cn('sg-dashboard__urgent grid lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]', priority.severity === 'CRITICAL' ? 'bg-[#672d26] text-[#fff8ee]' : 'bg-[#503b24] text-[#fff8ee]')}>
            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]">
                  <AlertOctagon className="h-3.5 w-3.5" />Priority incident
                </span>
                <SeverityPill s={priority.severity} />
                <IncidentStatusPill s={priority.status} />
              </div>
              <h2 className="mt-5 font-display text-2xl font-extrabold leading-tight sm:text-3xl">{priority.asset?.name ?? 'Unit not identified yet'}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/80">{priority.report_text || priority.trigger}</p>
              <p className="mt-3 text-xs text-white/65">Opened {ago(priority.created_at)}</p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-lg">
                <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">Latest temperature</p>
                  <Temp t={priority.asset?.latest_temp_c} className="mt-1 block font-mono text-3xl font-extrabold tabular-nums sm:text-4xl" />
                  {priority.asset && <p className="mt-1 text-xs text-white/70">Safe range {priority.asset.range_c[0].toFixed(1)}°C to {priority.asset.range_c[1].toFixed(1)}°C</p>}
                </div>
                <div className="rounded-xl border border-white/20 bg-white/10 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/70">Stock at risk</p>
                  <Money v={priority.stock_at_risk_rm} className="mt-1 block text-2xl font-extrabold text-[#fff8ee] sm:text-3xl" />
                  <p className="mt-1 text-xs text-white/70">Risk estimate, not stock moved</p>
                </div>
              </div>
              <Link href={'/incidents/' + priority.id} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#fff8ee] px-4 text-sm font-bold text-[#38251f] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#672d26]" data-testid={'link-incident-' + priority.id}>
                Open incident record <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="border-t border-white/15 bg-black/10 p-5 sm:p-7 lg:border-l lg:border-t-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/65">Response snapshot</p>
              <div className="mt-4 rounded-xl border border-white/20 bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/70">Backup unit</p>
                {priority.decision?.backup_unit
                  ? <><p className="mt-1 text-lg font-bold">{priority.decision.backup_unit.name}</p><p className="text-sm text-white/80">{priority.decision.backup_unit.free_l.toFixed(1)} L free when planned</p></>
                  : <p className="mt-1 text-sm font-semibold">No backup unit proposed</p>}
                <p className="mt-2 text-xs leading-relaxed text-white/65">Recommendation only. No stock transfer is recorded here.</p>
              </div>
              <div className="mt-3 rounded-xl border border-white/20 bg-white/10 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-white/70">Approval</p>
                {priority.approval
                  ? <><p className="mt-1 font-bold">{humanize(priority.approval.status.toLowerCase())}</p><p className="mt-1 text-sm text-white/80">Required: {ROLE_LABEL[priority.approval.required_role]}</p></>
                  : <><p className="mt-1 font-bold">No approval request recorded</p>{priority.decision?.required_role && <p className="mt-1 text-sm text-white/80">Approval role: {ROLE_LABEL[priority.decision.required_role]}</p>}</>}
              </div>
            </div>
          </div>
          <div className="bg-card px-5 py-5 sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold">Incident timeline</h3>
              <span className="text-xs text-muted-foreground">{priority.timeline.length} recorded {priority.timeline.length === 1 ? 'event' : 'events'}</span>
            </div>
            {priority.timeline.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No events recorded yet.</p> : (
              <ol className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {priority.timeline.map((event, index) => (
                  <li key={index} className="relative border-l-2 border-primary/30 pl-3">
                    <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-sm font-semibold">{humanize(event.action)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{fmtDT(event.at)} · {event.actor}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Panel>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open incidents" value={incidents.data ? open.length : '--'} tone={open.length ? 'thaw' : 'ok'} />
        <Stat label="Units monitored" value={assets.data ? units.length : '--'} />
        <Stat label="Stale or missing" value={assets.data ? stale : '--'} tone={stale ? 'amber' : 'ok'} hint="No reading in 60 min" />
        {can('decide_approval') ? <Stat label="Awaiting you" value={approvals.data ? mine.length : '--'} tone={mine.length ? 'amber' : undefined} hint="Approvals you can decide" />
          : <Stat label="Your role" value={<span className="text-2xl capitalize">{me.role}</span>} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Panel title="Open incidents" action={<Link href="/incidents" className="text-xs font-semibold text-primary" data-testid="link-all-incidents">All incidents</Link>} pad={false}>
          {incidents.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : incidents.error ? <div className="p-4"><ErrorState error={incidents.error} onRetry={() => incidents.refetch()} /></div> :
            open.length === 0 ? <div className="p-4"><EmptyState icon={ShieldCheck} title="All quiet" body="Nothing is out of range and no faults are open." /></div> : (
              <ul className="divide-y divide-border">
                {open.slice(priority ? 1 : 0, 6).map((i) => (
                  <li key={i.id}>
                    <Link href={'/incidents/' + i.id} className="flex items-start gap-3 p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" data-testid={'link-incident-' + i.id}>
                      <span className={cn('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY[i.severity].dot, i.severity === 'CRITICAL' && 'pulse-dot')} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{i.asset?.name ?? 'Unit not identified yet'}</p>
                          <IncidentStatusPill s={i.status} />
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{i.report_text || i.trigger}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Opened {ago(i.created_at)} - at risk <Money v={i.stock_at_risk_rm} className="text-xs" /></p>
                      </div>
                      <Temp t={i.asset?.latest_temp_c} className="text-lg font-bold" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <div className="space-y-6">
          {can('decide_approval') && (
            <Panel title="Waiting on your decision" action={<Link href="/approvals" className="text-xs font-semibold text-primary" data-testid="link-all-approvals">Approvals</Link>}>
              {approvals.isLoading ? <ListSkeleton rows={2} /> : approvals.error ? <ErrorState error={approvals.error} onRetry={() => approvals.refetch()} /> :
                mine.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><ClipboardCheck className="h-4 w-4" />Nothing needs your approval.</p> : (
                  <ul className="space-y-4">
                    {mine.slice(0, 3).map((a) => (
                      <li key={a.id} className="space-y-2">
                        <p className="text-sm font-semibold">{a.summary}</p>
                        <p className="text-xs text-muted-foreground"><Money v={a.amount_rm} className="text-xs" /> - requested {ago(a.created_at)}</p>
                        <ApprovalActions approval={a} />
                      </li>
                    ))}
                  </ul>
                )}
            </Panel>
          )}
          {can('manage_jobs') && (
            <Panel title="Vendor jobs in progress" action={<Link href="/jobs" className="text-xs font-semibold text-primary" data-testid="link-all-jobs">Jobs</Link>}>
              {jobs.isLoading ? <ListSkeleton rows={2} /> : jobs.error ? <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} /> :
                openJobs.length === 0 ? <p className="text-sm text-muted-foreground">No vendor is on a job right now.</p> : (
                  <ul className="space-y-2">
                    {openJobs.slice(0, 4).map((j) => (
                      <li key={j.id}><Link href={'/jobs/' + j.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:border-primary/40" data-testid={'link-job-' + j.id}>
                        <span><b>{j.vendor_name}</b><span className="block text-xs text-muted-foreground">{j.status === 'REQUESTED' ? 'Not confirmed yet' + (j.chase_count ? ', chased ' + j.chase_count + 'x' : '') : 'ETA ' + fmtTime(j.eta)}</span></span>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                      </Link></li>
                    ))}
                  </ul>
                )}
            </Panel>
          )}
          {can('view_metrics') && metrics.data && (
            <Panel title="Response record">
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-muted-foreground">Resolved</dt><dd className="font-mono text-lg font-bold">{metrics.data.incidents_resolved}/{metrics.data.incidents_total}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Median detect to dispatch</dt><dd className="font-mono text-lg font-bold">{metrics.data.median_min_detect_to_dispatch === null ? 'No data' : metrics.data.median_min_detect_to_dispatch.toFixed(1) + ' min'}</dd></div>
                <div className="col-span-2"><dt className="text-xs text-muted-foreground">Recorded risk on resolved incidents</dt><dd className="text-lg font-bold"><Money v={metrics.data.stock_protected_rm} /></dd><p className="text-[11px] text-muted-foreground">Risk snapshot sum, not proof stock was moved or saved.</p></div>
              </dl>
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Equipment" action={<Link href="/equipment" className="text-xs font-semibold text-primary" data-testid="link-all-equipment">Manage</Link>}>
        {assets.isLoading ? <ListSkeleton rows={3} /> : assets.error ? <ErrorState error={assets.error} onRetry={() => assets.refetch()} /> :
          units.length === 0 ? <EmptyState icon={Snowflake} title="No equipment yet" body="Add your chillers and freezers so readings and reports have somewhere to go." /> : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {units.map((a) => (
                <li key={a.id}><Link href={'/equipment/' + a.id} className="block rounded-lg border border-border p-3 transition hover:-translate-y-0.5 hover:border-primary/40" data-testid={'link-unit-' + a.id}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{a.name}</span><SeverityPill s={a.status} /></div>
                  <div className="mt-2 flex items-baseline justify-between"><Temp t={a.latest_temp_c} className="text-2xl font-bold" /><ReadingAge at={a.latest_reading_at} state={a.reading_state} /></div>
                  <div className="mt-2"><ThermoBar t={a.latest_temp_c} range={a.range_c} /></div>
                </Link></li>
              ))}
            </ul>
          )}
      </Panel>
    </div>
  );
}
