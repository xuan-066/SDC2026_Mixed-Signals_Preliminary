import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { Archive, ArchiveRestore, Package, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, Money, PageHeader, Panel, Pill, ReadingAge, SeverityPill, Temp, ThermoBar } from '@/components/common';
import { ConfirmButton } from '@/components/confirm';
import { TempChart } from '@/components/temp-chart';
import { ReadingDialog } from '@/components/reading-dialog';
import { AssetFormDialog } from '@/components/asset-form';
import { StockFormDialog } from '@/components/stock-form';
import { TransferDialog } from '@/components/transfer-dialog';
import { useArchiveAsset, useAsset, useDeleteAsset, useDeleteStock, useVendors } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { fmtDT, fmtDate, fmtTemp } from '@/lib/format';
import type { StockItem } from '@/lib/types';

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { isOwner, isSupervisor, can } = useMe();
  const q = useAsset(id);
  const vendors = useVendors(true, can('view_vendors'));
  const archive = useArchiveAsset();
  const del = useDeleteAsset();
  const delStock = useDeleteStock();
  const [, nav] = useLocation();
  const [editing, setEditing] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);
  const [stockItem, setStockItem] = useState<StockItem | undefined>();

  if (q.isLoading) return <><PageHeader title="Loading unit..." back={{ href: '/equipment', label: 'Equipment' }} /><ListSkeleton rows={4} /></>;
  if (q.error || !q.data) return <><PageHeader title="Equipment" back={{ href: '/equipment', label: 'Equipment' }} /><ErrorState error={q.error} onRetry={() => q.refetch()} /></>;
  const a = q.data;
  const warrantyVendor = vendors.data?.find((v) => v.id === a.warranty_vendor_id);
  const used = a.capacity_l - a.free_l;

  return (
    <>
      <PageHeader back={{ href: '/equipment', label: 'Equipment' }} eyebrow={a.type + (a.archived ? ' - archived' : '')} title={a.name}
        sub={<span className="flex flex-wrap items-center gap-2"><SeverityPill s={a.status} />Safe {fmtTemp(a.range_c[0])} to {fmtTemp(a.range_c[1])}{a.aliases.length > 0 && <span>- also called {a.aliases.join(', ')}</span>}</span>}
        actions={<>
          {!a.archived && <ReadingDialog assetId={a.id} assetName={a.name} range={a.range_c} size="default" />}
          {isOwner && <Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-equipment"><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>}
          {isOwner && <ConfirmButton size="default" testid="button-archive-equipment" trigger={a.archived ? <><ArchiveRestore className="mr-1.5 h-4 w-4" />Restore</> : <><Archive className="mr-1.5 h-4 w-4" />Archive</>}
            title={a.archived ? 'Restore this unit?' : 'Archive this unit?'} body={a.archived ? 'It will appear in lists and reports again.' : 'Archived units stay in history but disappear from lists, reports and transfer choices.'}
            confirmLabel={a.archived ? 'Restore' : 'Archive'} onConfirm={() => archive.mutateAsync({ id: a.id, archived: !a.archived })} />}
          {isOwner && <ConfirmButton size="default" destructive testid="button-delete-equipment" trigger={<><Trash2 className="mr-1.5 h-4 w-4" />Delete</>} title="Delete this unit permanently?"
            body={<><p>Units with readings, stock or incidents cannot be deleted; archive them instead.</p></>} confirmLabel="Delete"
            onConfirm={() => del.mutateAsync(a.id).then(() => nav('/equipment'))} />}
        </>} />

      {a.active_incident_id && (
        <Link href={'/incidents/' + a.active_incident_id} className="rise mb-6 flex items-center gap-3 rounded-xl border border-thaw/40 bg-thaw/10 p-4 text-sm font-semibold text-thaw" data-testid="link-active-incident">
          <ShieldAlert className="h-5 w-5" />This unit has an active incident. Open the response plan.
        </Link>
      )}

      <div className="sg-equipment-detail-grid grid gap-6 lg:grid-cols-[1.5fr_.7fr]">
        <Panel title="Temperature record · actual readings">
          {a.readings.length === 0 ? <EmptyState icon={ShieldAlert} title="No readings yet" body="Nothing is plotted until someone records a reading or a sensor reports." /> : <TempChart readings={a.readings} range={a.range_c} />}
        </Panel>
        <div className="space-y-4">
          <Panel className="border-t-4 border-t-primary">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Latest</p>
            <Temp t={a.latest_temp_c} className="font-display text-5xl font-extrabold" />
            <div className="mt-1"><ReadingAge at={a.latest_reading_at} state={a.reading_state} /></div>
            <div className="mt-4"><ThermoBar t={a.latest_temp_c} range={a.range_c} /></div>
          </Panel>
          <Panel>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Space used</dt><dd className="font-mono">{used.toFixed(1)} / {a.capacity_l.toFixed(0)} L</dd></div>
              <div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: Math.min(100, (used / Math.max(a.capacity_l, 1)) * 100) + '%' }} /></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Stock value</dt><dd><Money v={a.stock_value_rm} /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Warranty</dt><dd>{a.warranty_until ? 'until ' + fmtDate(a.warranty_until) : 'None recorded'}</dd></div>
              {a.warranty_vendor_id && <div className="flex justify-between"><dt className="text-muted-foreground">Warranty vendor</dt><dd>{warrantyVendor?.name ?? 'Restricted'}</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>

      <Panel className="sg-stock-ledger mt-6" title={'Stock protection · ' + a.stock.length + ' lines'} pad={false}
        action={isSupervisor && !a.archived && <div className="flex gap-2">
          {a.stock.length > 0 && <TransferDialog sourceId={a.id} incidentId={a.active_incident_id} />}
          <Button size="sm" variant="outline" onClick={() => { setStockItem(undefined); setStockOpen(true); }} data-testid="button-add-stock"><Plus className="mr-1 h-4 w-4" />Add</Button>
        </div>}>
        {a.stock.length === 0 ? <div className="p-4"><EmptyState icon={Package} title="No stock recorded" body="Record what is inside so incidents can show what is at risk and where it fits." /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Item</th><th className="px-4 py-2.5 text-right font-semibold">Qty</th><th className="px-4 py-2.5 text-right font-semibold">Volume</th>
                <th className="px-4 py-2.5 text-right font-semibold">Unit cost</th><th className="px-4 py-2.5 text-right font-semibold">Value</th>{isSupervisor && <th className="px-4 py-2.5" />}
              </tr></thead>
              <tbody className="divide-y divide-border">
                {a.stock.map((s) => (
                  <tr key={s.id} data-testid={'row-stock-' + s.id}>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.qty} {s.unit}</td>
                    <td className="px-4 py-3 text-right font-mono">{s.volume_l} L</td>
                    <td className="px-4 py-3 text-right"><Money v={s.unit_cost_rm} /></td>
                    <td className="px-4 py-3 text-right"><Money v={s.value_rm} /></td>
                    {isSupervisor && <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button size="icon" variant="ghost" aria-label={'Edit ' + s.name} onClick={() => { setStockItem(s); setStockOpen(true); }} data-testid={'button-edit-stock-' + s.id}><Pencil className="h-4 w-4" /></Button>
                      <ConfirmButton size="icon" variant="ghost" destructive testid={'button-delete-stock-' + s.id} trigger={<Trash2 className="h-4 w-4" />} title={'Remove ' + s.name + '?'}
                        body="Use this for stock that was used up or thrown away. To move stock, record a transfer instead." confirmLabel="Remove" onConfirm={() => delStock.mutateAsync(s.id)} />
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-6" title="Reading log" pad={false}>
        {a.readings.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No readings recorded.</p> : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {[...a.readings].reverse().map((r) => {
              const out = r.temp_c < a.range_c[0] || r.temp_c > a.range_c[1];
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{fmtDT(r.recorded_at)}</span>
                  <span className="flex items-center gap-3"><Pill className="border-border text-muted-foreground">{r.source}</Pill><Temp t={r.temp_c} className={out ? 'font-bold text-thaw' : ''} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {isOwner && <AssetFormDialog open={editing} onOpenChange={setEditing} asset={a} />}
      {isSupervisor && <StockFormDialog open={stockOpen} onOpenChange={setStockOpen} assetId={a.id} item={stockItem} freeL={a.free_l} />}
    </>
  );
}
