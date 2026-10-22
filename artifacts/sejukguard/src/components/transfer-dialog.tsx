import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, MoveRight } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ErrorState, Field, ListSkeleton } from '@/components/common';
import { useAsset, useAssets, useTransfer } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function TransferDialog({ sourceId, incidentId, suggestedId, label = 'Move stock' }: { sourceId: string; incidentId?: string | null; suggestedId?: string | null; label?: string }) {
  const [open, setOpen] = useState(false);
  const [dest, setDest] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const src = useAsset(open ? sourceId : undefined);
  const assets = useAssets(false);
  const m = useTransfer();
  // One key per dialog session: a retry after a network failure reuses it so stock is never moved twice.
  const keyRef = useRef('');

  useEffect(() => {
    if (open) { setDest(suggestedId ?? ''); setQty({}); setErr(''); keyRef.current = crypto.randomUUID(); }
  }, [open, suggestedId]);

  const destinations = (assets.data ?? []).filter((a) => a.id !== sourceId && !a.archived);
  const destAsset = destinations.find((a) => a.id === dest);
  const lines = useMemo(() => (src.data?.stock ?? []).map((s) => {
    const q = Number(qty[s.id] || 0);
    return { s, q, vol: s.qty > 0 ? (s.volume_l * q) / s.qty : 0, bad: q < 0 || q > s.qty || Number.isNaN(q) };
  }), [src.data, qty]);
  const moving = lines.filter((l) => l.q > 0);
  const vol = moving.reduce((a, l) => a + l.vol, 0);
  const over = destAsset ? vol > destAsset.free_l : false;
  const typeMismatch = destAsset && src.data && destAsset.type !== src.data.type;

  const submit = () => {
    if (!dest) return setErr('Choose where the stock is going.');
    if (lines.some((l) => l.bad)) return setErr('Quantities must be between 0 and what is in the unit.');
    if (!moving.length) return setErr('Enter a quantity for at least one line.');
    m.mutate({ key: keyRef.current, body: { incident_id: incidentId ?? null, destination_asset_id: dest, items: moving.map((l) => ({ stock_item_id: l.s.id, qty: l.q })) } }, {
      onSuccess: () => { keyRef.current = crypto.randomUUID(); setOpen(false); },
      onError: (e) => { if (e.status !== 0) keyRef.current = crypto.randomUUID(); },
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="button-open-transfer"><MoveRight className="mr-1.5 h-4 w-4" />{label}</Button>
      <Dialog open={open} onOpenChange={(o) => !m.isPending && setOpen(o)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Record a stock transfer</DialogTitle>
            <DialogDescription>Record what was physically moved. Nothing moves until you save this; a recommended backup unit is only a suggestion.</DialogDescription>
          </DialogHeader>
          {src.isLoading ? <ListSkeleton rows={3} /> : src.error ? <ErrorState error={src.error} onRetry={() => src.refetch()} /> : src.data && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded-md bg-muted px-2 py-1 font-semibold">{src.data.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Select value={dest} onValueChange={(x) => { setDest(x); setErr(''); }}>
                  <SelectTrigger className="flex-1" data-testid="select-transfer-destination"><SelectValue placeholder="Destination unit" /></SelectTrigger>
                  <SelectContent>
                    {destinations.length === 0 && <div className="p-3 text-sm text-muted-foreground">No other active units</div>}
                    {destinations.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} - {a.type}, {a.free_l.toFixed(1)} L free{a.id === suggestedId ? ' (suggested)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {src.data.stock.length === 0 ? <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">This unit has no recorded stock to move.</p> : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {lines.map(({ s, q, vol: v, bad }) => (
                    <li key={s.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.qty} {s.unit} in unit, {s.volume_l} L{q > 0 && !bad ? ' - moving ' + v.toFixed(1) + ' L' : ''}</p>
                      </div>
                      <Input aria-label={'Quantity of ' + s.name + ' to move'} inputMode="decimal" className={cn('w-24 font-mono', bad && 'border-destructive')} placeholder="0"
                        value={qty[s.id] ?? ''} onChange={(e) => { setQty({ ...qty, [s.id]: e.target.value }); setErr(''); }} data-testid={'input-transfer-qty-' + s.id} />
                      <Button type="button" size="sm" variant="ghost" onClick={() => setQty({ ...qty, [s.id]: String(s.qty) })} data-testid={'button-transfer-all-' + s.id}>All</Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-accent/60 p-3 text-sm">
                <Field label="Volume moving"><p className="font-mono">{vol.toFixed(1)} L</p></Field>
                <Field label="Destination free"><p className={cn('font-mono', over && 'font-bold text-thaw')}>{destAsset ? destAsset.free_l.toFixed(1) + ' L' : '--'}</p></Field>
              </div>
              {over && <p className="text-sm font-semibold text-thaw">Not enough free space in {destAsset?.name}. The server will refuse this transfer.</p>}
              {typeMismatch && <p className="text-sm font-semibold text-amber">Destination is a {destAsset?.type}, source is a {src.data.type}. Incompatible transfers are refused.</p>}
              {err && <p className="text-sm font-medium text-destructive" role="alert">{err}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={m.isPending}>Cancel</Button>
            <Button onClick={submit} disabled={m.isPending || !src.data} data-testid="button-submit-transfer">{m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Record transfer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
