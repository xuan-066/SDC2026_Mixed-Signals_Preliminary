import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';
import type { IncidentStatus, JobStatus, Role, Severity } from './types';

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = parseISO(iso);
  return isValid(d) ? d : null;
}
export function fmtTemp(t: number | null | undefined): string {
  if (t === null || t === undefined || Number.isNaN(t)) return '--';
  return (t > 0 ? '+' : '') + t.toFixed(1) + '\u00b0C';
}
export function ago(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? formatDistanceToNowStrict(d, { addSuffix: true }) : 'never';
}
export function fmtDT(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '--';
}
export function fmtTime(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'HH:mm') : '--';
}
export function fmtDate(iso: string | null | undefined): string {
  const d = toDate(iso);
  return d ? format(d, 'd MMM yyyy') : '--';
}
/** "12.50" -> 1250 integer sen; null when not a valid non-negative amount. */
export function rmToSen(v: string): number | null {
  const s = v.trim().replace(/^RM\s*/i, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
export function senToRm(n: number): string {
  return (n / 100).toFixed(2);
}
export function fmtRm(v: string): string {
  const n = Number(v);
  return 'RM ' + (Number.isFinite(n) ? n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v);
}

export const SEVERITY: Record<Severity, { label: string; cls: string; dot: string; rank: number }> = {
  NORMAL: { label: 'Normal', cls: 'bg-ok/10 text-ok border-ok/25', dot: 'bg-ok', rank: 0 },
  WATCH: { label: 'Watch', cls: 'bg-watch/12 text-watch border-watch/30', dot: 'bg-watch', rank: 1 },
  WARNING: { label: 'Warning', cls: 'bg-amber/12 text-amber border-amber/35', dot: 'bg-amber', rank: 2 },
  CRITICAL: { label: 'Critical', cls: 'bg-thaw/12 text-thaw border-thaw/35', dot: 'bg-thaw', rank: 3 },
};
export const INCIDENT_STATUS: Record<IncidentStatus, { label: string; cls: string }> = {
  NEEDS_INFO: { label: 'Needs info', cls: 'bg-watch/12 text-watch border-watch/30' },
  PENDING_APPROVAL: { label: 'Awaiting approval', cls: 'bg-amber/12 text-amber border-amber/35' },
  DISPATCHED: { label: 'Vendor dispatched', cls: 'bg-primary/10 text-primary border-primary/25' },
  DECLINED: { label: 'Declined - unresolved', cls: 'bg-thaw/10 text-thaw border-thaw/30' },
  RESOLVED: { label: 'Resolved', cls: 'bg-ok/10 text-ok border-ok/25' },
};
export const JOB_STATUS: Record<JobStatus, { label: string; cls: string }> = {
  REQUESTED: { label: 'Requested', cls: 'bg-amber/12 text-amber border-amber/35' },
  CONFIRMED: { label: 'Confirmed', cls: 'bg-primary/10 text-primary border-primary/25' },
  DONE: { label: 'Done', cls: 'bg-ok/10 text-ok border-ok/25' },
};
export const ROLE_LABEL: Record<Role, string> = { staff: 'Staff', supervisor: 'Supervisor', owner: 'Owner' };
export const ROLE_RANK: Record<Role, number> = { staff: 0, supervisor: 1, owner: 2 };
export function humanize(s: string): string {
  return s.replace(/[_.]+/g, ' ').replace(/\b\w/, (c) => c.toUpperCase());
}
export const isOpenIncident = (s: IncidentStatus) => s !== 'RESOLVED';
