import { Link, Redirect } from 'wouter';
import { ArrowRight, ClipboardCheck, MoveRight, Snowflake, Thermometer, Users } from 'lucide-react';
import { useAccess } from '@/lib/queries';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Landing() {
  const access = useAccess();
  const a = access.data;
  if (a?.mode === 'demo' || (a?.authenticated && a.member && !a.inactive)) return <Redirect to="/dashboard" />;
  return (
    <div className="sg-landing min-h-[100dvh] bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img src={basePath + '/logo.svg'} alt="" className="h-9 w-9" />
          <span className="font-display text-xl font-extrabold text-sidebar-accent-foreground">Sejuk<span className="text-sidebar-primary">Guard</span></span>
        </div>
        <nav className="flex items-center gap-2">
          {a?.authenticated ? (
            <Link href={a.member ? '/dashboard' : '/onboarding'} className="rounded-lg bg-sidebar-primary px-4 py-2 text-sm font-bold text-sidebar-primary-foreground" data-testid="link-continue">Continue</Link>
          ) : (
            <>
              <Link href="/sign-in" className="rounded-lg px-3 py-2 text-sm font-semibold hover:text-sidebar-primary" data-testid="link-sign-in">Sign in</Link>
              <Link href="/sign-up" className="rounded-lg bg-sidebar-primary px-4 py-2 text-sm font-bold text-sidebar-primary-foreground" data-testid="link-sign-up">Start free</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 lg:grid-cols-[1.2fr_1fr] lg:pt-20">
        <div className="rise">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-sidebar-primary">Cold-chain response for Malaysian kitchens</p>
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] text-sidebar-accent-foreground sm:text-7xl">
            Freezer tak sejuk?<br /><span className="text-[hsl(var(--thaw))]">Act in minutes,</span><br />not after the ice melts.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-sidebar-foreground/80">
            SejukGuard turns a staff message or a warm reading into one clear plan: where to move the stock, which technician to call, and who has to approve the cost.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-xl bg-sidebar-primary px-6 py-3.5 font-bold text-sidebar-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="link-hero-sign-up">
              Set up your kitchen <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-xl border border-sidebar-border px-6 py-3.5 font-semibold hover:border-sidebar-primary" data-testid="link-hero-sign-in">
              I already have an account
            </Link>
          </div>
        </div>

        <div className="rise relative rounded-2xl border border-sidebar-border bg-sidebar-accent/30 p-5" style={{ animationDelay: '120ms' }} aria-hidden>
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-sidebar-foreground/60"><span>Freezer 2 - dapur belakang</span><span className="text-[hsl(var(--thaw))]">Critical</span></div>
          <p className="mt-3 font-mono text-6xl font-bold text-sidebar-accent-foreground">-9.5<span className="text-3xl">°C</span></p>
          <p className="text-sm text-sidebar-foreground/60">Safe band -22 to -15. Rising for 50 minutes.</p>
          <div className="thermal-strip mt-5 h-1.5 rounded-full" />
          <ol className="mt-6 space-y-3 text-sm">
            {[
              [MoveRight, 'Move stock to Freezer 1', 'fits: 61 L free'],
              [Thermometer, 'Call technician', 'nearest SLA, quoted fee'],
              [ClipboardCheck, 'Supervisor approves', 'within the limit you set'],
            ].map(([I, t, s], i) => {
              const Icon = I as typeof MoveRight;
              return (
                <li key={i} className="flex items-center gap-3 rounded-lg bg-sidebar/70 p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-sidebar-primary/15 text-sidebar-primary"><Icon className="h-4 w-4" /></span>
                  <span className="flex-1"><span className="block font-semibold text-sidebar-accent-foreground">{t as string}</span><span className="text-xs text-sidebar-foreground/60">{s as string}</span></span>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-[11px] text-sidebar-foreground/50">Illustration. Your dashboard shows only your own equipment and readings.</p>
        </div>
      </section>

      <section className="border-t border-sidebar-border bg-background text-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-3">
          {[
            [Snowflake, 'Every unit, one glance', 'Readings older than an hour are flagged stale. Missing readings say so plainly instead of pretending everything is fine.'],
            [Users, 'Clear responsibility', 'Staff report in their own words. Supervisors approve within the limit you set. Owners see the money and the audit trail.'],
            [ClipboardCheck, 'Honest outcomes', 'Rejected call-outs stay unresolved. No backup space or no vendor is shown as exactly that.'],
          ].map(([I, t, b], i) => {
            const Icon = I as typeof Snowflake;
            return (
              <div key={i} className={i === 1 ? 'md:translate-y-6' : ''}>
                <Icon className="h-6 w-6 text-primary" />
                <h2 className="mt-3 text-xl font-extrabold">{t as string}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{b as string}</p>
              </div>
            );
          })}
        </div>
        <footer className="mx-auto max-w-6xl px-5 pb-10 pt-6 text-xs text-muted-foreground">SejukGuard. Built for kopitiams, bakeries, caterers and cloud kitchens.</footer>
      </section>
    </div>
  );
}
