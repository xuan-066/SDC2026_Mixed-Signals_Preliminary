import type { Approval, AssetDetail, Incident, Me, StockItem } from '../lib/types';
import { type Business, type World, fail, id, money, now, record, syncBusiness } from './store';

export type Body = Record<string, unknown>;
export const text = (body: Body, key: string) => String(body[key] ?? '').trim();
export function number(body: Body, key: string, min = 0): number {
  const value = Number(body[key]);
  if (body[key] === '' || body[key] === null || body[key] === undefined || !Number.isFinite(value) || value < min) fail(`Enter a valid ${key.replaceAll('_', ' ')}.`);
  return value;
}
export function requirePermission(user: Me, permission: string) {
  if (!(user.permissions as string[]).includes(permission)) fail('This demo account does not have permission for that action.', 403);
}
export const requireOwner = (user: Me) => { if (user.role !== 'owner') fail('Only an owner can do this.', 403); };
export function assetById(business: Business, assetId: string) {
  return business.assets.find((asset) => asset.id === assetId) ?? fail('Equipment not found in this workspace.', 404);
}
export function incidentById(business: Business, incidentId: string) {
  return business.incidents.find((incident) => incident.id === incidentId) ?? fail('Incident not found in this workspace.', 404);
}
export function canDecide(business: Business, approval: Approval, user: Me) {
  return approval.status === 'PENDING' && (user.role === 'owner' ||
    (user.role === 'supervisor' && approval.required_role !== 'owner' && Number(approval.amount_rm) * 100 <= business.settings.supervisor_limit_sen));
}
export function planIncident(business: Business, incident: Incident) {
  const asset = business.assets.find((a) => a.id === incident.asset?.id);
  if (!asset) return;
  const backup = business.assets.find((a) => a.id !== asset.id && a.type === asset.type && !a.archived && a.status === 'NORMAL' && a.free_l >= asset.stock.reduce((sum, s) => sum + s.volume_l, 0));
  const vendors = business.vendors.filter((v) => !v.archived && v.services.includes(asset.type) && !v.warranty_only)
    .sort((a, b) => a.sla_hours - b.sla_hours || Number(a.callout_rm) - Number(b.callout_rm));
  const warranty = asset.warranty_until && asset.warranty_until >= now().slice(0, 10)
    ? business.vendors.find((v) => v.id === asset.warranty_vendor_id && !v.archived && v.services.includes(asset.type)) : undefined;
  const vendor = warranty ?? vendors[0];
  const amount = warranty ? '0.00' : vendor?.callout_rm ?? null;
  const requiredRole = Number(amount) * 100 > business.settings.supervisor_limit_sen ? 'owner' : 'supervisor';
  incident.decision = {
    backup_unit: backup ? { id: backup.id, name: backup.name, free_l: backup.free_l } : null,
    vendor: vendor ? { id: vendor.id, name: vendor.name, callout_rm: amount, sla_hours: vendor.sla_hours } : null,
    required_role: requiredRole,
    reasons: backup ? ['Compatible backup has enough space for the recorded stock.'] : ['No compatible backup has enough free space.'],
    needs_human: vendor ? null : 'No active vendor matches this equipment. An owner must update vendors.',
  };
  if (vendor) {
    incident.status = 'PENDING_APPROVAL';
    incident.approval = {
      id: id('ap'), status: 'PENDING', required_role: requiredRole, amount_rm: amount, can_decide: false,
      subject_type: 'incident', subject_id: incident.id, action: 'dispatch_vendor',
      summary: `${vendor.name} call-out for ${asset.name} (${incident.severity})`,
      created_at: now(), decided_by: null, decided_at: null, note: null,
    };
  } else {
    incident.status = 'DECLINED';
    incident.approval = null;
  }
}

