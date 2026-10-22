# Web application contract

All calls are same-origin `/v1/...`, credentials included. Normal mode authenticates
Clerk's `__session` cookie on the Python server. No browser identity header.
Errors: `{error:{code,message}}`. Mutations reject stale/conflicting operations.
All JSON bodies use the exact names below. Financial inputs are integer sen;
existing output money strings are RM and null means restricted, never zero.

## Existing API
Read `artifacts/api-server/python/app/schemas.py` and `api/v1/views.py` for exact
responses and existing route modules for request contracts. Preserve these.
GET `/me`, `/assets`, `/assets/:id`, `/incidents`, `/incidents/:id`,
`/approvals`, `/vendors`, `/audit`, `/metrics`, `/messages`.
POST `/readings` {asset_id,temp_c,source:"staff"}, `/reports` {text},
`/incidents/:id/clarify` {asset_id},
`/approvals/:id/approve` {note?}, `/approvals/:id/reject` {note},
`/jobs/:id/confirm` {eta?:ISO datetime}, `/jobs/:id/complete` {}.
Permissions from `/me` determine navigation/actions. All roles can view equipment,
incidents, report and read temperature; supervisors can view vendors, decide within
their limit, manage jobs, stock and transfers. Only owners manage equipment/vendors,
settings/team and view audit/metrics. Approval actions require can_decide true.

## Accounts and settings
GET `/access` -> {mode:"normal"|"demo", authenticated:bool, member:bool,
  email?:string, verified?:bool, inactive?:bool, demo_users?:[{id,name,role}]}
Normal mode unauthenticated returns authenticated:false, not an error.
`/me` returns existing shape (id,name,role,business_id,business_name,permissions).
No membership -> 403 with message "Business onboarding required".
POST `/onboarding` {name,kind} -> `/me` shape; authenticated verified recipient only.
One membership per Clerk account. This creates an EMPTY business, never demo data.
GET `/settings` -> {id,name,kind,supervisor_limit_sen}
PUT `/settings` {name,kind,supervisor_limit_sen} -> same (owner).
PUT `/profile` {name,phone} -> {name,phone}; GET `/profile` -> same.
Personal email/password/security use Clerk's UserProfile; membership is separate.

## Team (owner only)
GET `/team` -> [{id,name,role,active,email}] (email may be null for demo).
GET `/invitations` -> [{id,email,role,status,expires_at,created_at}]
POST `/invitations` {email,role:"staff"|"supervisor"} ->
  {id,email,role,status,expires_at,token}. Build link /invite?token=... .
Copy the raw token only from create/reissue response, it is not listed afterwards.
POST `/invitations/:id/revoke` {} -> {status:"revoked"}
POST `/invitations/:id/reissue` {} -> same create response with new token.
POST `/invitations/accept` {token} -> `/me` shape; must be signed in and verified.
PUT `/team/:id` {role:"staff"|"supervisor",active:bool} -> {id,name,role,active,email}.
POST `/team/:id/transfer-ownership` {} -> {status:"transferred"}; demotes caller to
supervisor and makes active target owner atomically. Confirm access changes first.
No direct owner demotion; last active owner protected.

## Equipment/vendor maintenance (owner)
POST `/assets`, PUT `/assets/:id` body
  {name,type:"freezer"|"chiller",aliases:string[],min_c,max_c,capacity_l,
   warranty_until:"YYYY-MM-DD"|null,warranty_vendor_id:string|null}
-> asset detail, with `archived` and `warranty_vendor_id` additionally available.
POST `/assets/:id/archive` {archived:bool} -> {id,archived}.
DELETE `/assets/:id` -> {deleted:true}; historical references prevent deletion.
GET `/assets?include_archived=true` includes archived; default excludes archived.
Asset list/detail additionally include `archived`, `reading_state`:
  "missing"|"stale"|"current". Stale means >60 minutes; show reading age.
POST `/vendors`, PUT `/vendors/:id` body
  {name,services:("freezer"|"chiller")[],callout_fee_sen,sla_hours,phone,warranty_only}
-> vendor response, additionally archived; POST `/vendors/:id/archive`
{archived:bool}; DELETE `/vendors/:id` safe deletion or conflict.
GET `/vendors?include_archived=true`; detail GET `/vendors/:id`.

## Stock (supervisor/owner)
POST `/assets/:id/stock` {name,qty,unit,unit_cost_sen,volume_l} -> stock response.
PUT `/stock/:id` same fields -> stock response; DELETE `/stock/:id` -> {deleted:true}.
volume_l is TOTAL occupied volume of that stock line, not per unit.
POST `/transfers`
  {incident_id:string|null, destination_asset_id:string,
   items:[{stock_item_id:string,qty:number}]} -> {id,status:"recorded"}.
Transfers validate same source unit, destination, quantity, free capacity and
compatible type, and move proportional volume with actual quantities. Incident
must belong to source if supplied. Do not claim a recommendation moved stock.

## Jobs and notifications
GET `/jobs` -> existing JobOut[]; GET `/jobs/:id` -> JobOut.
GET `/notifications` -> [{id,body,incident_id,created_at,read_at,delivery:"in_app"}].
POST `/notifications/:id/read` {} -> {id,read_at}; recipient only.
Mock external `/messages` remains explicitly labelled mock, never delivered.

## UI behavior
Use Clerk SignIn/SignUp/UserProfile and signOut; recovery is the SignIn provider
flow. Auth paths /sign-in/*?, /sign-up/*?. Handle missing configuration explicitly.
Routes: /dashboard, /equipment, /equipment/:id, /incidents, /incidents/:id,
/report, /approvals, /jobs, /jobs/:id, /vendors, /notifications, /activity,
/team, /settings, /account, /onboarding, /invite, /sign-in, /sign-up, not-found.
Root opens a public welcome/login page, not a synthetic business.
Show no-vendor/no-backup and rejected/unresolved states honestly.
Support loading, errors/retry, offline, access-denied, missing and empty states.
Mutations pending prevent duplicate clicks; refresh affected data on success.
Poll operational lists every 30 seconds, refresh on focus. Search/filter and
client pagination are acceptable for this release's bounded small-business data.
Charts must only use actual readings and explicitly break gaps >60 minutes.
