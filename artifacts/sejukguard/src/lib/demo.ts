const prefix = import.meta.env.VITE_STANDALONE_DEMO === 'true' ? 'glacier-link-html' : 'sejukguard-demo';
const MODE = prefix + '-mode';
const USER = prefix + '-user';
const SIGNED_OUT = prefix + '-signed-out';
let serverMode: 'normal' | 'demo' | null = null;
let viewOnly = false;
export const isViewOnlyDemo = () => viewOnly;
export const setServerMode = (mode: 'normal' | 'demo', readOnly = false) => {
  serverMode = mode;
  viewOnly = mode === 'demo' && readOnly;
};
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
