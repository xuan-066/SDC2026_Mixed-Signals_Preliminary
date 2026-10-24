import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ShieldCheck } from 'lucide-react';
import { Chips, EmptyState, ErrorState, IncidentStatusPill, ListSkeleton, Money, PageHeader, Pager, SearchBox, SeverityPill, Temp } from '@/components/common';
import { useIncidents } from '@/lib/queries';
import { usePaged } from '@/lib/paging';
import { SEVERITY, ago, fmtDT } from '@/lib/format';
import type { IncidentStatus } from '@/lib/types';

type F = 'open' | 'all' | IncidentStatus;

export default function Incidents() {
  const q = useIncidents();
  const [s, setS] = useState('');
  const [f, setF] = useState<F>('open');
  const list = q.data ?? [];
  const count = (st: IncidentStatus) => list.filter((i) => i.status === st).length;
  const filtered = useMemo(() => list
    .filter((i) => f === 'all' ? true : f === 'open' ? i.status !== 'RESOLVED' : i.status === f)
    .filter((i) => [i.asset?.name, i.report_text, i.trigger, i.id].join(' ').toLowerCase().includes(s.toLowerCase()))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [list, f, s]);
  const pg = usePaged(filtered, 15, f + s);
  return (
    <div className="sg-page sg-incidents-page">
      <PageHeader eyebrow="Incidents" title="What went wrong, and what happened next" sub="Declined and unresolved incidents stay visible until someone resolves them." />
      <section className="sg-filterbar mb-5 flex flex-col gap-3 rounded-xl border border-[#d8c6ac] bg-[#f5ead8] p-3 md:flex-row md:items-center md:justify-between" aria-label="Incident filters">
        <SearchBox value={s} onChange={setS} placeholder="Search unit, report text" />
        <Chips label="Status" value={f} onChange={setF} options={[
          { value: 'open', label: 'Open', count: list.filter((i) => i.status !== 'RESOLVED').length },
          { value: 'NEEDS_INFO', label: 'Needs info', count: count('NEEDS_INFO') },
          { value: 'PENDING_APPROVAL', label: 'Approval', count: count('PENDING_APPROVAL') },
          { value: 'DISPATCHED', label: 'Dispatched', count: count('DISPATCHED') },
          { value: 'DECLINED', label: 'Declined', count: count('DECLINED') },
          { value: 'RESOLVED', label: 'Resolved', count: count('RESOLVED') },
          { value: 'all', label: 'All', count: list.length },
        ]} />
      </section>
      {q.isLoading ? <ListSkeleton rows={6} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        filtered.length === 0 ? <EmptyState icon={ShieldCheck} title={list.length ? 'Nothing matches' : 'No incidents yet'} body={list.length ? 'Try another status or search.' : 'Incidents appear when a reading is out of range or someone reports a fault.'} /> : (
          <>
            <ul className="sg-incident-list overflow-hidden rounded-xl border border-card-border bg-card divide-y divide-border">
              {pg.slice.map((i) => (
                <li key={i.id}>
                  <Link href={'/incidents/' + i.id} className={'grid gap-2 border-l-[5px] p-4 transition-colors hover:bg-accent/40 sm:grid-cols-[1fr_auto] sm:items-center ' + (i.severity === 'CRITICAL' ? 'border-thaw bg-thaw/[.035]' : i.severity === 'WARNING' ? 'border-amber' : 'border-transparent')} data-testid={'row-incident-' + i.id}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{i.asset?.name ?? 'Unit not identified'}</span><SeverityPill s={i.severity} /><IncidentStatusPill s={i.status} /></div>
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{i.report_text ? '"' + i.report_text + '"' : i.trigger}</p>
                      <p className="mt-1 text-xs text-muted-foreground" title={fmtDT(i.created_at)}>Opened {ago(i.created_at)}{i.resolved_at ? ' - resolved ' + ago(i.resolved_at) : ''} - at risk <Money v={i.stock_at_risk_rm} className="text-xs" /></p>
                    </div>
                    <Temp t={i.asset?.latest_temp_c} className={'text-xl font-bold ' + (SEVERITY[i.severity].rank >= 2 ? 'text-thaw' : '')} />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
    </div>
  );
}
