import sample from './seed.json';
import type { AssetDetail, AuditEvent, Incident, Invitation, Job, Me, Member, Message, Notification, Profile, Settings, Vendor } from '../lib/types';

export interface Business {
  settings: Settings;
  assets: AssetDetail[];
  incidents: Incident[];
  vendors: Vendor[];
  jobs: Job[];
  audit: AuditEvent[];
  messages: Message[];
  team: Member[];
  invitations: Invitation[];
}
export interface World {
  version: number;
  seed_time: string;
  users: Me[];
  profiles: Record<string, Profile>;
  notifications: Record<string, Notification[]>;
  businesses: Record<string, Business>;
  tokens: Record<string, string>;
  transfers: Record<string, { id: string; status: string }>;
}

export const DATA_KEY = 'glacier-link-standalone-records-v1';
export const copy = <T>(value: T): T => structuredClone(value);
export const id = (prefix: string) => prefix + '_' + Math.random().toString(36).slice(2, 10);
export const now = () => new Date().toISOString();
export const money = (value: number) => value.toFixed(2);

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(message: string, status = 400): never {
  throw new ApiError(status, status === 403 ? 'FORBIDDEN' : 'DEMO_ERROR', message);
}

export function freshWorld(): World {
  // Keep relative event ages realistic whenever a visitor starts or resets the file.
  const original = sample as unknown as World;
  const offset = Date.now() - new Date(original.seed_time).getTime();
  const shift = (value: unknown): unknown => {
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) {
      const time = Date.parse(value);
      return Number.isFinite(time) ? new Date(time + offset).toISOString() : value;
    }
    if (Array.isArray(value)) return value.map(shift);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v)]));
    return value;
  };
  return shift(copy(original)) as World;
}

export function save(world: World) {
  try { localStorage.setItem(DATA_KEY, JSON.stringify(world)); }
  catch { fail('Your browser could not save this demo. Allow local storage or free some browser storage, then try again.'); }
}
export function load(): World {
  let stored: string | null;
  try { stored = localStorage.getItem(DATA_KEY); }
  catch { fail('Browser storage is unavailable. Open this HTML file in a browser that allows local storage.'); }
  if (!stored) { const world = freshWorld(); save(world); return world; }
  try {
    const world = JSON.parse(stored) as World;
    if (world.version !== 1 || !Array.isArray(world.users) || !world.businesses) throw new Error();
    return world;
  } catch {
    fail('The saved demo records could not be read. Clear this file’s site data in your browser to start again. Existing data has not been overwritten.');
  }
}

export function permissions(world: World, role: string) {
  return (sample as unknown as World).users.find((user) => user.role === role)?.permissions ?? [];
}
export function syncBusiness(world: World, business: Business) {
  for (const member of business.team) {
    const user = world.users.find((u) => u.id === member.id);
    if (user) {
      user.name = member.name;
      user.role = member.role;
      user.business_name = business.settings.name;
      user.permissions = permissions(world, member.role);
    }
  }
  for (const asset of business.assets) {
    asset.free_l = Math.max(0, asset.capacity_l - asset.stock.reduce((sum, s) => sum + s.volume_l, 0));
    asset.stock_value_rm = money(asset.stock.reduce((sum, s) => sum + Number(s.unit_cost_rm ?? 0) * s.qty, 0));
    for (const stock of asset.stock) stock.value_rm = money(Number(stock.unit_cost_rm ?? 0) * stock.qty);
    const active = business.incidents.find((i) => i.asset?.id === asset.id && i.status !== 'RESOLVED');
    asset.active_incident_id = active?.id ?? null;
    if (asset.latest_temp_c === null) asset.reading_state = 'missing';
    else asset.reading_state = Date.now() - Date.parse(asset.latest_reading_at ?? '') > 3_600_000 ? 'stale' : 'current';
  }
  for (const incident of business.incidents) {
    const asset = business.assets.find((a) => a.id === incident.asset?.id);
    if (asset) {
      incident.asset = { id: asset.id, name: asset.name, latest_temp_c: asset.latest_temp_c, range_c: asset.range_c };
      if (incident.status !== 'RESOLVED') incident.stock_at_risk_rm = asset.stock_value_rm;
    }
    if (incident.job) incident.job = business.jobs.find((j) => j.id === incident.job?.id) ?? incident.job;
  }
}
export function record(world: World, business: Business, user: Me, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  const at = now();
  business.audit.unshift({ id: Math.max(0, ...business.audit.map((event) => event.id)) + 1, at, actor_id: user.id, action, entity_type: entityType, entity_id: entityId, details });
  const incident = business.incidents.find((i) => i.id === entityId);
  incident?.timeline.push({ at, actor: user.name, action, details });
  if (incident) {
    for (const member of business.team.filter((m) => m.active)) {
      (world.notifications[member.id] ??= []).unshift({ id: id('notice'), body: `${user.name}: ${action.replaceAll('_', ' ')} — ${incident.asset?.name ?? 'incident'}`, incident_id: incident.id, created_at: at, read_at: null, delivery: 'in_app' });
    }
  }
}
