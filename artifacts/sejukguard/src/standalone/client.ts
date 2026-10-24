import type { Approval, AssetDetail, Incident, Me, Vendor } from '../lib/types';
import { demoUserId, setServerMode } from '../lib/demo';
import { ApiError, copy, fail, freshWorld, id, load, money, now, record, save, syncBusiness, type Business } from './store';
import { addReading, assetById, canDecide, checkCapacity, decide, incidentById, number, planIncident, report, requireOwner, requirePermission, stockInput, text, transfer, updateJob, type Body } from './operations';

export { ApiError };
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The local demo could not complete that action.';
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

function assetView(asset: AssetDetail, user: Me) {
  const value = copy(asset);
  if (user.role === 'staff') {
    value.stock_value_rm = null;
    value.stock.forEach((stock) => { stock.unit_cost_rm = null; stock.value_rm = null; });
  }
  return value;
}
function approvalView(business: Business, approval: Approval, user: Me) {
  return { ...copy(approval), amount_rm: user.role === 'staff' ? null : approval.amount_rm, can_decide: canDecide(business, approval, user) };
}
function incidentView(business: Business, incident: Incident, user: Me): Incident {
  const value = copy(incident);
  if (value.approval) value.approval = approvalView(business, value.approval, user);
  if (user.role === 'staff') {
    value.stock_at_risk_rm = null;
    if (value.decision?.vendor) value.decision.vendor.callout_rm = null;
    if (value.decision) value.decision.reasons = value.decision.reasons.filter((reason) => !/RM\s*\d|sen\b|limit/i.test(reason));
    // Audit payloads may contain amounts; staff get the operational narrative only.
    value.timeline.forEach((event) => { event.details = {}; });
  }
  return value;
}

