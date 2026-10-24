import type { ReactNode } from 'react';
import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function PublicFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="sg-public-frame flex min-h-[100dvh] flex-col">
      <header className="border-b-2 border-[#d99546] bg-[#f4bd78] px-5 py-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-public-home">
          <img src={basePath + '/glacier-link-logo.png'} alt="Glacier Link" className="h-auto w-44 sm:w-56" />
        </Link>
      </header>
      <div className="flex flex-1 items-start justify-center bg-[radial-gradient(ellipse_at_top,hsl(39_75%_91%),transparent_65%)] px-4 pb-16 pt-8 sm:items-center">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>{children}</div>
      </div>
    </div>
  );
}

export function PublicCard({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sg-public-card rise overflow-hidden rounded-2xl border border-card-border border-t-[5px] border-t-[#d99a43] bg-card p-6 shadow-[0_20px_50px_-30px_hsl(var(--foreground)/0.35)] sm:p-8">
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-primary">Glacier Link · cold-chain workspace</p>
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {sub && <div className="mt-2 text-sm text-muted-foreground">{sub}</div>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
