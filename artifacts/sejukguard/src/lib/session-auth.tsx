import { createContext, useContext, type ReactNode } from 'react';
import { useClerk, useUser } from '@clerk/react';

type SessionAuth = {
  isLoaded: boolean;
  isSignedIn: boolean;
  signOut: (options: { redirectUrl: string }) => Promise<void>;
};

// Public sample-data demos never mount Clerk or connect to real user sessions.
const SessionAuthContext = createContext<SessionAuth>({
  isLoaded: true,
  isSignedIn: false,
  signOut: async () => { throw new Error('Real authentication is not available in the public demo.'); },
});

export function RealSessionProvider({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useUser();
  return (
    <SessionAuthContext.Provider value={{ isLoaded, isSignedIn: !!isSignedIn, signOut }}>
      {children}
    </SessionAuthContext.Provider>
  );
}

export const useSessionAuth = () => useContext(SessionAuthContext);
