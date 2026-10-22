import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Archive, Plus, Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Chips, EmptyState, ErrorState, ListSkeleton, PageHeader, Pager, Pill, ReadingAge, SearchBox, SeverityPill, Temp, ThermoBar } from '@/components/common';
import { AssetFormDialog } from '@/components/asset-form';
import { useAssets } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { usePaged } from '@/lib/paging';
import { SEVERITY, fmtTemp } from '@/lib/format';

type F = 'all' | 'alert' | 'stale' | 'freezer' | 'chiller';

export default function Equipment() {
  const { isOwner } = useMe();
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState<F>('all');
  const [adding, setAdding] = useState(false);
  const [, nav] = useLocation();
  const assets = useAssets(archived);
  const list = assets.data ?? [];
  const filtered = useMemo(() => list
    .filter((a) => a.name.toLowerCase().includes(q.toLowerCase()))
    .filter((a) => f === 'all' ? true : f === 'alert' ? a.status !== 'NORMAL' : f === 'stale' ? a.reading_state !== 'current' : a.type === f)
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || SEVERITY[b.status].rank - SEVERITY[a.status].rank || a.name.localeCompare(b.name)), [list, q, f]);
  const pg = usePaged(filtered, 12, q + f + archived);

  return (
    <>
      <PageHeader eyebrow="Equipment" title="Chillers and freezers" sub="Every unit with its latest real reading. Stale means more than 60 minutes old."
        actions={isOwner && <Button onClick={() => setAdding(true)} data-testid="button-add-equipment"><Plus className="mr-1.5 h-4 w-4" />Add equipment</Button>} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBox value={q} onChange={setQ} placeholder="Search units" />
        <div className="flex flex-wrap items-center gap-3">
          <Chips label="Filter" value={f} onChange={setF} options={[
            { value: 'all', label: 'All', count: list.length },
            { value: 'alert', label: 'Out of normal', count: list.filter((a) => a.status !== 'NORMAL').length },
            { value: 'stale', label: 'Stale / missing', count: list.filter((a) => a.reading_state !== 'current').length },
            { value: 'freezer', label: 'Freezers' }, { value: 'chiller', label: 'Chillers' },
          ]} />
          {isOwner && <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Switch checked={archived} onCheckedChange={setArchived} data-testid="switch-include-archived" />Show archived</label>}
        </div>
      </div>
      {assets.isLoading ? <ListSkeleton rows={6} /> : assets.error ? <ErrorState error={assets.error} onRetry={() => assets.refetch()} /> :
        list.length === 0 ? <EmptyState icon={Snowflake} title="No equipment yet" body={isOwner ? 'Add your first chiller or freezer with its safe temperature band.' : 'Your owner has not added any units yet.'}
          action={isOwner && <Button onClick={() => setAdding(true)} data-testid="button-empty-add-equipment">Add equipment</Button>} /> :
        filtered.length === 0 ? <EmptyState icon={Snowflake} title="No matches" body="Try a different search or filter." /> : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {pg.slice.map((a, i) => (
                <li key={a.id} className="rise" style={{ animationDelay: i * 30 + 'ms' }}>
                  <Link href={'/equipment/' + a.id} className="block h-full rounded-xl border border-card-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40" data-testid={'card-equipment-' + a.id}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-bold">{a.name}</p><p className="text-xs capitalize text-muted-foreground">{a.type} - {fmtTemp(a.range_c[0])} to {fmtTemp(a.range_c[1])}</p></div>
                      {a.archived ? <Pill className="border-border text-muted-foreground"><Archive className="h-3 w-3" />Archived</Pill> : <SeverityPill s={a.status} />}
                    </div>
                    <div className="mt-4 flex items-end justify-between"><Temp t={a.latest_temp_c} className="text-3xl font-bold" /><ReadingAge at={a.latest_reading_at} state={a.reading_state} /></div>
                    <div className="mt-3"><ThermoBar t={a.latest_temp_c} range={a.range_c} /></div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{a.free_l.toFixed(0)} of {a.capacity_l.toFixed(0)} L free</span>
                      {a.active_incident_id && <span className="font-semibold text-thaw">Active incident</span>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
      <AssetFormDialog open={adding} onOpenChange={setAdding} onSaved={(id) => nav('/equipment/' + id)} />
    </>
  );
}
