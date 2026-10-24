import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { FileClock, MessageSquareDashed } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DeniedState, EmptyState, ErrorState, ListSkeleton, Money, PageHeader, Pager, Pill, SearchBox, Stat } from '@/components/common';
import { useAudit, useMessages, useMetrics } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { usePaged } from '@/lib/paging';
import { fmtDT, humanize } from '@/lib/format';

export default function ActivityPage() {
  const { can } = useMe();
  const audit = useAudit(can('view_audit'));
  const metrics = useMetrics(can('view_metrics'));
  const messages = useMessages(can('view_messages'));
  const [s, setS] = useState('');
  const [ms, setMs] = useState('');
  const events = useMemo(() => (audit.data ?? []).filter((e) => [e.action, e.actor_id, e.entity_type, e.entity_id].join(' ').toLowerCase().includes(s.toLowerCase())).sort((a, b) => +new Date(b.at) - +new Date(a.at)), [audit.data, s]);
  const msgs = useMemo(() => (messages.data ?? []).filter((m) => (m.body + m.to_id).toLowerCase().includes(ms.toLowerCase())).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)), [messages.data, ms]);
  const pg = usePaged(events, 20, s);
  const mpg = usePaged(msgs, 15, ms);
  if (!can('view_audit')) return <DeniedState />;
  const m = metrics.data;
  return (
    <div className="sg-page sg-activity-page">
      <PageHeader eyebrow="Activity" title="Who did what, when" sub="The audit trail is append-only. Every approval, dispatch and transfer is recorded here." />
      {can('view_metrics') && (metrics.isLoading ? <ListSkeleton rows={1} /> : metrics.error ? <ErrorState error={metrics.error} onRetry={() => metrics.refetch()} /> : m && (
          <div className="sg-metrics-band mb-6 grid grid-cols-2 gap-3 border-y-2 border-[#d89b4d] bg-[#f3e6d1] py-3 lg:grid-cols-5">
          <Stat label="Incidents" value={m.incidents_total} hint={m.incidents_resolved + ' resolved'} />
          <Stat label="Detect to dispatch" value={m.median_min_detect_to_dispatch === null ? '--' : m.median_min_detect_to_dispatch.toFixed(1)} hint={m.median_min_detect_to_dispatch === null ? 'No dispatches yet' : 'median minutes'} />
          <Stat label="Recorded risk, resolved" value={<Money v={m.stock_protected_rm} className="text-xl" />} hint="Sum of risk snapshots; not proof stock moved" />
          <Stat label="Automated actions" value={m.automated_actions} />
          <Stat label="False alarms avoided" value={m.false_alarms_avoided} tone="ok" />
        </div>
      ))}
      <Tabs defaultValue="audit" className="sg-activity-tabs">
        <TabsList className="rounded-full bg-[#eaddc8] p-1"><TabsTrigger value="audit" className="rounded-full" data-testid="tab-audit">Audit log</TabsTrigger>{can('view_messages') && <TabsTrigger value="messages" className="rounded-full" data-testid="tab-messages">Mock outbox</TabsTrigger>}</TabsList>
        <TabsContent value="audit" className="mt-4">
          <div className="mb-3"><SearchBox value={s} onChange={setS} placeholder="Filter by action, actor, record" /></div>
          {audit.isLoading ? <ListSkeleton /> : audit.error ? <ErrorState error={audit.error} onRetry={() => audit.refetch()} /> : events.length === 0 ? <EmptyState icon={FileClock} title="No events" /> : (
            <>
              <div className="overflow-x-auto rounded-xl border border-card-border bg-card">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Actor</th><th className="px-4 py-2.5">Action</th><th className="px-4 py-2.5">Record</th></tr></thead>
                  <tbody className="divide-y divide-border">
                    {pg.slice.map((e) => (
                      <tr key={e.id} className="align-top" data-testid={'row-audit-' + e.id}>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{fmtDT(e.at)}</td>
                        <td className="px-4 py-2.5">{e.actor_id === 'system' ? <Pill className="border-primary/30 text-primary">system</Pill> : e.actor_id}</td>
                        <td className="px-4 py-2.5"><p className="font-semibold">{humanize(e.action)}</p>{Object.keys(e.details).length > 0 && <p className="max-w-md break-words font-mono text-[11px] text-muted-foreground">{JSON.stringify(e.details)}</p>}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs">{e.entity_type === 'incident' ? <Link href={'/incidents/' + e.entity_id} className="text-primary">{e.entity_type} {e.entity_id}</Link> : e.entity_type + ' ' + e.entity_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...pg} />
            </>
          )}
        </TabsContent>
        {can('view_messages') && (
          <TabsContent value="messages" className="mt-4">
            <p className="mb-3 rounded-lg border border-amber/40 bg-amber/10 p-3 text-sm font-medium text-amber" data-testid="text-mock-warning">MOCK outbox. These vendor and staff messages were generated for review and were never delivered to anyone.</p>
            <div className="mb-3"><SearchBox value={ms} onChange={setMs} placeholder="Search messages" /></div>
            {messages.isLoading ? <ListSkeleton /> : messages.error ? <ErrorState error={messages.error} onRetry={() => messages.refetch()} /> : msgs.length === 0 ? <EmptyState icon={MessageSquareDashed} title="No mock messages" /> : (
              <>
                <ul className="space-y-2">
                  {mpg.slice.map((x) => (
                    <li key={x.id} className="rounded-lg border border-dashed border-border bg-card p-3 text-sm">
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Pill className="border-amber/40 text-amber">mock {x.channel}</Pill>to {x.to_type} {x.to_id} - {fmtDT(x.created_at)}</div>
                      <p className="whitespace-pre-wrap">{x.body}</p>
                    </li>
                  ))}
                </ul>
                <Pager {...mpg} />
              </>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
