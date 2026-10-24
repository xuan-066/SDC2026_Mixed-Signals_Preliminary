import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { AlertOctagon, ArrowUpRight, HelpCircle, Loader2, RefreshCw, Snowflake, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState, IncidentStatusPill, JobStatusPill, ListSkeleton, Money, PageHeader, Panel, SeverityPill, Temp } from '@/components/common';
import { ApprovalActions } from '@/components/approval-actions';
import { JobActions } from '@/components/job-actions';
import { ReadingDialog } from '@/components/reading-dialog';
import { TransferDialog } from '@/components/transfer-dialog';
import { useAssets, useClarify, useIncident, useReassess } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { ROLE_LABEL, fmtDT, fmtTemp, fmtTime, humanize } from '@/lib/format';

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const { can, isSupervisor } = useMe();
  const q = useIncident(id);
  const assets = useAssets();
  const clarify = useClarify();
  const reassess = useReassess();
  const [pick, setPick] = useState('');

  if (q.isLoading) return <><PageHeader title="Loading incident..." back={{ href: '/incidents', label: 'Incidents' }} /><ListSkeleton rows={4} /></>;
  if (q.error || !q.data) return <><PageHeader title="Incident" back={{ href: '/incidents', label: 'Incidents' }} /><ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const i = q.data;
  const d = i.decision;
  const open = i.status !== 'RESOLVED';
  const approvalPending = i.approval?.status === 'PENDING';
  const canReassess = can('manage_jobs') && open && !i.job && !approvalPending && (i.status === 'DECLINED' || !d?.vendor);

  return (
    <>
      <PageHeader back={{ href: '/incidents', label: 'Incidents' }} eyebrow={'Incident ' + i.id}
        title={i.asset?.name ?? 'Which unit is this?'}
        sub={<span className="flex flex-wrap items-center gap-2"><SeverityPill s={i.severity} /><IncidentStatusPill s={i.status} /><span>Opened {fmtDT(i.created_at)}</span>{i.resolved_at && <span>- resolved {fmtDT(i.resolved_at)}</span>}</span>}
        actions={<>
          {i.asset && open && <ReadingDialog assetId={i.asset.id} assetName={i.asset.name} range={i.asset.range_c} size="default" />}
          {i.asset && <Link href={'/equipment/' + i.asset.id} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border bg-card px-4 text-sm font-semibold" data-testid="link-incident-asset">Unit <ArrowUpRight className="h-4 w-4" /></Link>}
        </>} />

      {i.status === 'NEEDS_INFO' && (
        <Panel className="mb-6 border-watch/40" title={<span className="flex items-center gap-2"><HelpCircle className="h-4 w-4 text-watch" />Which unit is this about?</span>}>
          <p className="mb-3 text-sm text-muted-foreground">The report did not clearly name a unit. Pick it so SejukGuard can plan the response.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="sm:max-w-xs" data-testid="select-clarify-asset"><SelectValue placeholder="Choose unit" /></SelectTrigger>
              <SelectContent>{(assets.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button disabled={!pick || clarify.isPending} onClick={() => clarify.mutate({ id: i.id, asset_id: pick })} data-testid="button-clarify">
              {clarify.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Confirm unit
            </Button>
          </div>
        </Panel>
      )}

      <div className="sg-incident-layout grid gap-6 lg:grid-cols-[1.45fr_.72fr]">
        <div className="space-y-6">
          <Panel className="border-t-4 border-t-[#d99a43]" title={<span className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#20364d] font-mono text-[10px] text-white">01</span>Response plan</span>}>
            {!d ? <p className="text-sm text-muted-foreground">No plan yet. {i.status === 'NEEDS_INFO' ? 'Identify the unit first.' : 'The situation did not need one.'}</p> : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Snowflake className="h-3.5 w-3.5" />Backup space</p>
                    {d.backup_unit ? <><p className="mt-1 font-bold">{d.backup_unit.name}</p><p className="text-xs text-muted-foreground">{d.backup_unit.free_l.toFixed(1)} L free when planned. Recommendation only.</p></>
                      : <p className="mt-1 font-bold text-thaw" data-testid="text-no-backup">No backup unit has room</p>}
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Truck className="h-3.5 w-3.5" />Vendor</p>
                    {d.vendor ? <><p className="mt-1 font-bold">{d.vendor.name}</p><p className="text-xs text-muted-foreground">Call-out <Money v={d.vendor.callout_rm} className="text-xs" /> - SLA {d.vendor.sla_hours} h</p></>
                      : <p className="mt-1 font-bold text-thaw" data-testid="text-no-vendor">No suitable vendor on file</p>}
                  </div>
                </div>
                {d.needs_human && <p className="flex items-start gap-2 rounded-lg bg-amber/10 p-3 text-sm font-medium text-amber"><AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" />{d.needs_human}</p>}
                {d.reasons.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{d.reasons.map((r, k) => <li key={k}>{r}</li>)}</ul>}
                <p className="text-xs text-muted-foreground">Approval needed from: {ROLE_LABEL[d.required_role]}</p>
                {isSupervisor && i.asset && open && (
                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    <TransferDialog sourceId={i.asset.id} incidentId={i.id} suggestedId={d.backup_unit?.id} label="Record stock move" />
                    <span className="text-xs text-muted-foreground">Stock only counts as moved once a transfer is recorded.</span>
                  </div>
                )}
              </div>
            )}
            {canReassess && (
              <div className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed border-primary/40 bg-accent/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">{i.status === 'DECLINED' ? 'The call-out was rejected and this is still unresolved.' : 'No vendor could be proposed.'} After adding or updating vendors, ask for a fresh recommendation.</p>
                <Button size="sm" disabled={reassess.isPending} onClick={() => reassess.mutate(i.id)} data-testid="button-reassess">
                  {reassess.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Reassess
                </Button>
              </div>
            )}
          </Panel>

          {i.approval && (
            <Panel title="Approval">
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{i.approval.summary}</p>
                <p className="text-muted-foreground">Status <b className="text-foreground">{humanize(i.approval.status.toLowerCase())}</b> - amount <Money v={i.approval.amount_rm} /> - needs {ROLE_LABEL[i.approval.required_role]}</p>
                {i.approval.decided_at && <p className="text-muted-foreground">Decided {fmtDT(i.approval.decided_at)}{i.approval.decided_by ? ' by ' + i.approval.decided_by : ''}{i.approval.note ? ': "' + i.approval.note + '"' : ''}</p>}
                {i.approval.status === 'REJECTED' && <p className="font-semibold text-thaw">Rejected. No vendor request was created; the fault is unresolved until someone acts.</p>}
                <div className="pt-1"><ApprovalActions approval={i.approval} /></div>
              </div>
            </Panel>
          )}

          {i.job && (
            <Panel title="Vendor job" action={<Link href={'/jobs/' + i.job.id} className="text-xs font-semibold text-primary" data-testid="link-incident-job">Job details</Link>}>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{i.job.vendor_name}</b><JobStatusPill s={i.job.status} />{i.job.chase_count > 0 && <span className="text-xs text-amber">chased {i.job.chase_count}x</span>}</div>
                <p className="text-muted-foreground">Requested {fmtDT(i.job.requested_at)}{i.job.eta ? ' - ETA ' + fmtTime(i.job.eta) : ''}{i.job.done_at ? ' - done ' + fmtDT(i.job.done_at) : ''}</p>
                <p className="text-xs text-muted-foreground">Vendor requests and chases are saved in a mock outbox, not delivered externally. Contact the vendor yourself and record their reply here.</p>
                {can('manage_jobs') && <JobActions job={i.job} />}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          <Panel>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Now</p>
            <Temp t={i.asset?.latest_temp_c} className="font-display text-5xl font-extrabold" />
            {i.asset && <p className="text-xs text-muted-foreground">Safe {fmtTemp(i.asset.range_c[0])} to {fmtTemp(i.asset.range_c[1])}</p>}
            <div className="mt-4 border-t border-border pt-3 text-sm"><span className="text-muted-foreground">Stock at risk </span><Money v={i.stock_at_risk_rm} className="font-bold" /></div>
          </Panel>
          {(i.report_text || i.symptom) && (
            <Panel title="Staff report">
              {i.report_text && <blockquote className="border-l-2 border-primary pl-3 text-sm italic">"{i.report_text}"</blockquote>}
              {i.symptom && <p className="mt-2 text-xs text-muted-foreground">Symptom: {humanize(i.symptom)}</p>}
            </Panel>
          )}
            <Panel className="border-l-4 border-l-[#6c91df]" title="Incident timeline">
            {i.timeline.length === 0 ? <p className="text-sm text-muted-foreground">No events.</p> : (
              <ol className="relative space-y-4 border-l border-border pl-4">
                {i.timeline.map((e, k) => (
                  <li key={k} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                    <p className="text-sm font-semibold">{humanize(e.action)}</p>
                    <p className="text-xs text-muted-foreground">{fmtDT(e.at)} - {e.actor}</p>
                    {Object.keys(e.details).length > 0 && <p className="mt-1 break-words font-mono text-[11px] text-muted-foreground">{Object.entries(e.details).map(([key, v]) => key + ': ' + (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(' | ')}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
