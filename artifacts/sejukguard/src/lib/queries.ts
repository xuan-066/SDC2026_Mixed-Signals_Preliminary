import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, errorMessage } from './api';
import type {
  Access, Approval, ApprovalResult, Asset, AssetDetail, AssetInput, AuditEvent, Incident, Invitation,
  InvitationCreated, Job, JobResult, Me, Member, Message, Metrics, Notification, Profile, ReadingResult,
  ReportResult, Settings, StockInput, StockItem, Vendor, VendorInput,
} from './types';

const POLL = 30_000;
const live = { refetchInterval: POLL, refetchOnWindowFocus: true } as const;

export const qk = {
  access: ['access'] as const,
  me: ['me'] as const,
  assets: (archived: boolean) => ['assets', { archived }] as const,
  asset: (id: string) => ['assets', 'detail', id] as const,
  incidents: ['incidents'] as const,
  incident: (id: string) => ['incidents', id] as const,
  approvals: ['approvals'] as const,
  jobs: ['jobs'] as const,
  job: (id: string) => ['jobs', id] as const,
  vendors: (archived: boolean) => ['vendors', { archived }] as const,
  vendor: (id: string) => ['vendors', 'detail', id] as const,
  notifications: ['notifications'] as const,
  audit: ['audit'] as const,
  metrics: ['metrics'] as const,
  messages: ['messages'] as const,
  settings: ['settings'] as const,
  profile: ['profile'] as const,
  team: ['team'] as const,
  invitations: ['invitations'] as const,
};

export const useAccess = () => useQuery({ queryKey: qk.access, queryFn: () => api<Access>('/access'), staleTime: 15_000, ...live });
export const useMeQuery = (enabled = true) => useQuery({ queryKey: qk.me, queryFn: () => api<Me>('/me'), enabled, staleTime: 30_000, ...live });

export const useAssets = (includeArchived = false) =>
  useQuery({ queryKey: qk.assets(includeArchived), queryFn: () => api<Asset[]>('/assets' + (includeArchived ? '?include_archived=true' : '')), ...live });
export const useAsset = (id: string | undefined) =>
  useQuery({ queryKey: qk.asset(id ?? ''), queryFn: () => api<AssetDetail>('/assets/' + id), enabled: !!id, ...live });
export const useIncidents = () => useQuery({ queryKey: qk.incidents, queryFn: () => api<Incident[]>('/incidents'), ...live });
export const useIncident = (id: string | undefined) =>
  useQuery({ queryKey: qk.incident(id ?? ''), queryFn: () => api<Incident>('/incidents/' + id), enabled: !!id, ...live });
export const useApprovals = (enabled = true) => useQuery({ queryKey: qk.approvals, queryFn: () => api<Approval[]>('/approvals'), enabled, ...live });
export const useJobs = (enabled = true) => useQuery({ queryKey: qk.jobs, queryFn: () => api<Job[]>('/jobs'), enabled, ...live });
export const useJob = (id: string | undefined) => useQuery({ queryKey: qk.job(id ?? ''), queryFn: () => api<Job>('/jobs/' + id), enabled: !!id, ...live });
export const useVendors = (includeArchived = false, enabled = true) =>
  useQuery({ queryKey: qk.vendors(includeArchived), queryFn: () => api<Vendor[]>('/vendors' + (includeArchived ? '?include_archived=true' : '')), enabled, ...live });
