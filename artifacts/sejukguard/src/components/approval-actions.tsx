import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field, Money } from '@/components/common';
import { useApprove, useReject } from '@/lib/queries';
import { ROLE_LABEL } from '@/lib/format';
import type { Approval } from '@/lib/types';

/** Approve/reject controls. Rendered only from the server's can_decide, never inferred locally. */
export function ApprovalActions({ approval }: { approval: Approval }) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const ap = useApprove();
  const rj = useReject();
  const pending = ap.isPending || rj.isPending;
  if (approval.status !== 'PENDING') return null;
  if (!approval.can_decide)
    return <p className="text-sm text-muted-foreground" data-testid="text-approval-waiting">Waiting for a {ROLE_LABEL[approval.required_role].toLowerCase()} or above. You cannot decide this one.</p>;
  const submit = () => {
    if (mode === 'reject' && !note.trim()) return setErr('Say why, so the team knows what happens next.');
    const done = { onSuccess: () => { setMode(null); setNote(''); } };
    if (mode === 'approve') ap.mutate({ id: approval.id, note: note.trim() || undefined }, done);
    else rj.mutate({ id: approval.id, note: note.trim() }, done);
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => { setErr(''); setMode('approve'); }} disabled={pending} data-testid={'button-approve-' + approval.id}><Check className="mr-1.5 h-4 w-4" />Approve</Button>
        <Button size="sm" variant="outline" onClick={() => { setErr(''); setMode('reject'); }} disabled={pending} data-testid={'button-reject-' + approval.id}><X className="mr-1.5 h-4 w-4" />Reject</Button>
      </div>
      <Dialog open={mode !== null} onOpenChange={(o) => !pending && !o && setMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === 'approve' ? 'Approve call-out' : 'Reject call-out'}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <p>{approval.summary}</p>
                <p>Amount: <Money v={approval.amount_rm} /></p>
                {mode === 'reject' && <p className="font-medium text-thaw">The incident stays unresolved. No vendor will be contacted.</p>}
              </div>
            </DialogDescription>
          </DialogHeader>
          <Field label={mode === 'approve' ? 'Note (optional)' : 'Reason (required)'} htmlFor="ap-note" error={err}>
            <Textarea id="ap-note" value={note} onChange={(e) => { setNote(e.target.value); setErr(''); }} rows={3} data-testid="input-approval-note" />
          </Field>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode(null)} disabled={pending}>Cancel</Button>
            <Button onClick={submit} disabled={pending} variant={mode === 'reject' ? 'destructive' : 'default'} data-testid="button-confirm-decision">
              {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{mode === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
