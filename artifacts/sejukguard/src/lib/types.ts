export type Role = 'staff' | 'supervisor' | 'owner';
export type Severity = 'NORMAL' | 'WATCH' | 'WARNING' | 'CRITICAL';
export type IncidentStatus = 'NEEDS_INFO' | 'PENDING_APPROVAL' | 'DISPATCHED' | 'DECLINED' | 'RESOLVED';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type JobStatus = 'REQUESTED' | 'CONFIRMED' | 'DONE';
export type Perm =
  | 'submit_reading' | 'view_operations' | 'view_money' | 'view_vendors' | 'view_messages'
  | 'decide_approval' | 'manage_jobs' | 'view_audit' | 'view_metrics';
export type AssetType = 'freezer' | 'chiller';
export type ReadingState = 'missing' | 'stale' | 'current';

export interface Access {
  mode: 'normal' | 'demo';
  authenticated: boolean;
  member: boolean;
  email?: string;
  verified?: boolean;
  inactive?: boolean;
  read_only?: boolean;
  public_demo?: boolean;
  standalone?: boolean;
  demo_users?: { id: string; name: string; role: Role }[];
}

export interface Me {
  id: string;
  name: string;
  role: Role;
  business_id: string;
  business_name: string;
  permissions: Perm[];
}

export interface Reading { id: string; asset_id: string; temp_c: number; recorded_at: string; source: string }

export interface Asset {
  id: string;
  name: string;
  type: AssetType | string;
  range_c: [number, number];
  status: Severity;
  latest_temp_c: number | null;
  latest_reading_at: string | null;
  active_incident_id: string | null;
  capacity_l: number;
  free_l: number;
  archived?: boolean;
  reading_state?: ReadingState;
}

export interface StockItem {
  id: string; name: string; qty: number; unit: string; volume_l: number;
  unit_cost_rm: string | null; value_rm: string | null;
}

export interface AssetDetail extends Asset {
  aliases: string[];
  warranty_until: string | null;
  warranty_vendor_id?: string | null;
  stock: StockItem[];
  stock_value_rm: string | null;
  readings: Reading[];
}

export interface AssetInput {
  name: string; type: AssetType; aliases: string[]; min_c: number; max_c: number; capacity_l: number;
  warranty_until: string | null; warranty_vendor_id: string | null;
}

export interface Vendor {
  id: string; name: string; services: string[]; callout_rm: string | null; sla_hours: number;
  warranty_only: boolean; phone: string; archived?: boolean;
}
export interface VendorInput {
  name: string; services: AssetType[]; callout_fee_sen: number; sla_hours: number; phone: string; warranty_only: boolean;
}

export interface StockInput { name: string; qty: number; unit: string; unit_cost_sen: number; volume_l: number }

export interface Approval {
  id: string; status: ApprovalStatus; required_role: Role; amount_rm: string | null; can_decide: boolean;
  subject_type: string; subject_id: string; action: string; summary: string; created_at: string;
  decided_by: string | null; decided_at: string | null; note: string | null;
}

export interface Job {
  id: string; status: JobStatus; vendor_id: string; vendor_name: string; incident_id: string;
  requested_at: string; confirmed_at: string | null; eta: string | null; done_at: string | null; chase_count: number;
}

export interface Decision {
  backup_unit: { id: string; name: string; free_l: number } | null;
  vendor: { id: string; name: string; callout_rm: string | null; sla_hours: number } | null;
  required_role: Role;
  reasons: string[];
  needs_human: string | null;
}

export interface TimelineEvent { at: string; actor: string; action: string; details: Record<string, unknown> }

export interface Incident {
  id: string; status: IncidentStatus; severity: Severity; trigger: string;
  asset: { id: string; name: string; latest_temp_c: number | null; range_c: [number, number] } | null;
  stock_at_risk_rm: string | null;
  decision: Decision | null; approval: Approval | null; job: Job | null;
  timeline: TimelineEvent[]; created_at: string; resolved_at: string | null;
  reporter_id?: string | null; report_text?: string | null; symptom?: string | null;
}

export interface ReportResult { incident: Incident; parsed: Record<string, unknown>; parser_source: 'rules' | 'llm' | 'rules_fallback' }
export interface ReadingResult { reading: Reading; incident: Incident | null }
export interface ApprovalResult { approval: Approval; incident: Incident | null }
export interface JobResult { job: Job; incident: Incident }

export interface Message { id: string; to_type: string; to_id: string; channel: string; body: string; incident_id: string | null; created_at: string }
export interface AuditEvent { id: number; at: string; actor_id: string; action: string; entity_type: string; entity_id: string; details: Record<string, unknown> }
export interface Metrics {
  incidents_total: number; incidents_resolved: number; median_min_detect_to_dispatch: number | null;
  stock_protected_rm: string | null; automated_actions: number; false_alarms_avoided: number;
}

export interface Settings { id: string; name: string; kind: string; supervisor_limit_sen: number }
export interface Profile { name: string; phone: string | null }
export interface Member { id: string; name: string; role: Role; active: boolean; email: string | null }
export interface Invitation { id: string; email: string; role: Role; status: string; expires_at: string; created_at: string }
export interface InvitationCreated { id: string; email: string; role: Role; status: string; expires_at: string; token: string }
export interface Notification { id: string; body: string; incident_id: string | null; created_at: string; read_at: string | null; delivery: 'in_app' }
