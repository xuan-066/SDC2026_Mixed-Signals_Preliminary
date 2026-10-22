import { useEffect, useMemo, useState } from 'react';

export function usePaged<T>(items: T[], size = 12, resetKey = '') {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / size));
  useEffect(() => setPage(1), [resetKey]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const slice = useMemo(() => items.slice((page - 1) * size, page * size), [items, page, size]);
  return { page, pages, setPage, slice, total: items.length };
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
