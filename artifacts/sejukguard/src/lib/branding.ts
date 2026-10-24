const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const brandLogo = import.meta.env.VITE_STANDALONE_LOGO || base + '/glacier-link-logo.png';
