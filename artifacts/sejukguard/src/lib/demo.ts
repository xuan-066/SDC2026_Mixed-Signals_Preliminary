const MODE = 'sejukguard-demo-mode';
const USER = 'sejukguard-demo-user';
let serverMode: 'normal' | 'demo' | null = null;
export const setServerMode = (mode: 'normal' | 'demo') => { serverMode = mode; };
export const clearDemoIdentity = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(MODE);
    localStorage.removeItem(USER);
  }
};
export const demoEnabled = () => typeof localStorage !== 'undefined' && localStorage.getItem(MODE) === 'on';
export const demoUserId = () => typeof localStorage !== 'undefined' ? localStorage.getItem(USER) : null;
export const setDemoIdentity = (id: string) => {
  localStorage.setItem(MODE, 'on');
  localStorage.setItem(USER, id);
};
export const demoHeaders = (path: string): Record<string, string> => {
  if (path === '/access' || serverMode !== 'demo' || !demoEnabled()) return {};
  const id = demoUserId();
  return id ? { 'X-User-Id': id } : {};
};
