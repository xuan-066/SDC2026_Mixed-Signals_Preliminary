import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api';
import { setServerMode } from '../demo';

afterEach(() => {
  setServerMode('normal');
  vi.unstubAllGlobals();
});

describe('public view-only API client', () => {
  it.each(['POST', 'PUT', 'DELETE'] as const)('blocks %s before sending any write', async (method) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setServerMode('demo', true);
    await expect(api('/profile', method, {})).rejects.toMatchObject({
      status: 403, code: 'DEMO_READ_ONLY',
    } satisfies Partial<ApiError>);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('still permits browsing and does not block normal-mode writes', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    setServerMode('demo', true);
    await api('/access');
    setServerMode('normal', true);
    await api('/profile', 'PUT', {});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('learns read-only mode from the access response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ mode: 'demo', read_only: true }))));
    await api('/access');
    await expect(api('/sim/reset', 'POST', {})).rejects.toMatchObject({ code: 'DEMO_READ_ONLY' });
  });
});