export const useVendor = (id: string | null) => useQuery({ queryKey: qk.vendor(id ?? ''), queryFn: () => api<Vendor>('/vendors/' + id), enabled: !!id });
export const useNotifications = () => useQuery({ queryKey: qk.notifications, queryFn: () => api<Notification[]>('/notifications'), ...live });
export const useAudit = (enabled = true) => useQuery({ queryKey: qk.audit, queryFn: () => api<AuditEvent[]>('/audit'), enabled, ...live });
export const useMetrics = (enabled = true) => useQuery({ queryKey: qk.metrics, queryFn: () => api<Metrics>('/metrics'), enabled, ...live });
export const useMessages = (enabled = true) => useQuery({ queryKey: qk.messages, queryFn: () => api<Message[]>('/messages'), enabled, ...live });
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api<Settings>('/settings') });
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: () => api<Profile>('/profile') });
export const useTeam = () => useQuery({ queryKey: qk.team, queryFn: () => api<Member[]>('/team'), ...live });
export const useInvitations = () => useQuery({ queryKey: qk.invitations, queryFn: () => api<Invitation[]>('/invitations'), ...live });

/** Mutation helper: toasts errors, refreshes affected data, optional success message. */
function useApiMutation<TVars, TOut>(fn: (v: TVars) => Promise<TOut>, invalidate: QueryKey[], success?: string | ((o: TOut) => string)) {
  const qc = useQueryClient();
  return useMutation<TOut, ApiError, TVars>({
    mutationFn: fn,
    onSuccess: (out) => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (success) toast.success(typeof success === 'function' ? success(out) : success);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e.status === 409) invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}

const OPS: QueryKey[] = [['assets'], ['incidents'], ['approvals'], ['jobs'], ['notifications'], ['audit'], ['metrics'], ['messages']];

export const usePostReading = () =>
  useApiMutation((v: { asset_id: string; temp_c: number }) => api<ReadingResult>('/readings', 'POST', { ...v, source: 'staff' }), OPS,
    (r) => (r.incident ? 'Reading saved. Incident ' + r.incident.status.toLowerCase().replace('_', ' ') : 'Reading saved'));
export const usePostReport = () => useApiMutation((text: string) => api<ReportResult>('/reports', 'POST', { text }), OPS);
export const useClarify = () =>
  useApiMutation((v: { id: string; asset_id: string }) => api<Incident>('/incidents/' + v.id + '/clarify', 'POST', { asset_id: v.asset_id }), OPS, 'Equipment confirmed');
export const useApprove = () =>
  useApiMutation((v: { id: string; note?: string }) => api<ApprovalResult>('/approvals/' + v.id + '/approve', 'POST', v.note ? { note: v.note } : {}), OPS, 'Approved - vendor request sent');
export const useReject = () =>
  useApiMutation((v: { id: string; note: string }) => api<ApprovalResult>('/approvals/' + v.id + '/reject', 'POST', { note: v.note }), OPS, 'Rejected - incident stays unresolved');
export const useConfirmJob = () =>
  useApiMutation((v: { id: string; eta?: string }) => api<JobResult>('/jobs/' + v.id + '/confirm', 'POST', v.eta ? { eta: v.eta } : {}), OPS, 'Vendor confirmation recorded');
export const useCompleteJob = () =>
  useApiMutation((id: string) => api<JobResult>('/jobs/' + id + '/complete', 'POST', {}), OPS, 'Job marked complete');

export const useCreateAsset = () => useApiMutation((b: AssetInput) => api<AssetDetail>('/assets', 'POST', b), [['assets']], 'Equipment added');
export const useUpdateAsset = () =>
  useApiMutation((v: { id: string; body: AssetInput }) => api<AssetDetail>('/assets/' + v.id, 'PUT', v.body), [['assets'], ['incidents']], 'Equipment updated');
export const useArchiveAsset = () =>
  useApiMutation((v: { id: string; archived: boolean }) => api<{ id: string; archived: boolean }>('/assets/' + v.id + '/archive', 'POST', { archived: v.archived }), [['assets']],
    (o) => (o.archived ? 'Equipment archived' : 'Equipment restored'));
export const useDeleteAsset = () => useApiMutation((id: string) => api<{ deleted: boolean }>('/assets/' + id, 'DELETE'), [['assets']], 'Equipment deleted');

export const useCreateVendor = () => useApiMutation((b: VendorInput) => api<Vendor>('/vendors', 'POST', b), [['vendors']], 'Vendor added');
export const useUpdateVendor = () => useApiMutation((v: { id: string; body: VendorInput }) => api<Vendor>('/vendors/' + v.id, 'PUT', v.body), [['vendors']], 'Vendor updated');
export const useArchiveVendor = () =>
  useApiMutation((v: { id: string; archived: boolean }) => api<Vendor>('/vendors/' + v.id + '/archive', 'POST', { archived: v.archived }), [['vendors']],
    (_o) => 'Vendor availability updated');
export const useDeleteVendor = () => useApiMutation((id: string) => api<{ deleted: boolean }>('/vendors/' + id, 'DELETE'), [['vendors']], 'Vendor deleted');

export const useCreateStock = () =>
  useApiMutation((v: { assetId: string; body: StockInput }) => api<StockItem>('/assets/' + v.assetId + '/stock', 'POST', v.body), [['assets']], 'Stock line added');
export const useUpdateStock = () => useApiMutation((v: { id: string; body: StockInput }) => api<StockItem>('/stock/' + v.id, 'PUT', v.body), [['assets']], 'Stock line updated');
export const useDeleteStock = () => useApiMutation((id: string) => api<{ deleted: boolean }>('/stock/' + id, 'DELETE'), [['assets']], 'Stock line removed');
export const useTransfer = () =>
  useApiMutation((v: { key: string; body: { incident_id: string | null; destination_asset_id: string; items: { stock_item_id: string; qty: number }[] } }) =>
    api<{ id: string; status: 'recorded' }>('/transfers', 'POST', v.body, { 'Idempotency-Key': v.key }), [['assets'], ['incidents']], 'Transfer recorded - stock moved');

export const useMarkRead = () => useApiMutation((id: string) => api<{ id: string; read_at: string }>('/notifications/' + id + '/read', 'POST', {}), [qk.notifications]);

export const useOnboard = () => useApiMutation((b: { name: string; kind: string }) => api<Me>('/onboarding', 'POST', b), [qk.access, qk.me], 'Business created');
export const useUpdateSettings = () =>
  useApiMutation((b: { name: string; kind: string; supervisor_limit_sen: number }) => api<Settings>('/settings', 'PUT', b), [qk.settings, qk.me, qk.approvals], 'Settings saved');
export const useUpdateProfile = () => useApiMutation((b: { name: string; phone: string }) => api<Profile>('/profile', 'PUT', b), [qk.profile, qk.me, qk.team], 'Profile saved');

export const useCreateInvite = () =>
  useApiMutation((b: { email: string; role: 'staff' | 'supervisor' }) => api<InvitationCreated>('/invitations', 'POST', b), [qk.invitations], 'Invitation created');
export const useRevokeInvite = () => useApiMutation((id: string) => api<{ status: string }>('/invitations/' + id + '/revoke', 'POST', {}), [qk.invitations], 'Invitation revoked');
export const useReissueInvite = () => useApiMutation((id: string) => api<InvitationCreated>('/invitations/' + id + '/reissue', 'POST', {}), [qk.invitations], 'New link issued; old link no longer works');
export const useAcceptInvite = () => useApiMutation((token: string) => api<Me>('/invitations/accept', 'POST', { token }), [qk.access, qk.me], 'Welcome to the team');
export const useUpdateMember = () =>
  useApiMutation((v: { id: string; role: 'staff' | 'supervisor'; active: boolean }) => api<Member>('/team/' + v.id, 'PUT', { role: v.role, active: v.active }), [qk.team], 'Member updated');
export const useTransferOwnership = () =>
  useApiMutation((id: string) => api<{ status: string }>('/team/' + id + '/transfer-ownership', 'POST', {}), [qk.team, qk.me, qk.access], 'Ownership transferred. You are now a supervisor.');
export const useReassess = () => useApiMutation((id: string) => api<Incident>('/incidents/' + id + '/reassess', 'POST', {}), OPS, 'Recommendation refreshed');
