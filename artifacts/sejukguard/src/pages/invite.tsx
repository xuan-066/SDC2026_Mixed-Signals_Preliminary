import { Link, Redirect, useLocation, useSearch } from 'wouter';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/common';
import { useAccess, useAcceptInvite } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { PublicCard, PublicFrame } from './public-frame';

export default function Invite() {
  const search = useSearch();
  const token = new URLSearchParams(search).get('token') ?? '';
  const access = useAccess();
  const accept = useAcceptInvite();
  const [, nav] = useLocation();
  const back = encodeURIComponent(window.location.href);

  if (!token) return <PublicFrame><PublicCard title="Invitation link incomplete" sub="This link is missing its token. Ask the owner to copy the full link again, or to reissue the invitation." /></PublicFrame>;
  if (access.isLoading) return <PublicFrame><PublicCard title="Checking your invitation..." /></PublicFrame>;
  if (access.error) return <PublicFrame><ErrorState error={access.error} onRetry={() => access.refetch()} /></PublicFrame>;
  const a = access.data!;
  if (accept.isSuccess) return <Redirect to="/dashboard" />;

  if (!a.authenticated)
    return (
      <PublicFrame>
        <PublicCard title="You have been invited to a SejukGuard team" sub="Sign in or create an account with the email address the invitation was sent to. You will come back here to accept.">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href={'/sign-up?redirect_url=' + back} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-invite-sign-up">Create account</Link>
            <Link href={'/sign-in?redirect_url=' + back} className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold" data-testid="link-invite-sign-in">Sign in</Link>
          </div>
        </PublicCard>
      </PublicFrame>
    );
  if (a.member)
    return (
      <PublicFrame>
        <PublicCard title="You already belong to a business" sub={<>Each account can be a member of one business. {a.email ? <>Sign in with a different email to accept this invitation.</> : null}</>}>
          <Link href="/dashboard" className="text-sm font-semibold text-primary" data-testid="link-invite-dashboard">Go to my dashboard</Link>
        </PublicCard>
      </PublicFrame>
    );
  if (a.verified === false)
    return <PublicFrame><PublicCard title="Verify your email first" sub={<>Verify {a.email} and then reload this page to accept.</>}><Button onClick={() => access.refetch()} data-testid="button-invite-recheck">I have verified</Button></PublicCard></PublicFrame>;

  return (
    <PublicFrame>
        <PublicCard title="Join the team" sub={<>Accept as <b>{a.email}</b>. Your role was chosen by the owner and can be changed by them later.</>}>
          <div className="mb-5 rounded-lg bg-[#e1f0eb] px-4 py-3 text-sm text-[#245c56]"><span className="font-mono text-[10px] font-bold uppercase tracking-[.14em]">Team invitation</span><p className="mt-1">Your access is attached to this business and role.</p></div>
        {accept.error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert" data-testid="text-invite-error">{errorMessage(accept.error)}. The link may have expired, been revoked, or be meant for another email.</p>}
        <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate(token, { onSuccess: () => nav('/dashboard') })} data-testid="button-accept-invite">
          {accept.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Accept invitation
        </Button>
      </PublicCard>
    </PublicFrame>
  );
}
