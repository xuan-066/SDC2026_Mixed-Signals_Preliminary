import { useState } from 'react';
import { CheckCheck, Loader2, PhoneCall } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/common';
import { ConfirmButton } from '@/components/confirm';
import { useCompleteJob, useConfirmJob } from '@/lib/queries';
import type { Job } from '@/lib/types';

export function JobActions({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const [eta, setEta] = useState('');
  const confirm = useConfirmJob();
  const complete = useCompleteJob();
  if (job.status === 'DONE') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {job.status === 'REQUESTED' && (
        <Button size="sm" onClick={() => { setEta(''); setOpen(true); }} disabled={confirm.isPending} data-testid={'button-confirm-job-' + job.id}>
          <PhoneCall className="mr-1.5 h-4 w-4" />Vendor confirmed
        </Button>
      )}
      <ConfirmButton testid={'button-complete-job-' + job.id} variant={job.status === 'CONFIRMED' ? 'default' : 'outline'}
        trigger={<><CheckCheck className="mr-1.5 h-4 w-4" />Mark complete</>} title="Mark the repair complete?"
        body={<p>Record completion only once {job.vendor_name} has finished. If the latest reading is still out of range, the incident stays unresolved until a recovery reading is recorded. Without a recent reading, the existing recovery rule resolves the incident; record a current reading first to verify temperature.</p>}
        confirmLabel="Mark complete" onConfirm={() => complete.mutateAsync(job.id)} disabled={complete.isPending} />
      <Dialog open={open} onOpenChange={(o) => !confirm.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Record vendor confirmation</DialogTitle>
            <DialogDescription>Enter the arrival time {job.vendor_name} gave you. Leave empty to use their SLA.</DialogDescription>
          </DialogHeader>
          <Field label="ETA" htmlFor="eta"><Input id="eta" type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} data-testid="input-job-eta" /></Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={confirm.isPending}>Cancel</Button>
            <Button writeAction disabled={confirm.isPending} data-testid="button-save-confirmation"
              onClick={() => confirm.mutate({ id: job.id, eta: eta ? new Date(eta).toISOString() : undefined }, { onSuccess: () => setOpen(false) })}>
              {confirm.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
