import { describe, expect, it } from 'vitest';
import { resolveDemoLogin } from '../demo-accounts';
import type { Access } from '../types';

const access: Access = {
  mode: 'demo', authenticated: false, member: false,
  demo_users: [
    { id: 'u_rina', name: 'Rina', role: 'owner' },
    { id: 'u_daniel', name: 'Daniel', role: 'supervisor' },
    { id: 'u_aina', name: 'Aina', role: 'staff' },
    { id: 'u_lim', name: 'Lim', role: 'owner' },
  ],
};

describe('demo account login', () => {
  it.each([
    ['rina', '2345', 'u_rina'],
    ['daniel', '3456', 'u_daniel'],
    ['aina', '1234', 'u_aina'],
    ['lim', '0123', 'u_lim'],
  ])('selects only the existing identity for %s', (username, password, id) => {
    expect(resolveDemoLogin(access, username, password)?.id).toBe(id);
  });

  it('normalizes usernames but preserves exact password strings', () => {
    expect(resolveDemoLogin(access, ' RINA ', '2345')?.id).toBe('u_rina');
    expect(resolveDemoLogin(access, 'lim', '123')).toBeUndefined();
    expect(resolveDemoLogin(access, 'rina', '3456')).toBeUndefined();
    expect(resolveDemoLogin(access, 'rina', 'demo')).toBeUndefined();
  });

  it('never authenticates normal environments or invents missing demo users', () => {
    expect(resolveDemoLogin({ ...access, mode: 'normal' }, 'rina', '2345')).toBeUndefined();
    expect(resolveDemoLogin({ ...access, demo_users: [] }, 'rina', '2345')).toBeUndefined();
    expect(resolveDemoLogin(undefined, 'rina', '2345')).toBeUndefined();
  });
});
