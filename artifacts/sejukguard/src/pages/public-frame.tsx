import type { ReactNode } from 'react';
import { Link } from 'wouter';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export function PublicFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2" data-testid="link-public-home">
          <img src={basePath + '/logo.svg'} alt="" className="h-8 w-8" />
          <span className="font-display text-lg font-extrabold">Sejuk<span className="text-primary">Guard</span></span>
        </Link>
      </header>
      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center">
        <div className={wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}>{children}</div>
      </div>
    </div>
  );
}

export function PublicCard({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rise rounded-2xl border border-card-border bg-card p-6 shadow-[0_20px_50px_-30px_hsl(var(--primary)/0.5)] sm:p-8">
      <div className="thermal-strip mb-5 h-[3px] w-16 rounded-full" />
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {sub && <div className="mt-2 text-sm text-muted-foreground">{sub}</div>}
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
