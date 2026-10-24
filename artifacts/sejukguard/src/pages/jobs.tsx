import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { Wrench } from 'lucide-react';
import { Chips, DeniedState, EmptyState, ErrorState, JobStatusPill, ListSkeleton, PageHeader, Pager, Panel, SearchBox } from '@/components/common';
import { JobActions } from '@/components/job-actions';
import { useJob, useJobs } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { usePaged } from '@/lib/paging';
import { ago, fmtDT } from '@/lib/format';
import type { JobStatus } from '@/lib/types';

export function Jobs() {
  const { can } = useMe();
  const q = useJobs(can('manage_jobs'));
  const [f, setF] = useState<'open' | JobStatus | 'all'>('open');
  const [s, setS] = useState('');
  const list = q.data ?? [];
  const filtered = useMemo(() => list
    .filter((j) => f === 'all' ? true : f === 'open' ? j.status !== 'DONE' : j.status === f)
    .filter((j) => (j.vendor_name + ' ' + j.id).toLowerCase().includes(s.toLowerCase()))
    .sort((a, b) => +new Date(b.requested_at) - +new Date(a.requested_at)), [list, f, s]);
  const pg = usePaged(filtered, 12, f + s);
  if (!can('manage_jobs')) return <DeniedState />;
  return (
    <div className="sg-page sg-jobs-page">
      <PageHeader eyebrow="Vendor jobs" title="Technicians on call" sub="Record what the vendor told you. SejukGuard chases vendors who go quiet." />
      <section className="sg-filterbar mb-5 flex flex-col gap-3 rounded-xl border border-[#d8c6ac] bg-[#f5ead8] p-3 md:flex-row md:items-center md:justify-between" aria-label="Job filters">
        <SearchBox value={s} onChange={setS} placeholder="Search vendor" />
        <Chips label="Status" value={f} onChange={setF} options={[
          { value: 'open', label: 'Open', count: list.filter((j) => j.status !== 'DONE').length },
          { value: 'REQUESTED', label: 'Requested' }, { value: 'CONFIRMED', label: 'Confirmed' }, { value: 'DONE', label: 'Done' }, { value: 'all', label: 'All', count: list.length },
        ]} />
      </section>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        filtered.length === 0 ? <EmptyState icon={Wrench} title="No jobs here" body="Jobs are created when a vendor call-out is approved." /> : (
          <>
            <ul className="space-y-3">
              {pg.slice.map((j) => (
                <li key={j.id} className="rounded-xl border border-card-border bg-card p-4" data-testid={'card-job-' + j.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Link href={'/jobs/' + j.id} className="min-w-0" data-testid={'link-job-' + j.id}>
                      <div className="flex items-center gap-2"><b>{j.vendor_name}</b><JobStatusPill s={j.status} /></div>
                      <p className="mt-1 text-xs text-muted-foreground">Requested {ago(j.requested_at)}{j.eta ? ' - ETA ' + fmtDT(j.eta) : ''}{j.chase_count ? ' - chased ' + j.chase_count + 'x' : ''}</p>
                    </Link>
                    <JobActions job={j} />
                  </div>
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
    </div>
  );
}

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMe();
  const q = useJob(can('manage_jobs') ? id : undefined);
  if (!can('manage_jobs')) return <DeniedState />;
  if (q.isLoading) return <><PageHeader title="Loading job..." back={{ href: '/jobs', label: 'Jobs' }} /><ListSkeleton rows={3} /></>;
  if (q.error || !q.data) return <><PageHeader title="Job" back={{ href: '/jobs', label: 'Jobs' }} /><ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const j = q.data;
  const steps = [
    { label: 'Requested', at: j.requested_at },
    { label: 'Vendor confirmed', at: j.confirmed_at },
    { label: 'Expected arrival', at: j.eta },
    { label: 'Done', at: j.done_at },
  ];
  return (
    <>
      <PageHeader back={{ href: '/jobs', label: 'Jobs' }} eyebrow={'Job ' + j.id} title={j.vendor_name} sub={<span className="flex items-center gap-2"><JobStatusPill s={j.status} />{j.chase_count > 0 && <span className="text-amber">Chased {j.chase_count} time{j.chase_count > 1 ? 's' : ''}</span>}</span>}
        actions={<Link href={'/incidents/' + j.incident_id} className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold" data-testid="link-job-incident">View incident</Link>} />
      <div className="sg-job-detail-grid grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Panel className="border-t-4 border-t-[#438fca]" title="Repair response · progress">
          <ol className="sg-job-steps space-y-4">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                <span className={'grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold ' + (s.at ? 'bg-primary text-white' : 'border-2 border-border bg-card text-muted-foreground')}>{steps.indexOf(s) + 1}</span>
                <span className="flex-1 text-sm font-semibold">{s.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{s.at ? fmtDT(s.at) : 'pending'}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title="Actions">{j.status === 'DONE' ? <p className="text-sm text-muted-foreground">This job is complete.</p> : <JobActions job={j} />}</Panel>
      </div>
    </>
  );
}
