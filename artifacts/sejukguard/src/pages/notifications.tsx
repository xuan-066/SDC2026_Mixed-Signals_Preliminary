import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { Bell, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chips, EmptyState, ErrorState, ListSkeleton, PageHeader, Pager } from '@/components/common';
import { useMarkRead, useNotifications } from '@/lib/queries';
import { usePaged } from '@/lib/paging';
import { ago, fmtDT } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Notifications() {
  const q = useNotifications();
  const mark = useMarkRead();
  const [f, setF] = useState<'unread' | 'all'>('unread');
  const list = q.data ?? [];
  const filtered = useMemo(() => list.filter((n) => f === 'all' || !n.read_at).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [list, f]);
  const pg = usePaged(filtered, 15, f);
  return (
    <>
      <PageHeader eyebrow="Notifications" title="For you" sub="In-app notices only. SejukGuard does not send SMS or WhatsApp from this release." />
      <div className="mb-4"><Chips label="Show" value={f} onChange={setF} options={[{ value: 'unread', label: 'Unread', count: list.filter((n) => !n.read_at).length }, { value: 'all', label: 'All', count: list.length }]} /></div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        filtered.length === 0 ? <EmptyState icon={Bell} title={f === 'unread' ? 'All caught up' : 'No notifications'} /> : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-card-border bg-card">
              {pg.slice.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-3 p-4', !n.read_at && 'bg-accent/40')} data-testid={'row-notification-' + n.id}>
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-thaw')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground" title={fmtDT(n.created_at)}>{ago(n.created_at)}{n.incident_id && <> - <Link href={'/incidents/' + n.incident_id} className="font-semibold text-primary" onClick={() => !n.read_at && mark.mutate(n.id)} data-testid={'link-notification-incident-' + n.id}>Open incident</Link></>}</p>
                  </div>
                  {!n.read_at && <Button size="sm" variant="ghost" disabled={mark.isPending && mark.variables === n.id} onClick={() => mark.mutate(n.id)} data-testid={'button-mark-read-' + n.id}><Check className="mr-1 h-3.5 w-3.5" />Read</Button>}
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
    </>
  );
}
