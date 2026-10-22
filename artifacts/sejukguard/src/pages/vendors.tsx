import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Phone, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Chips, DeniedState, EmptyState, ErrorState, ListSkeleton, Money, PageHeader, Pager, Pill, SearchBox } from '@/components/common';
import { ConfirmButton } from '@/components/confirm';
import { VendorFormDialog } from '@/components/vendor-form';
import { useArchiveVendor, useDeleteVendor, useVendor, useVendors } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { usePaged } from '@/lib/paging';
import type { Vendor } from '@/lib/types';

function VendorDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useVendor(id);
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{q.data?.name ?? 'Vendor'}</DialogTitle><DialogDescription>Vendor details</DialogDescription></DialogHeader>
        {q.isLoading ? <ListSkeleton rows={2} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Services</dt><dd className="capitalize">{q.data.services.join(', ')}</dd></div>
            <div><dt className="text-xs text-muted-foreground">SLA</dt><dd>{q.data.sla_hours} hours</dd></div>
            <div><dt className="text-xs text-muted-foreground">Call-out fee</dt><dd><Money v={q.data.callout_rm} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">Phone</dt><dd><a className="text-primary" href={'tel:' + q.data.phone}>{q.data.phone}</a></dd></div>
            <div><dt className="text-xs text-muted-foreground">Scope</dt><dd>{q.data.warranty_only ? 'Warranty work only' : 'General repairs'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">State</dt><dd>{q.data.archived ? 'Archived' : 'Active'}</dd></div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Vendors() {
  const { can, isOwner } = useMe();
  const [archived, setArchived] = useState(false);
  const q = useVendors(archived, can('view_vendors'));
  const arch = useArchiveVendor();
  const del = useDeleteVendor();
  const [s, setS] = useState('');
  const [svc, setSvc] = useState<'all' | 'freezer' | 'chiller'>('all');
  const [edit, setEdit] = useState<Vendor | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const list = q.data ?? [];
  const filtered = useMemo(() => list.filter((v) => v.name.toLowerCase().includes(s.toLowerCase()) && (svc === 'all' || v.services.includes(svc)))
    .sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name)), [list, s, svc]);
  const pg = usePaged(filtered, 12, s + svc + archived);
  if (!can('view_vendors')) return <DeniedState />;
  return (
    <>
      <PageHeader eyebrow="Vendors" title="Who you call" sub="Proposals choose from active vendors by service, warranty, SLA and fee."
        actions={isOwner && <Button onClick={() => { setEdit(undefined); setFormOpen(true); }} data-testid="button-add-vendor"><Plus className="mr-1.5 h-4 w-4" />Add vendor</Button>} />
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SearchBox value={s} onChange={setS} placeholder="Search vendors" />
        <div className="flex flex-wrap items-center gap-3">
          <Chips label="Service" value={svc} onChange={setSvc} options={[{ value: 'all', label: 'All' }, { value: 'freezer', label: 'Freezer' }, { value: 'chiller', label: 'Chiller' }]} />
          {isOwner && <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Switch checked={archived} onCheckedChange={setArchived} data-testid="switch-vendors-archived" />Show archived</label>}
        </div>
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> :
        list.length === 0 ? <EmptyState icon={Truck} title="No vendors yet" body="Without a vendor, incidents can only be marked as having no vendor to call." action={isOwner && <Button onClick={() => setFormOpen(true)} data-testid="button-empty-add-vendor">Add vendor</Button>} /> :
        filtered.length === 0 ? <EmptyState icon={Truck} title="No matches" /> : (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {pg.slice.map((v) => (
                <li key={v.id} className="rise flex flex-col gap-3 rounded-xl border border-card-border bg-card p-4" data-testid={'card-vendor-' + v.id}>
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => setDetail(v.id)} data-testid={'button-vendor-detail-' + v.id}>
                      <p className="truncate font-bold hover:text-primary">{v.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{v.services.join(' + ')} - SLA {v.sla_hours} h</p>
                    </button>
                    <div className="flex gap-1">{v.warranty_only && <Pill className="border-primary/30 text-primary">Warranty</Pill>}{v.archived && <Pill className="border-border text-muted-foreground">Archived</Pill>}</div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <Money v={v.callout_rm} className="font-bold" />
                    <a href={'tel:' + v.phone} className="inline-flex items-center gap-1 text-primary" data-testid={'link-call-' + v.id}><Phone className="h-3.5 w-3.5" />{v.phone}</a>
                  </div>
                  {isOwner && (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button size="sm" variant="outline" onClick={() => { setEdit(v); setFormOpen(true); }} data-testid={'button-edit-vendor-' + v.id}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                      <ConfirmButton testid={'button-archive-vendor-' + v.id} trigger={v.archived ? <><ArchiveRestore className="mr-1 h-3.5 w-3.5" />Restore</> : <><Archive className="mr-1 h-3.5 w-3.5" />Archive</>}
                        title={v.archived ? 'Restore vendor?' : 'Archive vendor?'} body={v.archived ? 'They can be proposed again.' : 'They will no longer be proposed for new incidents. History is kept.'}
                        confirmLabel={v.archived ? 'Restore' : 'Archive'} onConfirm={() => arch.mutateAsync({ id: v.id, archived: !v.archived })} />
                      <ConfirmButton destructive testid={'button-delete-vendor-' + v.id} trigger={<><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</>} title={'Delete ' + v.name + '?'}
                        body="Vendors referenced by jobs, incidents or warranties cannot be deleted; archive them instead." confirmLabel="Delete" onConfirm={() => del.mutateAsync(v.id)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pager {...pg} />
          </>
        )}
      {isOwner && <VendorFormDialog open={formOpen} onOpenChange={setFormOpen} vendor={edit} />}
      <VendorDetail id={detail} onClose={() => setDetail(null)} />
    </>
  );
}
