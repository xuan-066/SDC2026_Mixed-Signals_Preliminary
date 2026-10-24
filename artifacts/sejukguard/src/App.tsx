import { useEffect, useRef, useState, type ComponentType } from 'react';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';
import { useAccess, useMeQuery } from '@/lib/queries';
import { demoUserId, setDemoIdentity } from '@/lib/demo';
import { MeProvider } from '@/lib/me';
import { AppShell } from '@/components/shell';
import { ErrorState, ListSkeleton } from '@/components/common';
import { PublicCard, PublicFrame } from '@/pages/public-frame';
import Landing from '@/pages/landing';
import Onboarding from '@/pages/onboarding';
import Invite from '@/pages/invite';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import Equipment from '@/pages/equipment';
import EquipmentDetail from '@/pages/equipment-detail';
import Incidents from '@/pages/incidents';
import IncidentDetail from '@/pages/incident-detail';
import Report from '@/pages/report';
import Approvals from '@/pages/approvals';
import { JobDetail, Jobs } from '@/pages/jobs';
import Vendors from '@/pages/vendors';
import Notifications from '@/pages/notifications';
import ActivityPage from '@/pages/activity';
import Team from '@/pages/team';
import SettingsPage from '@/pages/settings';
import Account from '@/pages/account';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

// REQUIRED — copy verbatim.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev, auto-set in prod.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/glacier-link-logo.png`,
  },
  variables: {
    colorPrimary: 'hsl(191 84% 25%)',
    colorForeground: 'hsl(208 48% 13%)',
    colorMutedForeground: 'hsl(205 16% 38%)',
    colorDanger: 'hsl(5 76% 47%)',
    colorBackground: 'hsl(195 45% 98.5%)',
    colorInput: 'hsl(195 45% 99%)',
    colorInputForeground: 'hsl(208 48% 13%)',
    colorNeutral: 'hsl(208 30% 30%)',
    fontFamily: "'Instrument Sans', sans-serif",
    borderRadius: '0.625rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-card rounded-2xl w-[440px] max-w-full overflow-hidden border border-card-border shadow-[0_20px_50px_-30px_hsl(var(--primary)/0.5)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-display text-2xl font-extrabold text-foreground',
    headerSubtitle: 'text-muted-foreground',
    socialButtonsBlockButtonText: 'text-foreground font-semibold',
    formFieldLabel: 'text-foreground font-semibold',
    footerActionLink: 'text-primary font-semibold',
    footerActionText: 'text-muted-foreground',
    dividerText: 'text-muted-foreground',
    identityPreviewEditButton: 'text-primary',
    formFieldSuccessText: 'text-ok',
    alertText: 'text-foreground',
    logoBox: 'justify-center',
    logoImage: 'h-auto w-44 sm:w-56',
    socialButtonsBlockButton: 'border border-border bg-card',
    formButtonPrimary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    formFieldInput: 'border border-input bg-card text-foreground',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-border',
    alert: 'border border-border bg-muted',
    otpCodeFieldInput: 'border border-input',
    formFieldRow: '',
    main: '',
  },
};

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="sg-auth-frame min-h-[100dvh] bg-background">
      <header className="border-b-2 border-[#d99546] bg-[#f4bd78] px-5 py-4"><a href={basePath || '/'} className="mx-auto flex max-w-6xl items-center gap-2.5">
        <img src={`${window.location.origin}${basePath}/glacier-link-logo.png`} alt="Glacier Link" className="h-auto w-44 sm:w-56" />
      </a></header>
      <div className="mx-auto grid min-h-[calc(100dvh-65px)] max-w-6xl items-center gap-8 px-4 py-8 lg:grid-cols-[1fr_440px] lg:px-8">
        <section className="hidden max-w-xl lg:block"><p className="font-mono text-xs font-bold uppercase tracking-[.18em] text-primary">Cold-chain accountability</p><h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.02] text-[#1d3047]">Keep the cold.<br /><span className="text-primary">Protect the stock.</span></h1><p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">A clearer response from first reading to approved repair, built for the people running Malaysian kitchens.</p><div className="mt-8 flex gap-2"><span className="h-2 w-14 rounded-full bg-[#e3a454]" /><span className="h-2 w-8 rounded-full bg-primary" /><span className="h-2 w-3 rounded-full bg-frost" /></div></section>
        <div className="space-y-4">{children}
          <p className="text-center text-xs text-muted-foreground">Forgot your password? Use "Forgot password" on the sign-in form to recover your account.</p>
        </div>
      </div>
    </div>
  );
}
function SignInPage() {
  return <AuthFrame>{new URLSearchParams(window.location.search).has('session_expired') && <p role="alert">Your session expired. Please sign in again to continue.</p>}<SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/dashboard`} /></AuthFrame>;
}
function SignUpPage() {
  return <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/onboarding`} /></AuthFrame>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener, signOut } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);
  const endingSession = useRef(false);
  const [, nav] = useLocation();
  useEffect(() => {
    const expired = () => {
      if (window.location.pathname.includes('/sign-in') || endingSession.current) return;
      endingSession.current = true;
      const back = encodeURIComponent(window.location.href);
      qc.clear();
      const target = '/sign-in?session_expired=1&redirect_url=' + back;
      // A still-present provider client session otherwise redirects straight
      // back into the rejected API session, creating a login loop.
      void signOut({ redirectUrl: basePath + target }).catch(() => nav(target));
    };
    window.addEventListener('sejukguard-session-expired', expired);
    return () => window.removeEventListener('sejukguard-session-expired', expired);
  }, [qc, nav, signOut]);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) qc.clear();
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);
  return null;
}

