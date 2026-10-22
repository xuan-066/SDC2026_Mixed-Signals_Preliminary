import { useState } from 'react';
import { Redirect, useLocation } from 'wouter';
import { useClerk } from '@clerk/react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, Field } from '@/components/common';
import { useAccess, useOnboard } from '@/lib/queries';
import { PublicCard, PublicFrame } from './public-frame';

const KINDS = ['Restaurant', 'Kopitiam', 'Cafe', 'Bakery', 'Catering', 'Cloud kitchen', 'Mamak', 'Food stall'];
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Onboarding() {
  const access = useAccess();
  const onboard = useOnboard();
  const { signOut } = useClerk();
  const [, nav] = useLocation();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});

  if (access.isLoading) return <PublicFrame><PublicCard title="Checking your account..." /></PublicFrame>;
  if (access.error) return <PublicFrame><ErrorState error={access.error} onRetry={() => access.refetch()} /></PublicFrame>;
  const a = access.data!;
  if (!a.authenticated) return <Redirect to="/sign-in" />;
  if (a.member) return <Redirect to="/dashboard" />;
  if (a.verified === false)
    return (
      <PublicFrame>
        <PublicCard title="Verify your email first" sub={<>We need a verified email before creating a business for {a.email ?? 'this account'}. Check your inbox, or manage your email in your account.</>}>
          <div className="flex gap-2"><Button onClick={() => access.refetch()} data-testid="button-recheck">I have verified</Button></div>
        </PublicCard>
      </PublicFrame>
    );

  const submit = () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = 'Enter the name your team knows the business by';
    if (!kind.trim()) e.kind = 'Pick or type the kind of business';
    setErrs(e);
    if (Object.keys(e).length) return;
    onboard.mutate({ name: name.trim(), kind: kind.trim() }, { onSuccess: () => nav('/equipment') });
  };

  return (
    <PublicFrame>
      <PublicCard title="Set up your business" sub={<>Signed in as <b>{a.email}</b>. This creates an empty business with you as owner. Next you will add your fridges and freezers. Joining someone else's business? Open the invitation link they sent you instead.</>}>
        <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); submit(); }}>
          <Field label="Business name" htmlFor="b-name" error={errs.name}><Input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Restoran Seri Kenanga" data-testid="input-business-name" /></Field>
          <Field label="Kind of business" htmlFor="b-kind" error={errs.kind}>
            <Input id="b-kind" list="kinds" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Restaurant" data-testid="input-business-kind" />
            <datalist id="kinds">{KINDS.map((k) => <option key={k} value={k} />)}</datalist>
          </Field>
          <Button type="submit" className="w-full" disabled={onboard.isPending} data-testid="button-create-business">{onboard.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create business</Button>
        </form>
        <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="mt-4 text-xs text-muted-foreground underline" data-testid="button-onboarding-sign-out">Use a different account</button>
      </PublicCard>
    </PublicFrame>
  );
}
