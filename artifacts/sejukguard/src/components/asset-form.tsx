import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/common';
import { useCreateAsset, useUpdateAsset, useVendors } from '@/lib/queries';
import type { AssetDetail, AssetInput, AssetType } from '@/lib/types';

const NONE = '__none__';
const blank = { name: '', type: 'chiller' as AssetType, aliases: '', min_c: '0', max_c: '5', capacity_l: '', warranty_until: '', warranty_vendor_id: NONE };

export function AssetFormDialog({ open, onOpenChange, asset, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; asset?: AssetDetail; onSaved?: (id: string) => void }) {
  const [v, setV] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const vendors = useVendors(false, open);
  const create = useCreateAsset();
  const update = useUpdateAsset();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setErrs({});
    setV(asset ? {
      name: asset.name, type: (asset.type === 'freezer' ? 'freezer' : 'chiller'), aliases: asset.aliases.join(', '),
      min_c: String(asset.range_c[0]), max_c: String(asset.range_c[1]), capacity_l: String(asset.capacity_l),
      warranty_until: asset.warranty_until ?? '', warranty_vendor_id: asset.warranty_vendor_id ?? NONE,
    } : blank);
  }, [open, asset]);

  const set = (k: keyof typeof blank) => (val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = () => {
    const e: Record<string, string> = {};
    const min = Number(v.min_c), max = Number(v.max_c), cap = Number(v.capacity_l);
    if (!v.name.trim()) e.name = 'Name is required';
    if (v.min_c === '' || !Number.isFinite(min)) e.min_c = 'Number required';
    if (v.max_c === '' || !Number.isFinite(max)) e.max_c = 'Number required';
    if (!e.min_c && !e.max_c && min >= max) e.max_c = 'Max must be above min';
    if (!(cap > 0)) e.capacity_l = 'Capacity in litres, above 0';
    setErrs(e);
    if (Object.keys(e).length) return;
    const body: AssetInput = {
      name: v.name.trim(), type: v.type, aliases: v.aliases.split(',').map((s) => s.trim()).filter(Boolean),
      min_c: min, max_c: max, capacity_l: cap, warranty_until: v.warranty_until || null,
      warranty_vendor_id: v.warranty_vendor_id === NONE ? null : v.warranty_vendor_id,
    };
    const done = { onSuccess: (a: AssetDetail) => { onOpenChange(false); onSaved?.(a.id); } };
    if (asset) update.mutate({ id: asset.id, body }, done); else create.mutate(body, done);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{asset ? 'Edit ' + asset.name : 'Add equipment'}</DialogTitle>
          <DialogDescription>Aliases help staff reports match this unit, e.g. "peti ais dapur" or "freezer 2".</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="sm:col-span-2"><Field label="Name" htmlFor="a-name" error={errs.name}><Input id="a-name" value={v.name} onChange={(e) => set('name')(e.target.value)} data-testid="input-asset-name" /></Field></div>
          <Field label="Type">
            <Select value={v.type} onValueChange={set('type')}>
              <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="chiller">Chiller</SelectItem><SelectItem value="freezer">Freezer</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Capacity (litres)" htmlFor="a-cap" error={errs.capacity_l}><Input id="a-cap" inputMode="decimal" value={v.capacity_l} onChange={(e) => set('capacity_l')(e.target.value)} data-testid="input-asset-capacity" /></Field>
          <Field label="Safe min (°C)" htmlFor="a-min" error={errs.min_c}><Input id="a-min" inputMode="decimal" value={v.min_c} onChange={(e) => set('min_c')(e.target.value)} data-testid="input-asset-min" /></Field>
          <Field label="Safe max (°C)" htmlFor="a-max" error={errs.max_c}><Input id="a-max" inputMode="decimal" value={v.max_c} onChange={(e) => set('max_c')(e.target.value)} data-testid="input-asset-max" /></Field>
          <div className="sm:col-span-2"><Field label="Aliases" htmlFor="a-al" hint="Comma separated"><Input id="a-al" value={v.aliases} onChange={(e) => set('aliases')(e.target.value)} data-testid="input-asset-aliases" /></Field></div>
          <Field label="Warranty until" htmlFor="a-w"><Input id="a-w" type="date" value={v.warranty_until} onChange={(e) => set('warranty_until')(e.target.value)} data-testid="input-asset-warranty" /></Field>
          <Field label="Warranty vendor">
            <Select value={v.warranty_vendor_id} onValueChange={set('warranty_vendor_id')}>
              <SelectTrigger data-testid="select-warranty-vendor"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {(vendors.data ?? []).map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-save-asset">{pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{asset ? 'Save changes' : 'Add equipment'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
