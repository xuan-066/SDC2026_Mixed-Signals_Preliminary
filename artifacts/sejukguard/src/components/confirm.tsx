import { useState, type ReactNode } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/** A button that asks before doing something consequential. onConfirm returns a promise; dialog closes on success. */
export function ConfirmButton({ trigger, title, body, confirmLabel, onConfirm, destructive, disabled, testid, variant = 'outline', size = 'sm' }: {
  trigger: ReactNode; title: string; body: ReactNode; confirmLabel: string; onConfirm: () => Promise<unknown>; destructive?: boolean; disabled?: boolean; testid: string;
  variant?: 'outline' | 'default' | 'destructive' | 'ghost' | 'secondary'; size?: 'sm' | 'default' | 'icon';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} disabled={disabled} onClick={() => setOpen(true)} data-testid={testid}>{trigger}</Button>
      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription asChild><div className="space-y-2 text-sm text-muted-foreground">{body}</div></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} data-testid={testid + '-cancel'}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              data-testid={testid + '-confirm'}
              className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try { await onConfirm(); setOpen(false); } catch { /* toast shown by mutation */ } finally { setBusy(false); }
              }}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