/** Browser-local simulation of the API. Never calls fetch or the real backend. */
export async function api<T>(path: string, method: Method = 'GET', payload?: unknown, headers?: Record<string, string>): Promise<T> {
  const world = load();
  const route = new URL(path, 'https://local-demo.invalid');
  const segments = route.pathname.split('/').filter(Boolean);
  const [resource, entityId, action] = segments;
  const body = (payload && typeof payload === 'object' ? payload : {}) as Body;
  if (resource === 'access') {
    setServerMode('demo', false);
    return { mode: 'demo', authenticated: false, member: false, public_demo: true, standalone: true, read_only: false, demo_users: world.users.map(({ id, name, role }) => ({ id, name, role })) } as T;
  }
  const user = world.users.find((u) => u.id === demoUserId()) ?? fail('Sign in with a demo username and password.', 401);
  const business = world.businesses[user.business_id] ?? fail('Demo workspace not found.', 404);
  if (!business.team.find((member) => member.id === user.id)?.active) fail('This membership is paused. Switch to an active demo account.', 403);
  syncBusiness(world, business);
  const finish = (value: unknown): T => {
    if (method !== 'GET') { syncBusiness(world, business); save(world); }
    return copy(value) as T;
  };
  const requireMoney = () => requirePermission(user, 'view_money');

  if (method === 'GET') {
    switch (resource) {
      case 'me': return finish(user);
      case 'profile': return finish(world.profiles[user.id]);
      case 'settings': requireOwner(user); return finish(business.settings);
      case 'team': requireOwner(user); return finish(business.team);
      case 'invitations': requireOwner(user); return finish(business.invitations);
      case 'notifications': return finish(world.notifications[user.id] ?? []);
      case 'assets': {
        if (entityId) return finish(assetView(assetById(business, entityId), user));
        return finish(business.assets.filter((asset) => route.searchParams.get('include_archived') === 'true' || !asset.archived).map((asset) => assetView(asset, user)));
      }
      case 'incidents': return finish(entityId ? incidentView(business, incidentById(business, entityId), user) : business.incidents.map((incident) => incidentView(business, incident, user)));
      case 'approvals': requirePermission(user, 'decide_approval'); return finish(business.incidents.flatMap((incident) => incident.approval ? [approvalView(business, incident.approval, user)] : []));
      case 'jobs': {
        requirePermission(user, 'manage_jobs');
        return finish(entityId ? business.jobs.find((job) => job.id === entityId) ?? fail('Job not found.', 404) : business.jobs);
      }
      case 'vendors': {
        requirePermission(user, 'view_vendors');
        return finish(entityId ? business.vendors.find((vendor) => vendor.id === entityId) ?? fail('Vendor not found.', 404) : business.vendors.filter((vendor) => route.searchParams.get('include_archived') === 'true' || !vendor.archived));
      }
      case 'audit': requirePermission(user, 'view_audit'); return finish(business.audit);
      case 'messages': requirePermission(user, 'view_messages'); return finish(business.messages);
      case 'metrics': {
        requirePermission(user, 'view_metrics');
        const dispatched = business.incidents.filter((i) => i.job).map((i) => (Date.parse(i.job!.requested_at) - Date.parse(i.created_at)) / 60000).sort((a, b) => a - b);
        const middle = Math.floor(dispatched.length / 2);
        return finish({
          incidents_total: business.incidents.length,
          incidents_resolved: business.incidents.filter((i) => i.status === 'RESOLVED').length,
          median_min_detect_to_dispatch: dispatched.length ? dispatched.length % 2 ? dispatched[middle] : (dispatched[middle - 1] + dispatched[middle]) / 2 : null,
          stock_protected_rm: money(business.incidents.filter((i) => i.status === 'RESOLVED').reduce((sum, i) => sum + Number(i.stock_at_risk_rm ?? 0), 0)),
          automated_actions: business.audit.filter((event) => event.actor_id === 'system').length,
          false_alarms_avoided: 0,
        });
      }
      default: fail('This page is not available in the standalone demo.', 404);
    }
  }

  if (resource === 'profile' && method === 'PUT') {
    const name = text(body, 'name');
    if (name.length < 2) fail('Enter a name with at least two characters.');
    world.profiles[user.id] = { name, phone: text(body, 'phone') };
    business.team.find((member) => member.id === user.id)!.name = name;
    user.name = name;
    record(world, business, user, 'profile_updated', 'user', user.id);
    return finish(world.profiles[user.id]);
  }
  if (resource === 'settings' && method === 'PUT') {
    requireOwner(user);
    const name = text(body, 'name'), kind = text(body, 'kind');
    const limit = number(body, 'supervisor_limit_sen');
    if (!name || !kind || !Number.isInteger(limit)) fail('Enter a business name, type and a whole-number approval limit in sen.');
    Object.assign(business.settings, { name, kind, supervisor_limit_sen: limit });
    record(world, business, user, 'settings_updated', 'business', user.business_id);
    return finish(business.settings);
  }
  if (resource === 'reports' && method === 'POST') {
    const result = report(world, business, user, body);
    result.incident = incidentView(business, result.incident, user);
    return finish(result);
  }
  if (resource === 'readings' && method === 'POST') {
    const result = addReading(world, business, user, body);
    return finish({ ...result, incident: result.incident ? incidentView(business, result.incident, user) : null });
  }
  if (resource === 'incidents' && method === 'POST') {
    const incident = incidentById(business, entityId);
    if (action === 'clarify') {
      requirePermission(user, 'submit_reading');
      if (incident.status !== 'NEEDS_INFO') fail('This incident already has equipment assigned.', 409);
      const asset = assetById(business, text(body, 'asset_id'));
      if (asset.archived) fail('Choose active equipment.');
      incident.asset = { id: asset.id, name: asset.name, latest_temp_c: asset.latest_temp_c, range_c: asset.range_c };
      incident.stock_at_risk_rm = asset.stock_value_rm;
    } else if (action === 'reassess') {
      requireMoney();
      if (incident.job || incident.approval?.status === 'PENDING' || incident.status === 'RESOLVED') fail('This incident cannot be reassessed in its current state.', 409);
    } else fail('Unknown incident action.', 404);
    planIncident(business, incident);
    record(world, business, user, action === 'clarify' ? 'equipment_confirmed' : 'incident_reassessed', 'incident', incident.id);
    // Persist canonical data before applying staff redaction to the response.
    syncBusiness(world, business); save(world);
    return copy(incidentView(business, incident, user)) as T;
  }
  if (resource === 'approvals' && method === 'POST' && ['approve', 'reject'].includes(action)) return finish(decide(world, business, user, entityId, action, body));
  if (resource === 'jobs' && method === 'POST' && ['confirm', 'complete'].includes(action)) return finish(updateJob(world, business, user, entityId, action, body));
  if (resource === 'transfers' && method === 'POST') return finish(transfer(world, business, user, body, headers?.['Idempotency-Key']));
  if (resource === 'notifications' && action === 'read' && method === 'POST') {
    const notification = world.notifications[user.id]?.find((notice) => notice.id === entityId) ?? fail('Notification not found.', 404);
    notification.read_at ??= now();
    return finish({ id: notification.id, read_at: notification.read_at });
  }

  if (resource === 'assets' && action === 'stock' && method === 'POST') {
    requirePermission(user, 'manage_stock');
    const asset = assetById(business, entityId);
    const stock = stockInput(body); checkCapacity(asset, [...asset.stock, stock]); asset.stock.push(stock);
    record(world, business, user, 'stock_added', 'asset', asset.id);
    return finish(stock);
  }
  if (resource === 'stock') {
    requirePermission(user, 'manage_stock');
    const asset = business.assets.find((a) => a.stock.some((s) => s.id === entityId)) ?? fail('Stock line not found.', 404);
    const index = asset.stock.findIndex((s) => s.id === entityId);
    if (method === 'DELETE') {
      asset.stock.splice(index, 1); record(world, business, user, 'stock_deleted', 'asset', asset.id); return finish({ deleted: true });
    }
    if (method === 'PUT') {
      const updated = stockInput(body, asset.stock[index]);
      checkCapacity(asset, asset.stock.map((s) => s.id === entityId ? updated : s));
      asset.stock[index] = updated; record(world, business, user, 'stock_updated', 'asset', asset.id); return finish(updated);
    }
  }
  if (resource === 'assets' || resource === 'vendors') {
    requireOwner(user);
    const isAsset = resource === 'assets';
    const entities = isAsset ? business.assets : business.vendors;
    const existing = entities.find((entity) => entity.id === entityId);
    if (action === 'archive' && method === 'POST') {
      if (!existing) fail('Record not found.', 404);
      if (typeof body.archived !== 'boolean') fail('Choose archived or active.');
      existing.archived = body.archived;
      record(world, business, user, body.archived ? 'record_archived' : 'record_restored', resource, entityId);
      return finish({ id: entityId, archived: existing.archived });
    }
    if (method === 'DELETE') {
      if (!existing) fail('Record not found.', 404);
      const referenced = isAsset ? business.incidents.some((i) => i.asset?.id === entityId) || (existing as AssetDetail).readings.length > 0 || (existing as AssetDetail).stock.length > 0 :
        business.jobs.some((j) => j.vendor_id === entityId) || business.incidents.some((i) => i.decision?.vendor?.id === entityId) || business.assets.some((a) => a.warranty_vendor_id === entityId);
      if (referenced) fail('This record has stock or history. Archive it instead of deleting it.', 409);
      if (isAsset) business.assets = business.assets.filter((a) => a.id !== entityId);
      else business.vendors = business.vendors.filter((v) => v.id !== entityId);
      record(world, business, user, 'record_deleted', resource, entityId);
      return finish({ deleted: true });
    }
    if (method === 'POST' || method === 'PUT') {
      if (method === 'PUT' && !existing) fail('Record not found.', 404);
      const name = text(body, 'name'); if (!name) fail('A name is required.');
      if (isAsset) {
        const type = text(body, 'type');
        if (!['freezer', 'chiller'].includes(type)) fail('Choose freezer or chiller.');
        const min = number(body, 'min_c', -100), max = number(body, 'max_c', -100), capacity = number(body, 'capacity_l', .01);
        if (min >= max || max > 100) fail('The safe minimum must be below the maximum.');
        if (!Array.isArray(body.aliases)) fail('Equipment aliases must be a list.');
        const old = existing as AssetDetail | undefined;
        const asset: AssetDetail = {
          id: old?.id ?? id('asset'), name, type, range_c: [min, max], capacity_l: capacity, aliases: body.aliases.map(String),
          warranty_until: body.warranty_until ? String(body.warranty_until) : null, warranty_vendor_id: body.warranty_vendor_id ? String(body.warranty_vendor_id) : null,
          stock: old?.stock ?? [], readings: old?.readings ?? [], stock_value_rm: old?.stock_value_rm ?? '0.00',
          latest_temp_c: old?.latest_temp_c ?? null, latest_reading_at: old?.latest_reading_at ?? null,
          status: old?.status ?? 'NORMAL', free_l: old?.free_l ?? capacity, active_incident_id: old?.active_incident_id ?? null,
          archived: old?.archived ?? false, reading_state: old?.reading_state ?? 'missing',
        };
        checkCapacity(asset, asset.stock);
        if (old) Object.assign(old, asset); else business.assets.push(asset);
        record(world, business, user, old ? 'equipment_updated' : 'equipment_created', 'asset', asset.id);
        return finish(old ?? asset);
      }
      const services = body.services;
      if (!Array.isArray(services) || !services.length || services.some((service) => !['freezer', 'chiller'].includes(String(service)))) fail('Select at least one valid vendor service.');
      const fee = number(body, 'callout_fee_sen');
      if (!Number.isInteger(fee)) fail('The fee must be a whole number of sen.');
      const vendor: Vendor = { id: existing?.id ?? id('vendor'), name, services: services.map(String), callout_rm: money(fee / 100), sla_hours: number(body, 'sla_hours', .01), phone: text(body, 'phone'), warranty_only: !!body.warranty_only, archived: existing?.archived ?? false };
      if (existing) Object.assign(existing, vendor); else business.vendors.push(vendor);
      record(world, business, user, existing ? 'vendor_updated' : 'vendor_created', 'vendor', vendor.id);
      return finish(vendor);
    }
  }
  if (resource === 'team') {
    requireOwner(user);
    const member = business.team.find((m) => m.id === entityId) ?? fail('Team member not found.', 404);
    if (action === 'transfer-ownership' && method === 'POST') {
      if (member.id === user.id || !member.active) fail('Select another active team member.');
      member.role = 'owner'; business.team.find((m) => m.id === user.id)!.role = 'supervisor';
      record(world, business, user, 'ownership_transferred', 'user', member.id);
      return finish({ status: 'transferred' });
    }
    if (method === 'PUT') {
      if (member.role === 'owner') fail('Transfer ownership before changing an owner.', 409);
      if (!['staff', 'supervisor'].includes(text(body, 'role')) || typeof body.active !== 'boolean') fail('Choose a valid role and active state.');
      member.role = body.role as 'staff' | 'supervisor'; member.active = body.active;
      record(world, business, user, 'member_updated', 'user', member.id);
      return finish(member);
    }
  }
  if (resource === 'invitations') {
    requireOwner(user);
    const token = id('local_demo');
    if (!entityId && method === 'POST') {
      const email = text(body, 'email'), role = text(body, 'role');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !['staff', 'supervisor'].includes(role)) fail('Enter a valid email and role.');
      const invitation = { id: id('invite'), email, role: role as 'staff' | 'supervisor', status: 'PENDING', created_at: now(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString() };
      business.invitations.unshift(invitation); world.tokens[invitation.id] = token;
      record(world, business, user, 'demo_invitation_created', 'invitation', invitation.id, { delivery: 'local simulation only; no invitation is sent' });
      return finish({ ...invitation, token });
    }
    const invitation = business.invitations.find((i) => i.id === entityId) ?? fail('Invitation not found.', 404);
    if (action === 'revoke') { invitation.status = 'REVOKED'; delete world.tokens[entityId]; return finish({ status: 'revoked' }); }
    if (action === 'reissue') {
      invitation.status = 'PENDING'; invitation.expires_at = new Date(Date.now() + 7 * 86400000).toISOString(); world.tokens[entityId] = token;
      return finish({ ...invitation, token });
    }
  }
  if (resource === 'sim' && method === 'POST') {
    if (entityId === 'reset') { const fresh = freshWorld(); save(fresh); return { status: 'reset', now: now() } as T; }
    if (entityId === 'sensor') {
      const asset = assetById(business, text(body, 'asset_id'));
      const values = body.pattern === 'compressor_fail' ? [asset.range_c[1] - 3, asset.range_c[1] + 2, asset.range_c[1] + 4] : [asset.range_c[1] - 2.5];
      let result;
      for (const temperature of values) result = addReading(world, business, user, { asset_id: asset.id, temp_c: temperature });
      return finish({ now: now(), readings: asset.readings.slice(-values.length), incident: result?.incident ?? null });
    }
  }
  fail('This action is not available in the standalone demo. No record was changed.', 400);
}
