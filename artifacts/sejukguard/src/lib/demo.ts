export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export const DEMO_USERS = [
  { id: 'u_aina', name: 'Aina', role: 'Staff' },
  { id: 'u_daniel', name: 'Daniel', role: 'Supervisor' },
  { id: 'u_rina', name: 'Rina', role: 'Owner' },
] as const;

const USER_KEY = 'sejukguard-demo-user';
const DEFAULT_USER = DEMO_USERS[0].id;

export function getDemoUserId(): string {
  if (typeof window === 'undefined') return DEFAULT_USER;
  const saved = window.localStorage.getItem(USER_KEY);
  return DEMO_USERS.some((user) => user.id === saved) ? saved! : DEFAULT_USER;
}

export function setDemoUserId(userId: string): void {
  if (DEMO_USERS.some((user) => user.id === userId)) {
    window.localStorage.setItem(USER_KEY, userId);
  }
}

export function demoHeaders(): Record<string, string> {
  return DEMO_MODE ? { 'X-User-Id': getDemoUserId() } : {};
}

