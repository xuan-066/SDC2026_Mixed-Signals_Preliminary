import type { Access } from './types';

// Public demo-only credentials. Never used to authenticate a real account.
const demoAccounts = [
  { username: 'rina', password: '2345', userId: 'u_rina' },
  { username: 'daniel', password: '3456', userId: 'u_daniel' },
  { username: 'aina', password: '1234', userId: 'u_aina' },
  { username: 'lim', password: '0123', userId: 'u_lim' },
] as const;

export function resolveDemoLogin(access: Access | undefined, username: string, password: string) {
  if (access?.mode !== 'demo') return undefined;
  const account = demoAccounts.find(
    (entry) => entry.username === username.trim().toLowerCase() && entry.password === password,
  );
  return account ? access.demo_users?.find((user) => user.id === account.userId) : undefined;
}
