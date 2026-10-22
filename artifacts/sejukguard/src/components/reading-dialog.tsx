import { useState } from 'react';
import { Loader2, Thermometer } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common';
import { usePostReading } from '@/lib/queries';
import { fmtTemp } from '@/lib/format';

export function ReadingDialog({ assetId, assetName, range, trigger = 'Record reading', size = 'sm' }: { assetId: string; assetName: string; range: [number, number]; trigger?: string; size?: 'sm' | 'default' }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [err, setErr] = useState('');
  const m = usePostReading();
  const submit = () => {
    const n = Number(val.replace(',', '.'));
    if (val.trim() === '' || !Number.isFinite(n) || n < -60 || n > 40) { setErr('Enter the thermometer value in °C, between -60 and 40.'); return; }
    m.mutate({ asset_id: assetId, temp_c: n }, { onSuccess: () => { setOpen(false); setVal(''); } });
  };
  return (
    <>
      <Button size={size} variant="outline" onClick={() => { setErr(''); setOpen(true); }} data-testid={'button-record-reading-' + assetId}>
        <Thermometer className="mr-1.5 h-4 w-4" />{trigger}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !m.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reading for {assetName}</DialogTitle>
            <DialogDescription>Safe band {fmtTemp(range[0])} to {fmtTemp(range[1])}. Read the display or probe thermometer now.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Field label="Temperature (°C)" htmlFor="temp" error={err}>
              <Input id="temp" autoFocus inputMode="decimal" value={val} onChange={(e) => { setVal(e.target.value); setErr(''); }} placeholder="-18.0" className="h-14 font-mono text-2xl" data-testid="input-temperature" />
            </Field>
            <DialogFooter className="mt-5">
              <Button type="submit" disabled={m.isPending} className="w-full sm:w-auto" data-testid="button-submit-reading">
                {m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save reading
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
