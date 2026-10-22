import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage } from '../api';
import { rmToSen, senToRm, fmtTemp } from '../format';
import { buildSeries } from '../../components/temp-chart';

const reading = (iso: string, t: number) => ({ id: iso, asset_id: 'a', temp_c: t, recorded_at: iso, source: 'staff' });

describe('money', () => {
  it('converts RM to integer sen', () => {
    expect(rmToSen('12.5')).toBe(1250);
    expect(rmToSen('RM 1,850.00')).toBe(185000);
    expect(rmToSen('0.07')).toBe(7);
  });
  it('rejects invalid amounts', () => {
    expect(rmToSen('')).toBeNull();
    expect(rmToSen('-3')).toBeNull();
    expect(rmToSen('1.234')).toBeNull();
    expect(rmToSen('abc')).toBeNull();
  });
  it('formats sen and temps', () => {
    expect(senToRm(30000)).toBe('300.00');
    expect(fmtTemp(null)).toBe('--');
    expect(fmtTemp(-18)).toBe('-18.0\u00b0C');
  });
});

describe('chart gaps', () => {
  it('breaks the line on gaps over 60 minutes and never invents values', () => {
    const { data, gaps } = buildSeries([
      reading('2025-01-01T10:00:00Z', -18), reading('2025-01-01T10:30:00Z', -17), reading('2025-01-01T12:00:00Z', -9),
    ]);
    expect(gaps).toBe(1);
    expect(data.filter((d) => d.temp === null)).toHaveLength(1);
    expect(data.filter((d) => d.temp !== null).map((d) => d.temp)).toEqual([-18, -17, -9]);
  });
  it('keeps exactly-60-minute spacing connected', () => {
    expect(buildSeries([reading('2025-01-01T10:00:00Z', 1), reading('2025-01-01T11:00:00Z', 2)]).gaps).toBe(0);
  });
});

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('parses the error envelope and sends cookies, no auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'conflict', message: 'Stale' } }), { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = await api('/x', 'POST', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('conflict');
    expect(errorMessage(err)).toBe('Conflict: Stale');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/v1/x');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();
  });
  it('passes the idempotency key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"id":"t1","status":"recorded"}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await api('/transfers', 'POST', {}, { 'Idempotency-Key': 'k1' });
    expect(fetchMock.mock.calls[0][1].headers['Idempotency-Key']).toBe('k1');
  });
  it('maps network failures to status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fail')));
    const err = await api('/x').catch((e) => e);
    expect(err.status).toBe(0);
  });
});
