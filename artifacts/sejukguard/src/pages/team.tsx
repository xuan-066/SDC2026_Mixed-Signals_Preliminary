import { useState } from 'react';
import { Copy, Crown, Loader2, MailPlus, RotateCcw, Users, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DeniedState, EmptyState, ErrorState, Field, ListSkeleton, PageHeader, Panel, Pill } from '@/components/common';
import { ConfirmButton } from '@/components/confirm';
import { useCreateInvite, useInvitations, useReissueInvite, useRevokeInvite, useTeam, useTransferOwnership, useUpdateMember } from '@/lib/queries';
import { useMe } from '@/lib/me';
import { ROLE_LABEL, ago, fmtDT } from '@/lib/format';
import type { InvitationCreated } from '@/lib/types';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
export const inviteLink = (token: string) => window.location.origin + basePath + '/invite?token=' + encodeURIComponent(token);

function LinkDialog({ created, onClose }: { created: InvitationCreated | null; onClose: () => void }) {
  const link = created ? inviteLink(created.token) : '';
  return (
    <Dialog open={!!created} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send this link to {created?.email}</DialogTitle>
          <DialogDescription>Copy it now. For security it is shown only once; if lost, reissue the invitation. Expires {fmtDT(created?.expires_at)}.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.target.select()} data-testid="input-invite-link" />
          <Button onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'), () => toast.error('Copy failed; select and copy manually'))} data-testid="button-copy-invite"><Copy className="mr-1.5 h-4 w-4" />Copy</Button>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} data-testid="button-close-invite-link">Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Team() {
  const { me, isOwner } = useMe();
  const team = useTeam();
  const invites = useInvitations();
  const update = useUpdateMember();
  const transfer = useTransferOwnership();
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const reissue = useReissueInvite();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'staff' | 'supervisor'>('staff');
  const [err, setErr] = useState('');
  const [created, setCreated] = useState<InvitationCreated | null>(null);
  const [memberChange, setMemberChange] = useState<{ id: string; name: string; role: 'staff' | 'supervisor'; active: boolean } | null>(null);
  if (!isOwner) return <DeniedState />;

  const sendInvite = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErr('Enter a valid email');
    create.mutate({ email: email.trim(), role }, { onSuccess: (c) => { setInviteOpen(false); setEmail(''); setCreated(c); } });
  };

  return (
    <div className="sg-page sg-team-page">
      <PageHeader eyebrow="Team" title="People and responsibility" sub="Roles decide who reports, who approves and who sees money. Each account belongs to one business."
        actions={<Button onClick={() => { setErr(''); setInviteOpen(true); }} data-testid="button-invite"><MailPlus className="mr-1.5 h-4 w-4" />Invite</Button>} />
      <div className="sg-team-grid grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
      <Panel className="border-t-4 border-t-[#438fca]" title="People with access" pad={false}>
        {team.isLoading ? <div className="p-4"><ListSkeleton rows={3} /></div> : team.error ? <div className="p-4"><ErrorState error={team.error} onRetry={() => team.refetch()} /></div> :
          !team.data?.length ? <div className="p-4"><EmptyState icon={Users} title="Just you so far" /></div> : (
            <ul className="divide-y divide-border">
              {team.data.map((u) => {
                const self = u.id === me.id;
                const owner = u.role === 'owner';
                return (
                  <li key={u.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid={'row-member-' + u.id}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent font-display font-bold text-primary">{u.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{u.name}{self && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email ?? 'No email on record'}</p>
                      </div>
                      {!u.active && <Pill className="border-border text-muted-foreground">Inactive</Pill>}
                    </div>
                    {owner ? <Pill className="border-primary/30 text-primary"><Crown className="h-3 w-3" />Owner</Pill> : (
                      <div className="flex flex-wrap items-center gap-3">
                        <Select value={u.role} disabled={update.isPending} onValueChange={(r) => setMemberChange({ id: u.id, name: u.name, role: r as 'staff' | 'supervisor', active: u.active })}>
                          <SelectTrigger className="w-36" aria-label={'Role for ' + u.name} data-testid={'select-role-' + u.id}><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem></SelectContent>
                        </Select>
                        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                          <Switch checked={u.active} disabled={update.isPending} onCheckedChange={(a) => setMemberChange({ id: u.id, name: u.name, role: u.role as 'staff' | 'supervisor', active: a })} data-testid={'switch-active-' + u.id} />Active
                        </label>
                        {u.active && <ConfirmButton testid={'button-transfer-ownership-' + u.id} trigger={<><Crown className="mr-1 h-3.5 w-3.5" />Make owner</>} title={'Make ' + u.name + ' the owner?'}
                          body={<><p>{u.name} becomes owner with full access to money, team, settings and audit.</p><p className="font-semibold text-foreground">You will immediately become a supervisor and lose access to team, settings and equipment management. Only the new owner can undo this.</p></>}
                          confirmLabel="Transfer ownership" destructive onConfirm={() => transfer.mutateAsync(u.id)} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>

      <Panel className="border-t-4 border-t-[#d99a43]" title="Pending invitations" pad={false}>
        {invites.isLoading ? <div className="p-4"><ListSkeleton rows={2} /></div> : invites.error ? <div className="p-4"><ErrorState error={invites.error} onRetry={() => invites.refetch()} /></div> :
          !invites.data?.length ? <p className="p-4 text-sm text-muted-foreground">No invitations sent.</p> : (
            <ul className="divide-y divide-border">
              {[...invites.data].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).map((i) => {
                const expired = new Date(i.expires_at) < new Date();
                const pending = i.status === 'pending' && !expired;
                return (
                  <li key={i.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center" data-testid={'row-invite-' + i.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{i.email}</p>
                      <p className="text-xs text-muted-foreground">{ROLE_LABEL[i.role]} - sent {ago(i.created_at)} - {expired && i.status === 'pending' ? 'expired ' + ago(i.expires_at) : 'expires ' + fmtDT(i.expires_at)}</p>
                    </div>
                    <Pill className={pending ? 'border-amber/40 text-amber' : 'border-border text-muted-foreground'}>{expired && i.status === 'pending' ? 'expired' : i.status}</Pill>
                    {i.status !== 'accepted' && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={reissue.isPending} onClick={() => reissue.mutate(i.id, { onSuccess: (c) => setCreated(c) })} data-testid={'button-reissue-' + i.id}>
                          {reissue.isPending && reissue.variables === i.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}Reissue
                        </Button>
                        {i.status === 'pending' && <ConfirmButton testid={'button-revoke-' + i.id} trigger={<><XCircle className="mr-1 h-3.5 w-3.5" />Revoke</>} title="Revoke invitation?" body={'The link sent to ' + i.email + ' will stop working.'} confirmLabel="Revoke" destructive onConfirm={() => revoke.mutateAsync(i.id)} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </Panel>
      </div>

      <Dialog open={inviteOpen} onOpenChange={(o) => !create.isPending && setInviteOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Invite a team member</DialogTitle><DialogDescription>They must sign in with this exact email and verify it to join.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); sendInvite(); }}>
            <Field label="Email" htmlFor="inv-email" error={err}><Input id="inv-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErr(''); }} data-testid="input-invite-email" /></Field>
            <Field label="Role" hint="Supervisors approve within the limit in Settings and see money. Staff report and read temperatures.">
              <Select value={role} onValueChange={(r) => setRole(r as 'staff' | 'supervisor')}>
                <SelectTrigger data-testid="select-invite-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="supervisor">Supervisor</SelectItem></SelectContent>
              </Select>
            </Field>
            <DialogFooter><Button type="submit" disabled={create.isPending} data-testid="button-send-invite">{create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Create link</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <LinkDialog created={created} onClose={() => setCreated(null)} />
      <Dialog open={!!memberChange} onOpenChange={(o) => !o && !update.isPending && setMemberChange(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change {memberChange?.name}'s access?</DialogTitle>
            <DialogDescription>{!memberChange?.active ? 'Deactivation blocks their next business request, even if they remain signed in.' : memberChange.role === 'supervisor' ? 'This gives access to stock management, money, repair jobs and approvals within your business limit.' : 'Staff can report faults and record temperatures. They cannot view financial values or manage stock, jobs or approvals.'}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button variant="ghost" disabled={update.isPending} onClick={() => setMemberChange(null)}>Cancel</Button>
            <Button data-testid="button-confirm-member-change" disabled={update.isPending} onClick={() => memberChange && update.mutate({ id: memberChange.id, role: memberChange.role, active: memberChange.active }, { onSuccess: () => setMemberChange(null) })}>Confirm change</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
