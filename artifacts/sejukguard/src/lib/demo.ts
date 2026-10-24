const MODE = 'sejukguard-demo-mode';
const USER = 'sejukguard-demo-user';
const SIGNED_OUT = 'sejukguard-demo-signed-out';
let serverMode: 'normal' | 'demo' | null = null;
export const setServerMode = (mode: 'normal' | 'demo') => { serverMode = mode; };
export const clearDemoIdentity = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MODE);
    localStorage.removeItem(USER);
    localStorage.removeItem(SIGNED_OUT);
  }
};
export const demoEnabled = () => typeof localStorage !== 'undefined' && localStorage.getItem(MODE) === 'on';
export const demoUserId = () => typeof localStorage !== 'undefined' ? localStorage.getItem(USER) : null;
export const demoSignedOut = () => typeof localStorage !== 'undefined' && localStorage.getItem(SIGNED_OUT) === 'on';
export const signOutDemoIdentity = () => {
  clearDemoIdentity();
  if (typeof localStorage !== 'undefined') localStorage.setItem(SIGNED_OUT, 'on');
};
export const setDemoIdentity = (id: string) => {
  localStorage.setItem(MODE, 'on');
  localStorage.setItem(USER, id);
  localStorage.removeItem(SIGNED_OUT);
};
export const demoHeaders = (path: string): Record<string, string> => {
  if (path === '/access' || serverMode !== 'demo' || !demoEnabled()) return {};
  const id = demoUserId();
  return id ? { 'X-User-Id': id } : {};
};
