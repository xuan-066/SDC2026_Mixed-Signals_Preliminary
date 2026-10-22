import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Field } from '@/components/common';
import { useCreateVendor, useUpdateVendor } from '@/lib/queries';
import { rmToSen } from '@/lib/format';
import type { AssetType, Vendor, VendorInput } from '@/lib/types';

const blank = { name: '', services: ['chiller', 'freezer'] as AssetType[], callout: '', sla: '4', phone: '', warranty_only: false };

export function VendorFormDialog({ open, onOpenChange, vendor }: { open: boolean; onOpenChange: (o: boolean) => void; vendor?: Vendor }) {
  const [v, setV] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setErrs({});
    setV(vendor ? {
      name: vendor.name, services: vendor.services.filter((s): s is AssetType => s === 'chiller' || s === 'freezer'),
      callout: vendor.callout_rm ?? '', sla: String(vendor.sla_hours), phone: vendor.phone, warranty_only: vendor.warranty_only,
    } : blank);
  }, [open, vendor]);

  const toggle = (s: AssetType) => setV((x) => ({ ...x, services: x.services.includes(s) ? x.services.filter((y) => y !== s) : [...x.services, s] }));

  const submit = () => {
    const e: Record<string, string> = {};
    const sen = rmToSen(v.callout);
    const sla = Number(v.sla);
    if (!v.name.trim()) e.name = 'Name is required';
    if (!v.services.length) e.services = 'Pick at least one service';
    if (sen === null) e.callout = 'Amount in RM, e.g. 180.00';
    if (!Number.isInteger(sla) || sla < 1) e.sla = 'Whole hours, 1 or more';
    if (!v.phone.trim()) e.phone = 'Phone is required';
    setErrs(e);
    if (Object.keys(e).length) return;
    const body: VendorInput = { name: v.name.trim(), services: v.services, callout_fee_sen: sen as number, sla_hours: sla, phone: v.phone.trim(), warranty_only: v.warranty_only };
    const done = { onSuccess: () => onOpenChange(false) };
    if (vendor) update.mutate({ id: vendor.id, body }, done); else create.mutate(body, done);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit ' + vendor.name : 'Add vendor'}</DialogTitle>
          <DialogDescription>SejukGuard proposes vendors by service, SLA and call-out fee. Fees above the supervisor limit need an owner.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="sm:col-span-2"><Field label="Company name" htmlFor="v-n" error={errs.name}><Input id="v-n" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="input-vendor-name" /></Field></div>
          <Field label="Services" error={errs.services}>
            <div className="flex gap-4 pt-1">
              {(['chiller', 'freezer'] as AssetType[]).map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox checked={v.services.includes(s)} onCheckedChange={() => toggle(s)} data-testid={'checkbox-service-' + s} />{s}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Phone" htmlFor="v-p" error={errs.phone}><Input id="v-p" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} placeholder="+60 12-345 6789" data-testid="input-vendor-phone" /></Field>
          <Field label="Call-out fee (RM)" htmlFor="v-c" error={errs.callout}><Input id="v-c" inputMode="decimal" value={v.callout} onChange={(e) => setV({ ...v, callout: e.target.value })} placeholder="180.00" data-testid="input-vendor-callout" /></Field>
          <Field label="SLA (hours)" htmlFor="v-s" error={errs.sla}><Input id="v-s" inputMode="numeric" value={v.sla} onChange={(e) => setV({ ...v, sla: e.target.value })} data-testid="input-vendor-sla" /></Field>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 sm:col-span-2">
            <span><span className="block text-sm font-semibold">Warranty work only</span><span className="text-xs text-muted-foreground">Only proposed for units under this vendor's warranty</span></span>
            <Switch checked={v.warranty_only} onCheckedChange={(c) => setV({ ...v, warranty_only: c })} data-testid="switch-warranty-only" />
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-save-vendor">{pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{vendor ? 'Save changes' : 'Add vendor'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
