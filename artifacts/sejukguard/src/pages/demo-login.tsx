import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'wouter';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAccess } from '@/lib/queries';
import { setDemoIdentity } from '@/lib/demo';
import { resolveDemoLogin } from '@/lib/demo-accounts';
import { PublicCard, PublicFrame } from '@/pages/public-frame';

const credentialsSchema = z.object({
  username: z.string().min(1, 'Enter the demo username.'),
  password: z.string().min(1, 'Enter the demo password.'),
});

type Credentials = z.infer<typeof credentialsSchema>;

export default function DemoLoginPage() {
  const access = useAccess();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [loginError, setLoginError] = useState('');
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { username: '', password: '' },
  });

  const handleSubmit = form.handleSubmit(({ username, password }) => {
    setLoginError('');
    if (access.data?.mode !== 'demo') {
      setLoginError('Demo sign-in is unavailable in this environment. Use the real sign-in page instead.');
      return;
    }
    const user = resolveDemoLogin(access.data, username, password);
    if (!user) {
      setLoginError('That demo username or password is not correct.');
      return;
    }
    setDemoIdentity(user.id);
    queryClient.clear();
    navigate('/dashboard');
  });

  return (
    <PublicFrame>
      <PublicCard
        title="Sign in to the demo"
        sub="Sign in to your own demo dashboard and role. Signing in does not reset or edit existing workspace records."
      >
        {(access.data?.public_demo || access.data?.read_only) && (
          <p role="status" className="mb-5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm font-semibold" data-testid="banner-demo-login-view-only">
            {access.data.standalone
              ? 'Standalone HTML demo · Edit sample records in your browser. Changes stay on this browser only, including after refresh. No backend or real account is connected.'
              : access.data.read_only
              ? 'View-only demo · Browse sample accounts. Records cannot be changed.'
              : 'Interactive demo · Try editing sample records. Changes are shared with other visitors and reset when the demo server restarts. No real business data is connected.'}
          </p>
        )}
        <Form {...form}>
          <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-demo-login">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="username" data-testid="input-demo-username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input {...field} type="password" autoComplete="current-password" data-testid="input-demo-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground" data-testid="text-demo-credentials">
              Demo usernames: <strong>rina</strong>, <strong>daniel</strong>, <strong>aina</strong>, <strong>lim</strong>. Use the assigned demo password.
            </p>
            {access.error && (
              <p className="text-sm font-medium text-destructive" role="alert" data-testid="status-demo-access-error">
                Could not check demo access. Try again or use the real sign-in page.
              </p>
            )}
            {loginError && (
              <p className="text-sm font-medium text-destructive" role="alert" data-testid="status-demo-login-error">
                {loginError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={access.isLoading || form.formState.isSubmitting} data-testid="button-submit-demo-login">
              {access.isLoading || form.formState.isSubmitting
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <LockKeyhole className="mr-2 h-4 w-4" />}
              Sign in to demo
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </Form>
        <div className="mt-5 border-t border-border pt-4 text-center">
          {!access.data?.public_demo && !access.data?.read_only && <Link href="/sign-in" className="text-sm font-semibold text-primary underline-offset-4 hover:underline" data-testid="link-real-sign-in">
            Use the real sign-in page
          </Link>}
          <p className="mt-2 text-xs text-muted-foreground">
            Demo login only selects an existing seeded demo user with their own role and workspace; it is not real account authentication.
          </p>
        </div>
      </PublicCard>
    </PublicFrame>
  );
}
