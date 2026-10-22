import { useState } from 'react';
import { Link } from 'wouter';
import { Loader2, Megaphone, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState, ErrorState, IncidentStatusPill, ListSkeleton, PageHeader, Panel, ReadingAge, SeverityPill, Temp } from '@/components/common';
import { ReadingDialog } from '@/components/reading-dialog';
import { useAssets, usePostReport } from '@/lib/queries';
import { humanize } from '@/lib/format';
import type { ReportResult } from '@/lib/types';

const EXAMPLES = ['Freezer 2 tak sejuk, ais dah cair', 'Chiller depan bunyi kuat, pintu tak rapat', 'Peti ais dapur bocor air'];

export default function Report() {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState<ReportResult | null>(null);
  const m = usePostReport();
  const assets = useAssets();
  const submit = () => {
    if (!text.trim()) return setErr('Describe what you see, in any language.');
    if (text.length > 1000) return setErr('Keep it under 1000 characters.');
    m.mutate(text.trim(), { onSuccess: (r) => { setResult(r); setText(''); } });
  };
  return (
    <>
      <PageHeader eyebrow="Report" title="Something wrong with a fridge?" sub="Write it how you would tell your supervisor. Bahasa, English or campur is fine." />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Panel>
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
              <label htmlFor="report" className="sr-only">Fault report</label>
              <Textarea id="report" rows={5} value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} maxLength={1000} placeholder="Freezer 2 tak sejuk..." className="text-base" data-testid="input-report" />
              <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((x) => <button type="button" key={x} onClick={() => setText(x)} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-primary/40" data-testid={'button-example-' + x.slice(0, 6)}>{x}</button>)}</div>
              {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{text.length}/1000. Phone numbers and emails are hidden automatically.</span>
                <Button type="submit" disabled={m.isPending} className="bg-thaw text-white hover:bg-thaw/90" data-testid="button-submit-report">{m.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Megaphone className="mr-1.5 h-4 w-4" />}Send report</Button>
              </div>
            </form>
          </Panel>
          {result && (
            <Panel title="Report received" className="border-primary/40">
              <div className="space-y-3 text-sm" data-testid="panel-report-result">
                <div className="flex flex-wrap items-center gap-2"><b>{result.incident.asset?.name ?? 'Unit not identified'}</b><SeverityPill s={result.incident.severity} /><IncidentStatusPill s={result.incident.status} /></div>
                {result.incident.status === 'NEEDS_INFO' && <p className="font-medium text-watch">We could not tell which unit. Open the incident and pick it.</p>}
                <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/60 p-3 text-xs">
                  {Object.entries(result.parsed).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => (
                    <div key={k}><dt className="text-muted-foreground">{humanize(k)}</dt><dd className="font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></div>
                  ))}
                  <div><dt className="text-muted-foreground">Read by</dt><dd className="font-mono">{result.parser_source === 'llm' ? 'AI' : result.parser_source === 'rules' ? 'rules' : 'rules (AI unavailable)'}</dd></div>
                </dl>
                <Link href={'/incidents/' + result.incident.id} className="inline-flex font-semibold text-primary" data-testid="link-report-incident">Open the incident</Link>
              </div>
            </Panel>
          )}
        </div>
        <Panel title="Or record a reading" pad={false}>
          {assets.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : assets.error ? <div className="p-4"><ErrorState error={assets.error} onRetry={() => assets.refetch()} /></div> :
            !assets.data?.length ? <div className="p-4"><EmptyState icon={Snowflake} title="No units yet" /></div> : (
              <ul className="divide-y divide-border">
                {assets.data.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{a.name}</p><p className="flex items-center gap-2"><Temp t={a.latest_temp_c} className="text-xs" /><ReadingAge at={a.latest_reading_at} state={a.reading_state} /></p></div>
                    <ReadingDialog assetId={a.id} assetName={a.name} range={a.range_c} trigger="Read" />
                  </li>
                ))}
              </ul>
            )}
        </Panel>
      </div>
    </>
  );
}
