import { brandLogo } from '@/lib/branding';
import { useState, type FormEvent } from "react";
import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, ShieldCheck, Snowflake } from "lucide-react";
import { Link } from "wouter";

type AuthMode = "signin" | "signup";

export default function AuthDemoPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage("");
    setShowPassword(false);
  };

  const handleDemoAction = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(
      mode === "signin"
        ? "This is a demo. Your sign-in details were not sent and no account was accessed."
        : "This is a demo. No account was created and your details were not sent."
    );
  };

  const isSignUp = mode === "signup";

  return (
    <main
      className="min-h-[100dvh] overflow-hidden bg-[#f8f1e4] text-[#1d3047]"
      data-testid="content-auth-demo"
    >
      <div className="mx-auto flex min-h-[100dvh] max-w-[1440px] flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between py-5 sm:py-7">
          <Link
            href="/"
            aria-label="Glacier Link home"
            data-testid="link-glacier-home"
            className="inline-flex items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#147c76]"
          >
            <img
              src={brandLogo}
              alt="Glacier Link"
              className="h-auto w-40 sm:w-48"
              data-testid="img-glacier-logo"
            />
          </Link>
          <span
            className="hidden items-center gap-2 rounded-full border border-[#d7c7ab] bg-[#fffaf0] px-3.5 py-2 text-xs font-semibold text-[#48566a] sm:inline-flex"
            data-testid="status-demo-only"
          >
            <span className="h-2 w-2 rounded-full bg-[#d59036]" aria-hidden="true" />
            Demo environment
          </span>
        </header>

        <section className="grid flex-1 items-center gap-10 pb-10 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(390px,480px)] lg:gap-16 lg:pb-16">
          <div className="relative hidden min-h-[560px] overflow-hidden rounded-[2rem] bg-[#20394d] p-10 text-[#fff8ec] shadow-[0_25px_70px_-45px_rgba(29,48,71,.7)] lg:flex lg:flex-col lg:justify-between xl:p-14">
            <div
              className="pointer-events-none absolute -right-20 -top-24 h-[28rem] w-[28rem] rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -right-4 -top-8 h-[20rem] w-[20rem] rounded-full border border-white/10"
              aria-hidden="true"
            />
            <div className="relative z-10">
              <p className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#d9b376]">
                <Snowflake size={15} strokeWidth={2.2} aria-hidden="true" />
                Cold-chain accountability
              </p>
              <h1 className="mt-7 max-w-[10ch] font-display text-5xl font-extrabold leading-[1.03] tracking-[-.045em] !text-[#fff8ec] xl:text-6xl">
                Keep the cold.
                <span className="mt-1 block text-[#f2bd75]">Protect the stock.</span>
              </h1>
              <p className="mt-6 max-w-md text-[17px] leading-7 text-[#e2e7e7]">
                A clearer response from first reading to approved repair, built for the people
                running Malaysian kitchens.
              </p>
            </div>

            <div className="relative z-10">
              <div className="mb-5 flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-[#2c736d] text-[#f7f0e3]">
                  <ShieldCheck size={21} aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold text-[#fff8ec]">Every reading has a next step.</p>
                  <p className="mt-0.5 text-sm text-[#c5d2d3]">Calm, clear, accountable.</p>
                </div>
              </div>
              <div className="flex gap-2" aria-hidden="true">
                <span className="h-1.5 w-14 rounded-full bg-[#e3a454]" />
                <span className="h-1.5 w-8 rounded-full bg-[#4a9d91]" />
                <span className="h-1.5 w-3 rounded-full bg-[#879eae]" />
              </div>
            </div>
            <div
              className="pointer-events-none absolute -bottom-36 -left-24 h-80 w-80 rounded-full bg-[#2a6f6c]/35"
              aria-hidden="true"
            />
          </div>

          <div className="mx-auto w-full max-w-[480px]">
            <div className="mb-5 flex items-center justify-between lg:hidden">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#147c76]">
                Cold-chain accountability
              </p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d7c7ab] bg-[#fffaf0] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#5c6874]"
                data-testid="status-demo-only-mobile"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[#d59036]" aria-hidden="true" />
                Demo only
              </span>
            </div>

            <section
              className="rounded-[1.5rem] border border-[#dfd1ba] bg-[#fffaf1] p-6 shadow-[0_22px_60px_-42px_rgba(65,54,37,.5)] sm:p-9"
              aria-labelledby="auth-title"
              data-testid="panel-auth-form"
            >
              <div className="mb-7">
                <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e8f1e9] text-[#147c76]">
                  {isSignUp ? <Snowflake size={21} aria-hidden="true" /> : <LockKeyhole size={20} aria-hidden="true" />}
                </div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#a16832]">
                  Glacier Link workspace
                </p>
                <h2
                  id="auth-title"
                  className="mt-2 font-display text-3xl font-extrabold tracking-[-.035em] text-[#1d3047] sm:text-[2.1rem]"
                  data-testid="heading-auth-mode"
                >
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#66717b]" data-testid="text-auth-description">
                  {isSignUp
                    ? "Set up a workspace for your kitchen team."
                    : "Sign in to keep your kitchen operations on track."}
                </p>
              </div>

              <div className="mb-6 grid grid-cols-2 rounded-xl bg-[#f0e8d9] p-1" role="tablist" aria-label="Choose account action">
                <button
                  type="button"
                  role="tab"
                  aria-selected={!isSignUp}
                  onClick={() => switchMode("signin")}
                  data-testid="tab-sign-in"
                  className={`min-h-10 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147c76] ${
                    !isSignUp ? "bg-[#fffaf1] text-[#1d3047] shadow-sm" : "text-[#66717b] hover:text-[#1d3047]"
                  }`}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isSignUp}
                  onClick={() => switchMode("signup")}
                  data-testid="tab-sign-up"
                  className={`min-h-10 rounded-lg px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147c76] ${
                    isSignUp ? "bg-[#fffaf1] text-[#1d3047] shadow-sm" : "text-[#66717b] hover:text-[#1d3047]"
                  }`}
                >
                  Create account
                </button>
              </div>

              <form onSubmit={handleDemoAction} className="space-y-4" data-testid="form-auth-demo">
                {isSignUp && (
                  <div>
                    <label htmlFor="full-name" className="mb-1.5 block text-sm font-semibold text-[#344559]">
                      Your name
                    </label>
                    <input
                      id="full-name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Aina Rahman"
                      required
                      data-testid="input-full-name"
                      className="h-12 w-full rounded-lg border border-[#d5c8b2] bg-[#fffdf8] px-3.5 text-sm text-[#1d3047] placeholder:text-[#9a9a91] outline-none transition focus:border-[#147c76] focus:ring-2 focus:ring-[#147c76]/15"
                    />
                  </div>
                )}
                {isSignUp && (
                  <div>
                    <label htmlFor="kitchen-name" className="mb-1.5 block text-sm font-semibold text-[#344559]">
                      Kitchen or business
                    </label>
                    <input
                      id="kitchen-name"
                      name="kitchen"
                      type="text"
                      autoComplete="organization"
                      placeholder="e.g. Kedai Makan Seri"
                      required
                      data-testid="input-kitchen-name"
                      className="h-12 w-full rounded-lg border border-[#d5c8b2] bg-[#fffdf8] px-3.5 text-sm text-[#1d3047] placeholder:text-[#9a9a91] outline-none transition focus:border-[#147c76] focus:ring-2 focus:ring-[#147c76]/15"
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="email-address" className="mb-1.5 block text-sm font-semibold text-[#344559]">
                    Work email
                  </label>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@kitchen.com"
                    required
                    data-testid="input-email"
                    className="h-12 w-full rounded-lg border border-[#d5c8b2] bg-[#fffdf8] px-3.5 text-sm text-[#1d3047] placeholder:text-[#9a9a91] outline-none transition focus:border-[#147c76] focus:ring-2 focus:ring-[#147c76]/15"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor="password" className="block text-sm font-semibold text-[#344559]">
                      Password
                    </label>
                    {!isSignUp && (
                      <button
                        type="button"
                        onClick={() => setMessage("Password recovery is not available in this visual demo.")}
                        className="rounded-sm text-xs font-bold text-[#147c76] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147c76]"
                        data-testid="button-forgot-password"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignUp ? "new-password" : "current-password"}
                      placeholder={isSignUp ? "At least 8 characters" : "Enter your password"}
                      minLength={isSignUp ? 8 : undefined}
                      required
                      data-testid="input-password"
                      className="h-12 w-full rounded-lg border border-[#d5c8b2] bg-[#fffdf8] px-3.5 pr-12 text-sm text-[#1d3047] placeholder:text-[#9a9a91] outline-none transition focus:border-[#147c76] focus:ring-2 focus:ring-[#147c76]/15"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((shown) => !shown)}
                      data-testid="button-toggle-password"
                      className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-[#67757b] hover:bg-[#f0e8d9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#147c76]"
                    >
                      {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs leading-5 text-[#66717b]">
                    <input
                      type="checkbox"
                      required
                      data-testid="checkbox-terms"
                      className="mt-1 h-4 w-4 shrink-0 accent-[#147c76]"
                    />
                    <span>
                      I agree to the <span className="font-semibold text-[#147c76]">Terms of Service</span> and{" "}
                      <span className="font-semibold text-[#147c76]">Privacy Policy</span>.
                    </span>
                  </label>
                )}

                {message && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid="status-demo-action"
                    className="rounded-lg border border-[#b9d7c9] bg-[#eaf4eb] px-3.5 py-3 text-sm leading-5 text-[#23584f]"
                  >
                    <span className="inline-flex items-start gap-2">
                      <Check size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                      {message}
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="button-submit-auth-demo"
                  className="group mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#147c76] px-5 text-sm font-bold text-[#fffaf1] shadow-[0_5px_0_#0d625d] transition hover:bg-[#116d68] active:translate-y-0.5 active:shadow-[0_3px_0_#0d625d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#147c76]"
                >
                  {isSignUp ? "Preview demo sign-up" : "Preview demo sign-in"}
                  <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              </form>

              <div className="mt-6 border-t border-[#e5d9c7] pt-5 text-center">
                <p className="text-sm text-[#66717b]">
                  {isSignUp ? "Already have a workspace?" : "New to Glacier Link?"}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode(isSignUp ? "signin" : "signup")}
                    data-testid="button-switch-auth-mode"
                    className="rounded-sm font-bold text-[#147c76] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147c76]"
                  >
                    {isSignUp ? "Sign in" : "Create an account"}
                  </button>
                </p>
              </div>
              <div className="mt-5 text-center">
                <Link
                  href={isSignUp ? "/sign-up" : "/sign-in"}
                  data-testid="link-real-auth"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#147c76] px-4 text-sm font-bold text-[#116d68] transition hover:bg-[#eaf4eb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#147c76]"
                >
                  {isSignUp ? "Open the real sign-up page" : "Open the real sign-in page"}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#66717b]">
                  Demo entries stay here. Use the secure page to access your existing workspace or create an account.
                </p>
              </div>
            </section>

            <p
              className="mt-4 flex items-start justify-center gap-2 px-2 text-center text-xs leading-5 text-[#66717b]"
              data-testid="text-demo-disclaimer"
            >
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#147c76]" aria-hidden="true" />
              Demo only — no credentials are sent, and no account is created.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
