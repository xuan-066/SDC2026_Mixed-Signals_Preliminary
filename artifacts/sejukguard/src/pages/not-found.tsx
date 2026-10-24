import { Link } from 'wouter';
import { PublicCard, PublicFrame } from './public-frame';

export default function NotFound() {
  return (
    <PublicFrame>
      <PublicCard title="We lost this route." sub="That address is outside the SejukGuard workspace.">
        <div className="mb-5 border-l-4 border-[#d99a43] bg-[#f5ead8] p-4 text-sm text-muted-foreground">Your business data is safe. Use one of the routes below to return to operations.</div>
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/dashboard" className="text-primary" data-testid="link-notfound-dashboard">Dashboard</Link>
          <Link href="/" className="text-muted-foreground" data-testid="link-notfound-home">Home</Link>
        </div>
      </PublicCard>
    </PublicFrame>
  );
}