export function report(world: World, business: Business, user: Me, body: Body, assetId?: string) {
  requirePermission(user, 'submit_reading');
  const reportText = text(body, 'text');
  if (!reportText && !assetId) fail('Describe the issue first.');
  const normalized = reportText.toLowerCase();
  const candidates = business.assets.filter((a) => !a.archived && [a.name, ...a.aliases].some((name) => name && normalized.includes(name.toLowerCase())));
  const asset = assetId ? assetById(business, assetId) : candidates.length === 1 ? candidates[0] :
    /front|depan/.test(normalized) ? business.assets.find((a) => a.id === 'a_ch1') :
    /kitchen|dapur/.test(normalized) ? business.assets.find((a) => a.id === 'a_ch2') : undefined;
  const active = asset && business.incidents.find((i) => i.asset?.id === asset.id && i.status !== 'RESOLVED');
  if (active) {
    record(world, business, user, 'report_added', 'incident', active.id, { text: reportText });
    return { incident: active, parsed: { asset_id: asset.id }, parser_source: 'rules' };
  }
  const severity = asset?.status !== 'NORMAL' && asset ? asset.status : /not cooling|tak sejuk|warm|cair|melt/.test(normalized) ? 'CRITICAL' : 'WARNING';
  const incident: Incident = {
    id: id('inc'), status: asset ? 'PENDING_APPROVAL' : 'NEEDS_INFO', severity,
    trigger: assetId ? 'reading' : 'report', asset: asset ? { id: asset.id, name: asset.name, latest_temp_c: asset.latest_temp_c, range_c: asset.range_c } : null,
    stock_at_risk_rm: asset?.stock_value_rm ?? null, decision: null, approval: null, job: null,
    timeline: [], created_at: now(), resolved_at: null, reporter_id: user.id, report_text: reportText || 'Temperature outside the safe range', symptom: 'Local demo report',
  };
  if (asset) planIncident(business, incident);
  business.incidents.unshift(incident);
  record(world, business, user, 'incident_opened', 'incident', incident.id, { text: incident.report_text });
  syncBusiness(world, business);
  return { incident, parsed: { asset_id: asset?.id ?? null }, parser_source: 'rules' };
}

export function addReading(world: World, business: Business, user: Me, body: Body) {
  requirePermission(user, 'submit_reading');
  const asset = assetById(business, text(body, 'asset_id'));
  if (asset.archived) fail('Restore this equipment before recording readings.');
  const temperature = number(body, 'temp_c', -100);
  if (temperature > 100) fail('Temperature must be between −100°C and 100°C.');
  const reading = { id: id('rd'), asset_id: asset.id, temp_c: temperature, recorded_at: now(), source: 'staff' };
  asset.readings.push(reading);
  asset.latest_temp_c = temperature;
  asset.latest_reading_at = reading.recorded_at;
  asset.reading_state = 'current';
  const outside = temperature < asset.range_c[0] || temperature > asset.range_c[1];
  asset.status = outside ? 'CRITICAL' : 'NORMAL';
  let incident = business.incidents.find((i) => i.asset?.id === asset.id && i.status !== 'RESOLVED') ?? null;
  if (outside && !incident) incident = report(world, business, user, {}, asset.id).incident;
  if (incident && !outside && incident.job?.status === 'DONE') {
    incident.status = 'RESOLVED';
    incident.resolved_at = now();
    record(world, business, user, 'incident_resolved', 'incident', incident.id);
  }
  record(world, business, user, 'reading_recorded', 'asset', asset.id, { temp_c: temperature });
  syncBusiness(world, business);
  return { reading, incident };
}

export function decide(world: World, business: Business, user: Me, approvalId: string, action: string, body: Body) {
  const incident = business.incidents.find((i) => i.approval?.id === approvalId) ?? fail('Approval not found.', 404);
  const approval = incident.approval!;
  if (approval.status !== 'PENDING') fail('This approval was already decided.', 409);
  if (!canDecide(business, approval, user)) fail('This approval is outside your role or approval limit.', 403);
  if (action === 'reject' && !text(body, 'note')) fail('A reason is required when rejecting.');
  approval.status = action === 'approve' ? 'APPROVED' : 'REJECTED';
  approval.note = text(body, 'note') || null;
  approval.decided_by = user.id;
  approval.decided_at = now();
  if (action === 'approve') {
    const vendor = business.vendors.find((v) => v.id === incident.decision?.vendor?.id && !v.archived) ?? fail('The vendor is no longer active. Reassess this incident.', 409);
    const job = { id: id('job'), status: 'REQUESTED' as const, vendor_id: vendor.id, vendor_name: vendor.name, incident_id: incident.id, requested_at: now(), confirmed_at: null, eta: null, done_at: null, chase_count: 0 };
    business.jobs.unshift(job);
    incident.job = job;
    incident.status = 'DISPATCHED';
    business.messages.unshift({ id: id('msg'), to_type: 'vendor', to_id: vendor.id, channel: 'mock', body: `Demo call-out for ${incident.asset?.name}. No real message was sent.`, incident_id: incident.id, created_at: now() });
  } else incident.status = 'DECLINED';
  record(world, business, user, action === 'approve' ? 'approval_approved' : 'approval_rejected', 'incident', incident.id, { note: approval.note });
  return { approval, incident };
}