function FullLoading() {
  return <div className="mx-auto max-w-4xl p-8"><ListSkeleton rows={5} /></div>;
}

function SessionProblem({ title, body }: { title: string; body: string }) {
  const { signOut } = useClerk();
  return (
    <PublicFrame>
      <PublicCard title={title} sub={body}>
        <div className="flex gap-3">
          <a href={`${basePath}/sign-in`} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="link-session-sign-in">Sign in again</a>
          <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="text-sm text-muted-foreground underline" data-testid="button-session-sign-out">Sign out</button>
        </div>
      </PublicCard>
    </PublicFrame>
  );
}

/** Gate for business routes: authenticated -> member -> active -> /me loaded. */
function Protected({ component: Page }: { component: ComponentType }) {
  const access = useAccess();
  const a = access.data;
  const demo = a?.mode === 'demo';
  const [demoReady, setDemoReady] = useState(false);
  useEffect(() => {
    if (demo) {
      if (!demoUserId()) {
        const owner = a?.demo_users?.find((u) => u.role === 'owner') ?? a?.demo_users?.[0];
        if (owner) setDemoIdentity(owner.id);
      }
      setDemoReady(true);
    }
  }, [demo, a]);
  const ready = !!a && (demo ? !!demoUserId() : a.authenticated && a.member && !a.inactive);
  const me = useMeQuery(ready);
  if (access.isLoading) return <FullLoading />;
  if (access.error) return <PublicFrame wide><ErrorState error={access.error} onRetry={() => access.refetch()} /></PublicFrame>;
  if (demo && (!demoReady || !demoUserId())) return <FullLoading />;
  if (!demo && !a!.authenticated) return <Redirect to="/sign-in" />;
  if (demo && me.isLoading) return <FullLoading />;
  if (demo && me.error) return <PublicFrame wide><ErrorState error={me.error} onRetry={() => me.refetch()} /></PublicFrame>;
  if (!demo && a!.inactive) return <SessionProblem title="Your access is paused" body="An owner has deactivated your membership. Ask them to reactivate you on the Team page." />;
  if (!demo && !a!.member) return <Redirect to="/onboarding" />;
  if (me.isLoading) return <FullLoading />;
  if (me.error) {
    const e = me.error;
    if (e instanceof ApiError && e.status === 401) return <SessionProblem title="Your session expired" body="Sign in again to continue. Nothing you saved was lost." />;
    if (e instanceof ApiError && e.status === 403 && /onboarding/i.test(e.message)) return <Redirect to="/onboarding" />;
    return <PublicFrame wide><ErrorState error={e} onRetry={() => me.refetch()} /></PublicFrame>;
  }
  return (
    <MeProvider me={me.data!}>
      <AppShell><Page /></AppShell>
    </MeProvider>
  );
}

const p = (C: ComponentType) => () => <Protected component={C} />;
const R = {
  Dashboard: p(Dashboard), Equipment: p(Equipment), EquipmentDetail: p(EquipmentDetail), Incidents: p(Incidents),
  IncidentDetail: p(IncidentDetail), Report: p(Report), Approvals: p(Approvals), Jobs: p(Jobs), JobDetail: p(JobDetail),
  Vendors: p(Vendors), Notifications: p(Notifications), Activity: p(ActivityPage), Team: p(Team), Settings: p(SettingsPage), Account: p(Account),
};

function Routes() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/invite" component={Invite} />
      <Route path="/dashboard" component={R.Dashboard} />
      <Route path="/equipment" component={R.Equipment} />
      <Route path="/equipment/:id" component={R.EquipmentDetail} />
      <Route path="/incidents" component={R.Incidents} />
      <Route path="/incidents/:id" component={R.IncidentDetail} />
      <Route path="/report" component={R.Report} />
      <Route path="/approvals" component={R.Approvals} />
      <Route path="/jobs" component={R.Jobs} />
      <Route path="/jobs/:id" component={R.JobDetail} />
      <Route path="/vendors" component={R.Vendors} />
      <Route path="/notifications" component={R.Notifications} />
      <Route path="/activity" component={R.Activity} />
      <Route path="/team" component={R.Team} />
      <Route path="/settings" component={R.Settings} />
      <Route path="/account" component={R.Account} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your kitchen on Glacier Link' } },
        signUp: { start: { title: 'Create your account', subtitle: 'Then set up your business or accept an invite' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Routes />
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function MissingConfig() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-thaw/40 bg-card p-6" role="alert" data-testid="state-missing-config">
        <h1 className="text-2xl font-extrabold">Sign-in is not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">Glacier Link could not find its authentication key for this host. An administrator needs to set the Clerk publishable key; no business data is shown until then.</p>
      </div>
    </div>
  );
}

function App() {
  if (!clerkPubKey) return <MissingConfig />;
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
