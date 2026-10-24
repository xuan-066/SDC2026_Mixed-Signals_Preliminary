import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Access, ApprovalResult, AssetDetail, Incident, JobResult, Me, Profile, ReportResult, Settings, StockItem, Vendor } from '../lib/types';
import { api } from './client';
import { DATA_KEY } from './store';

const identity = vi.hoisted(() => ({ userId: 'u_rina' as string | null }));
vi.mock('../lib/demo', () => ({ demoUserId: () => identity.userId, setServerMode: vi.fn() }));

function browserStorage() {
  const entries = new Map<string, string>();
  return { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => entries.delete(key), clear: () => entries.clear() };
}
beforeEach(() => {
  identity.userId = 'u_rina';
  vi.stubGlobal('localStorage', browserStorage());
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('The standalone demo must not access a backend.'); }));
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

describe('standalone browser-only demo', () => {
  it('provides demo access without connecting to a server and requires identity for records', async () => {
    identity.userId = null;
    expect(await api<Access>('/access')).toMatchObject({ public_demo: true, standalone: true, mode: 'demo', read_only: false });
    await expect(api('/me')).rejects.toMatchObject({ status: 401 });
  });

  it('persists profile changes and does not share them with a new browser', async () => {
    await api('/profile', 'PUT', { name: 'Rina Local', phone: 'demo phone' });
    expect(await api<Me>('/me')).toMatchObject({ name: 'Rina Local' });
    expect(await api<Profile>('/profile')).toMatchObject({ name: 'Rina Local' });
    expect(localStorage.getItem(DATA_KEY)).toContain('Rina Local');
    vi.stubGlobal('localStorage', browserStorage());
    expect((await api<Me>('/me')).name).not.toBe('Rina Local');
  });

  it('isolates the two sample businesses and enforces worker permissions', async () => {
    const ownerAssets = await api<AssetDetail[]>('/assets');
    identity.userId = 'u_lim';
    expect((await api<AssetDetail[]>('/assets')).map((a) => a.id)).not.toEqual(ownerAssets.map((a) => a.id));
    await expect(api('/assets/' + ownerAssets[0].id)).rejects.toMatchObject({ status: 404 });
    identity.userId = 'u_aina';
    await expect(api('/settings', 'PUT', {})).rejects.toMatchObject({ status: 403 });
    await expect(api('/vendors')).rejects.toMatchObject({ status: 403 });
    expect((await api<AssetDetail[]>('/assets')).every((a) => a.stock_value_rm === null)).toBe(true);
  });

  it('can submit a worker report without redacting the persisted owner records', async () => {
    identity.userId = 'u_aina';
    const result = await api<ReportResult>('/reports', 'POST', { text: 'Kitchen fridge is leaking' });
    expect(result.incident.asset?.id).toBe('a_ch2');
    expect(result.incident.stock_at_risk_rm).toBeNull();
    identity.userId = 'u_rina';
    const incident = await api<Incident>('/incidents/' + result.incident.id);
    expect(incident.stock_at_risk_rm).not.toBeNull();
    expect(incident.approval?.amount_rm).not.toBeNull();
  });

  it('handles ambiguous reports and clarification locally', async () => {
    const result = await api<ReportResult>('/reports', 'POST', { text: 'Something is leaking' });
    expect(result.incident.status).toBe('NEEDS_INFO');
    const updated = await api<Incident>('/incidents/' + result.incident.id + '/clarify', 'POST', { asset_id: 'a_ch2' });
    expect(updated.asset?.id).toBe('a_ch2');
    expect((await api<Incident>('/incidents/' + updated.id)).status).toBe('PENDING_APPROVAL');
  });

  it('enforces approval limits and preserves approve, vendor confirmation and resolution across reads', async () => {
    const incident = (await api<Incident[]>('/incidents'))[0];
    identity.userId = 'u_daniel';
    await expect(api('/approvals/' + incident.approval!.id + '/approve', 'POST', {})).rejects.toMatchObject({ status: 403 });
    identity.userId = 'u_rina';
    const approved = await api<ApprovalResult>('/approvals/' + incident.approval!.id + '/approve', 'POST', {});
    expect(approved.incident?.job?.status).toBe('REQUESTED');
    await expect(api('/approvals/' + incident.approval!.id + '/approve', 'POST', {})).rejects.toMatchObject({ status: 409 });
    const jobId = approved.incident!.job!.id;
    expect((await api<JobResult>('/jobs/' + jobId + '/confirm', 'POST', {})).job.status).toBe('CONFIRMED');
    await api('/readings', 'POST', { asset_id: incident.asset!.id, temp_c: -20 });
    await api('/jobs/' + jobId + '/complete', 'POST', {});
    const resolved = await api<Incident>('/incidents/' + incident.id);
    expect(resolved.status).toBe('RESOLVED');
    expect((await api<AssetDetail>('/assets/' + incident.asset!.id)).active_incident_id).toBeNull();
  });

  it('keeps rejected incidents visible and supports reassessment', async () => {
    const incident = (await api<Incident[]>('/incidents'))[0];
    await api('/approvals/' + incident.approval!.id + '/reject', 'POST', { note: 'Try the backup first' });
    expect((await api<Incident>('/incidents/' + incident.id)).status).toBe('DECLINED');
    expect((await api<Incident>('/incidents/' + incident.id + '/reassess', 'POST', {})).approval?.status).toBe('PENDING');
  });

  it('supports equipment, stock and vendor create, edit, archive and delete', async () => {
    const input = { name: 'Spare freezer', type: 'freezer', aliases: [], min_c: -35, max_c: -15, capacity_l: 50 };
    const asset = await api<AssetDetail>('/assets', 'POST', input);
    await api('/assets/' + asset.id, 'PUT', { ...input, name: 'Spare freezer edited' });
    const stock = await api<StockItem>('/assets/' + asset.id + '/stock', 'POST', { name: 'Ice', qty: 2, unit: 'bags', volume_l: 5, unit_cost_sen: 100 });
    await api('/stock/' + stock.id, 'PUT', { name: 'Ice', qty: 3, unit: 'bags', volume_l: 6, unit_cost_sen: 100 });
    expect((await api<AssetDetail>('/assets/' + asset.id)).stock_value_rm).toBe('3.00');
    await expect(api('/assets/' + asset.id + '/stock', 'POST', { name: 'Overflow', qty: 1, unit: 'box', volume_l: 100, unit_cost_sen: 100 })).rejects.toMatchObject({ status: 409 });
    await api('/stock/' + stock.id, 'DELETE');
    await api('/assets/' + asset.id + '/archive', 'POST', { archived: true });
    expect((await api<AssetDetail[]>('/assets')).some((a) => a.id === asset.id)).toBe(false);
    await api('/assets/' + asset.id, 'DELETE');
    const vendorInput = { name: 'Demo vendor', services: ['freezer'], callout_fee_sen: 5000, sla_hours: 2, phone: 'demo', warranty_only: false };
    const vendor = await api<Vendor>('/vendors', 'POST', vendorInput);
    await api('/vendors/' + vendor.id, 'PUT', { ...vendorInput, name: 'Updated demo vendor' });
    await api('/vendors/' + vendor.id + '/archive', 'POST', { archived: true });
    expect((await api<Vendor[]>('/vendors?include_archived=true')).find((v) => v.id === vendor.id)?.name).toBe('Updated demo vendor');
    await api('/vendors/' + vendor.id, 'DELETE');
  });

  it('transfers stock once per idempotency key and persists source/destination totals', async () => {
    const source = await api<AssetDetail>('/assets/a_fz2');
    const destination = await api<AssetDetail>('/assets/a_fz1');
    const stock = source.stock[0], qty = Math.min(1, stock.qty);
    const body = { incident_id: null, destination_asset_id: destination.id, items: [{ stock_item_id: stock.id, qty }] };
    await api('/transfers', 'POST', body, { 'Idempotency-Key': 'local-test' });
    await api('/transfers', 'POST', body, { 'Idempotency-Key': 'local-test' });
    const updated = await api<AssetDetail>('/assets/' + source.id);
    expect(updated.stock.find((s) => s.id === stock.id)?.qty ?? 0).toBe(stock.qty - qty);
    expect((await api<AssetDetail>('/assets/' + destination.id)).free_l).toBeCloseTo(destination.free_l - stock.volume_l * qty / stock.qty);
  });

  it('persists policy changes and resets only this browser’s records', async () => {
    const settings = await api<Settings>('/settings');
    await api('/settings', 'PUT', { ...settings, name: 'Local-only bakery', supervisor_limit_sen: 10000 });
    expect((await api<Me>('/me')).business_name).toBe('Local-only bakery');
    await api('/sim/reset', 'POST', {});
    expect((await api<Me>('/me')).business_name).toBe(settings.name);
    const asset = await api<AssetDetail>('/assets/a_fz1');
    expect(Math.abs(Date.now() - Date.parse(asset.latest_reading_at!))).toBeLessThan(3_600_000);
  });

  it('does not overwrite malformed saved data', async () => {
    localStorage.setItem(DATA_KEY, 'not valid JSON');
    await expect(api('/access')).rejects.toThrow('saved demo records could not be read');
    expect(localStorage.getItem(DATA_KEY)).toBe('not valid JSON');
  });

  it('reports browser storage failures rather than pretending edits were saved', async () => {
    await api('/access');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
    await expect(api('/profile', 'PUT', { name: 'Not Saved', phone: '' })).rejects.toThrow('could not save');
    expect((await api<Profile>('/profile')).name).not.toBe('Not Saved');
  });
});
