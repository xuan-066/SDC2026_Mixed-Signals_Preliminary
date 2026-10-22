import { createContext, useContext, type ReactNode } from 'react';
import { ROLE_RANK } from './format';
import type { Me, Perm, Role } from './types';

const Ctx = createContext<Me | null>(null);
export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <Ctx.Provider value={me}>{children}</Ctx.Provider>;
}
export function useMe() {
  const me = useContext(Ctx);
  if (!me) throw new Error('useMe outside MeProvider');
  const can = (p: Perm) => me.permissions.includes(p);
  const atLeast = (r: Role) => ROLE_RANK[me.role] >= ROLE_RANK[r];
  return { me, can, atLeast, isOwner: me.role === 'owner', isSupervisor: atLeast('supervisor') };
}
