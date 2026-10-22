import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common';
import { useCreateStock, useUpdateStock } from '@/lib/queries';
import { rmToSen } from '@/lib/format';
import type { StockItem } from '@/lib/types';

const blank = { name: '', qty: '', unit: 'kg', cost: '', volume: '' };

export function StockFormDialog({ open, onOpenChange, assetId, item, freeL }: { open: boolean; onOpenChange: (o: boolean) => void; assetId: string; item?: StockItem; freeL: number }) {
  const [v, setV] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const create = useCreateStock();
  const update = useUpdateStock();
  const pending = create.isPending || update.isPending;
  useEffect(() => {
    if (!open) return;
    setErrs({});
    setV(item ? { name: item.name, qty: String(item.qty), unit: item.unit, cost: item.unit_cost_rm ?? '', volume: String(item.volume_l) } : blank);
  }, [open, item]);

  const submit = () => {
    const e: Record<string, string> = {};
    const qty = Number(v.qty), vol = Number(v.volume), sen = rmToSen(v.cost);
    if (!v.name.trim()) e.name = 'Required';
    if (!(qty > 0)) e.qty = 'Above 0';
    if (!v.unit.trim()) e.unit = 'Required';
    if (sen === null) e.cost = 'RM per unit, e.g. 24.50';
    if (!(vol > 0)) e.volume = 'Litres above 0';
    setErrs(e);
    if (Object.keys(e).length) return;
    const body = { name: v.name.trim(), qty, unit: v.unit.trim(), unit_cost_sen: sen as number, volume_l: vol };
    const done = { onSuccess: () => onOpenChange(false) };
    if (item) update.mutate({ id: item.id, body }, done); else create.mutate({ assetId, body }, done);
  };
  const avail = freeL + (item?.volume_l ?? 0);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit stock line' : 'Add stock line'}</DialogTitle>
          <DialogDescription>Volume is the total space this whole line takes, not per unit. About {avail.toFixed(1)} L free.</DialogDescription>
        </DialogHeader>
        <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="col-span-2"><Field label="Item" htmlFor="s-n" error={errs.name}><Input id="s-n" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Ayam bahagian, marinated" data-testid="input-stock-name" /></Field></div>
          <Field label="Quantity" htmlFor="s-q" error={errs.qty}><Input id="s-q" inputMode="decimal" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} data-testid="input-stock-qty" /></Field>
          <Field label="Unit" htmlFor="s-u" error={errs.unit}><Input id="s-u" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} data-testid="input-stock-unit" /></Field>
          <Field label="Cost per unit (RM)" htmlFor="s-c" error={errs.cost}><Input id="s-c" inputMode="decimal" value={v.cost} onChange={(e) => setV({ ...v, cost: e.target.value })} data-testid="input-stock-cost" /></Field>
          <Field label="Total volume (L)" htmlFor="s-v" error={errs.volume}><Input id="s-v" inputMode="decimal" value={v.volume} onChange={(e) => setV({ ...v, volume: e.target.value })} data-testid="input-stock-volume" /></Field>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending} data-testid="button-save-stock">{pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{item ? 'Save' : 'Add line'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
