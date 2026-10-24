import { useEffect, useState } from 'react';
import { UserProfile, useClerk } from '@clerk/react';
import { Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, Field, ListSkeleton, PageHeader, Panel } from '@/components/common';
import { useProfile, useUpdateProfile } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { ROLE_LABEL } from '@/lib/format';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Account() {
  const { me } = useMe();
  const { signOut } = useClerk();
  const q = useProfile();
  const m = useUpdateProfile();
  const [v, setV] = useState({ name: '', phone: '' });
  const [err, setErr] = useState('');
  useEffect(() => { if (q.data) setV({ name: q.data.name, phone: q.data.phone ?? '' }); }, [q.data]);
  return (
    <div className="sg-page sg-account-page">
      <PageHeader eyebrow="Account" title="My account" sub="Your name and phone are what your team sees. Email, password and sign-in security are managed below."
        actions={<Button variant="outline" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-account-sign-out"><LogOut className="mr-1.5 h-4 w-4" />Sign out</Button>} />
      <div className="sg-account-layout grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Panel className="border-t-4 border-t-primary" title="Your team profile">
          {q.isLoading ? <ListSkeleton rows={2} /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (v.name.trim().length < 2) return setErr('Enter your name');
              m.mutate({ name: v.name.trim(), phone: v.phone.trim() });
            }}>
              <Field label="Display name" htmlFor="p-name" error={err}><Input id="p-name" value={v.name} onChange={(e) => { setV({ ...v, name: e.target.value }); setErr(''); }} data-testid="input-profile-name" /></Field>
              <Field label="Phone" htmlFor="p-phone" hint="Optional. Visible to your business only."><Input id="p-phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} data-testid="input-profile-phone" /></Field>
              <Button type="submit" disabled={m.isPending} data-testid="button-save-profile">{m.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save profile</Button>
            </form>
          )}
        </Panel>
        <Panel className="border-t-4 border-t-[#438fca]" title="Access & membership">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Business</dt><dd className="font-semibold">{me.business_name}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Role</dt><dd className="font-semibold">{ROLE_LABEL[me.role]}</dd></div>
            <div><dt className="mb-1 text-muted-foreground">Permissions</dt><dd className="flex flex-wrap gap-1">{me.permissions.map((p) => <span key={p} className="rounded bg-muted px-2 py-0.5 font-mono text-[11px]">{p}</span>)}</dd></div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">Role changes are made by an owner on the Team page.</p>
        </Panel>
      </div>
      <div className="mt-6 overflow-x-auto"><UserProfile routing="hash" /></div>
    </div>
  );
}