export function updateJob(world: World, business: Business, user: Me, jobId: string, action: string, body: Body) {
  requirePermission(user, 'manage_jobs');
  const job = business.jobs.find((j) => j.id === jobId) ?? fail('Job not found.', 404);
  if (job.status === 'DONE') fail('This job is already complete.', 409);
  const incident = incidentById(business, job.incident_id);
  if (action === 'confirm') {
    const eta = text(body, 'eta');
    if (eta && !Number.isFinite(Date.parse(eta))) fail('Enter a valid arrival time.');
    job.status = 'CONFIRMED'; job.confirmed_at = now(); job.eta = eta || null;
  } else {
    job.status = 'DONE'; job.done_at = now();
    const asset = assetById(business, incident.asset!.id);
    if (asset.status === 'NORMAL' && asset.reading_state === 'current') {
      incident.status = 'RESOLVED'; incident.resolved_at = now();
    }
  }
  incident.job = job;
  record(world, business, user, action === 'confirm' ? 'job_confirmed' : 'job_completed', 'incident', incident.id);
  return { job, incident };
}

export function stockInput(body: Body, old?: StockItem): StockItem {
  const name = text(body, 'name'), unit = text(body, 'unit');
  if (!name || !unit) fail('A stock name and unit are required.');
  const qty = number(body, 'qty'), cost = number(body, 'unit_cost_sen');
  if (!Number.isInteger(cost)) fail('Stock cost must be a whole number of sen.');
  return { id: old?.id ?? id('stock'), name, unit, qty, unit_cost_rm: money(cost / 100), volume_l: number(body, 'volume_l'), value_rm: money(qty * cost / 100) };
}
export function checkCapacity(asset: AssetDetail, stock: StockItem[]) {
  if (stock.reduce((sum, item) => sum + item.volume_l, 0) > asset.capacity_l + 0.0001) fail('The stock would exceed this equipment’s capacity.', 409);
}

export function transfer(world: World, business: Business, user: Me, body: Body, key?: string) {
  requirePermission(user, 'manage_stock');
  if (key && world.transfers[key]) return world.transfers[key];
  const destination = assetById(business, text(body, 'destination_asset_id'));
  const items = body.items as { stock_item_id: string; qty: number }[];
  if (!Array.isArray(items) || !items.length) fail('Select stock to transfer.');
  if (new Set(items.map((i) => i.stock_item_id)).size !== items.length) fail('Each stock line can only be selected once.');
  const source = business.assets.find((a) => a.stock.some((s) => s.id === items[0].stock_item_id)) ?? fail('Source stock not found.', 404);
  if (source.id === destination.id || source.type !== destination.type || source.archived || destination.archived) fail('Choose a different, active destination of the same type.');
  const incident = body.incident_id ? incidentById(business, String(body.incident_id)) : null;
  if (incident && incident.asset?.id !== source.id) fail('This incident does not belong to the source equipment.');
  let volume = 0;
  for (const line of items) {
    const stock = source.stock.find((s) => s.id === line.stock_item_id);
    if (!stock || !Number.isFinite(line.qty) || line.qty <= 0 || line.qty > stock.qty) fail('Transfer quantity exceeds the available stock.', 409);
    volume += stock.volume_l * line.qty / stock.qty;
  }
  if (volume > destination.free_l + .0001) fail('The destination does not have enough free capacity.', 409);
  for (const line of items) {
    const stock = source.stock.find((s) => s.id === line.stock_item_id)!;
    const movedVolume = stock.volume_l * line.qty / stock.qty;
    const existing = destination.stock.find((s) => s.name === stock.name && s.unit === stock.unit && s.unit_cost_rm === stock.unit_cost_rm);
    if (existing) { existing.qty += line.qty; existing.volume_l += movedVolume; }
    else destination.stock.push({ ...stock, id: id('stock'), qty: line.qty, volume_l: movedVolume });
    stock.qty -= line.qty; stock.volume_l -= movedVolume;
  }
  source.stock = source.stock.filter((s) => s.qty > 0);
  const result = { id: id('transfer'), status: 'recorded' };
  if (key) world.transfers[key] = result;
  record(world, business, user, 'stock_transferred', incident ? 'incident' : 'asset', incident?.id ?? source.id, { destination: destination.name, volume_l: volume });
  return result;
}
