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
import { PublicCard, PublicFrame } from '@/pages/public-frame';

const demoUsername = 'rina';
const demoPassword = 'demo';
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
    defaultValues: { username: demoUsername, password: '' },
  });
  const rina = access.data?.demo_users?.find(
    (user) => user.name.trim().toLowerCase() === 'rina' && user.role === 'owner',
  );

  const handleSubmit = form.handleSubmit(({ username, password }) => {
    setLoginError('');
    if (access.data?.mode !== 'demo') {
      setLoginError('Demo sign-in is unavailable in this environment. Use the real sign-in page instead.');
      return;
    }
    if (username.trim().toLowerCase() !== demoUsername || password !== demoPassword) {
      setLoginError('That demo username or password is not correct.');
      return;
    }
    if (!rina) {
      setLoginError('Rina’s demo account is not available in this workspace.');
      return;
    }
    setDemoIdentity(rina.id);
    queryClient.clear();
    navigate('/dashboard');
  });

  return (
    <PublicFrame>
      <PublicCard
        title="Sign in to the Rina demo"
        sub="Use the sample login to enter the existing Glacier Link demo workspace. Signing in does not reset or edit its records."
      >
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
              Public demo credentials: <strong>rina</strong> / <strong>demo</strong>
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
              Sign in as Rina
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </Form>
        <div className="mt-5 border-t border-border pt-4 text-center">
          <Link href="/sign-in" className="text-sm font-semibold text-primary underline-offset-4 hover:underline" data-testid="link-real-sign-in">
            Use the real sign-in page
          </Link>
          <p className="mt-2 text-xs text-muted-foreground">
            Demo login is public and only selects the existing seeded Rina demo identity; it is not a real account.
          </p>
        </div>
      </PublicCard>
    </PublicFrame>
  );
}
