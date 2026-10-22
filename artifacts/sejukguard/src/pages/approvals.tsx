import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ClipboardCheck } from 'lucide-react';
import { Chips, DeniedState, EmptyState, ErrorState, ListSkeleton, Money, PageHeader, Pager, Pill, SearchBox } from '@/components/common';
import { ApprovalActions } from '@/components/approval-actions';
import { useApprovals } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { usePaged } from '@/lib/paging';
import { ROLE_LABEL, ago, fmtDT } from '@/lib/format';
import type { ApprovalStatus } from '@/lib/types';

const CLS: Record<ApprovalStatus, string> = { PENDING: 'bg-amber/12 text-amber border-amber/35', APPROVED: 'bg-ok/10 text-ok border-ok/25', REJECTED: 'bg-thaw/10 text-thaw border-thaw/30' };

export default function Approvals() {
  const { can } = useMe();
  const q = useApprovals(can('decide_approval'));
  const [f, setF] = useState<'mine' | ApprovalStatus | 'all'>('mine');
  const [s, setS] = useState('');
  const list = q.data ?? [];
  const filtered = useMemo(() => list
    .filter((a) => f === 'all' ? true : f === 'mine' ? a.can_decide : a.status === f)
    .filter((a) => a.summary.toLowerCase().includes(s.toLowerCase()))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [list, f, s]);
  const pg = usePaged(filtered, 10, f + s);
  if (!can('decide_approval')) return <DeniedState />;
  return (
    <>
      <PageHeader eyebrow="Approvals" title="Spending decisions" sub="You can only decide requests within your role and limit. The server decides who may act; buttons appear only when you can." />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBox value={s} onChange={setS} placeholder="Search approvals" />
        <Chips label="Status" value={f} onChange={setF} options={[
          { value: 'mine', label: 'Mine to decide', count: list.filter((a) => a.can_decide).length },
          { value: 'PENDING', label: 'Pending', count: list.filter((a) => a.status === 'PENDING').length },
          { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'all', label: 'All', count: list.length },
        ]} />
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        filtered.length === 0 ? <EmptyState icon={ClipboardCheck} title={f === 'mine' ? 'Nothing waiting on you' : 'No approvals here'} /> : (
          <>
            <ul className="space-y-3">
              {pg.slice.map((a) => (
                <li key={a.id} className="rise rounded-xl border border-card-border bg-card p-4" data-testid={'card-approval-' + a.id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><Pill className={CLS[a.status]}>{a.status.toLowerCase()}</Pill><span className="text-xs text-muted-foreground">needs {ROLE_LABEL[a.required_role]}</span></div>
                      <p className="mt-1.5 font-semibold">{a.summary}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground" title={fmtDT(a.created_at)}>Requested {ago(a.created_at)}{a.decided_at ? ' - decided ' + ago(a.decided_at) + (a.decided_by ? ' by ' + a.decided_by : '') : ''}</p>
                      {a.note && <p className="mt-1 text-sm italic text-muted-foreground">"{a.note}"</p>}
                      {a.subject_type === 'incident' && <Link href={'/incidents/' + a.subject_id} className="mt-1 inline-block text-xs font-semibold text-primary" data-testid={'link-approval-incident-' + a.id}>View incident</Link>}
                    </div>
                    <div className="flex flex-col items-start gap-2 sm:items-end"><Money v={a.amount_rm} className="text-xl font-bold" /><ApprovalActions approval={a} /></div>
                  </div>
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
    </>
  );
}
