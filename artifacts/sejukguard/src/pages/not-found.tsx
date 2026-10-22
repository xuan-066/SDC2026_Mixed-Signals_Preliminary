import { Link } from 'wouter';
import { PublicCard, PublicFrame } from './public-frame';

export default function NotFound() {
  return (
    <PublicFrame>
      <PublicCard title="Page not found" sub="This address does not lead anywhere in SejukGuard.">
        <div className="flex gap-4 text-sm font-semibold">
          <Link href="/dashboard" className="text-primary" data-testid="link-notfound-dashboard">Dashboard</Link>
          <Link href="/" className="text-muted-foreground" data-testid="link-notfound-home">Home</Link>
        </div>
      </PublicCard>
    </PublicFrame>
  );
}
