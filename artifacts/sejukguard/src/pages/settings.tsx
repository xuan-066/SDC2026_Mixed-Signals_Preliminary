import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DeniedState, ErrorState, Field, ListSkeleton, PageHeader, Panel } from '@/components/common';
import { useSettings, useUpdateSettings } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { rmToSen, senToRm } from '@/lib/format';

export default function SettingsPage() {
  const { isOwner } = useMe();
  if (!isOwner) return <DeniedState />;
  return <SettingsForm />;
}

function SettingsForm() {
  const q = useSettings();
  const m = useUpdateSettings();
  const [v, setV] = useState({ name: '', kind: '', limit: '' });
  const [errs, setErrs] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setV({ name: q.data.name, kind: q.data.kind, limit: senToRm(q.data.supervisor_limit_sen) }); }, [q.data]);
  if (q.isLoading) return <><PageHeader title="Settings" /><ListSkeleton rows={3} /></>;
  if (q.error) return <><PageHeader title="Settings" /><ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const dirty = q.data && (v.name !== q.data.name || v.kind !== q.data.kind || rmToSen(v.limit) !== q.data.supervisor_limit_sen);
  const submit = () => {
    const e: Record<string, string> = {};
    const sen = rmToSen(v.limit);
    if (v.name.trim().length < 2) e.name = 'Required';
    if (!v.kind.trim()) e.kind = 'Required';
    if (sen === null) e.limit = 'Amount in RM, e.g. 300.00';
    setErrs(e);
    if (Object.keys(e).length) return;
    m.mutate({ name: v.name.trim(), kind: v.kind.trim(), supervisor_limit_sen: sen as number });
  };
  return (
    <div className="sg-page sg-settings-page">
      <PageHeader eyebrow="Settings" title="Business settings" sub="Changes apply to new approval requests immediately." />
      <div className="sg-settings-layout grid gap-5 lg:grid-cols-[.65fr_1.35fr]">
      <aside className="rounded-xl border border-[#d8c6ac] bg-[#20364d] p-5 text-[#fff5e5]"><p className="font-mono text-[10px] uppercase tracking-[.16em] text-[#f4bd78]">Decision policy</p><h2 className="mt-2 font-display text-2xl font-bold">Keep approval limits clear.</h2><p className="mt-3 text-sm leading-relaxed text-white/70">Supervisor requests under this ceiling can be approved without waiting for the owner. New requests use the saved limit.</p></aside>
      <Panel className="border-t-4 border-t-[#d99a43]">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Business name" htmlFor="s-name" error={errs.name}><Input id="s-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="input-settings-name" /></Field>
          <Field label="Kind of business" htmlFor="s-kind" error={errs.kind}><Input id="s-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })} data-testid="input-settings-kind" /></Field>
          <Field label="Supervisor approval limit (RM)" htmlFor="s-lim" error={errs.limit} hint="Call-outs up to this amount can be approved by a supervisor. Anything above needs the owner.">
            <Input id="s-lim" inputMode="decimal" value={v.limit} onChange={(e) => setV({ ...v, limit: e.target.value })} className="font-mono" data-testid="input-settings-limit" />
          </Field>
          <Button type="submit" disabled={m.isPending || !dirty} data-testid="button-save-settings">{m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save settings</Button>
        </form>
      </Panel>
      </div>
    </div>
  );
}
