import { test, expect, type Browser, type Page, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Real development-provider sessions; no auth bypass or identity headers.
// Run ONLY with an explicitly configured isolated test SQLite database.
test('authenticated owner, supervisor, staff and two-business cold-chain journey', async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  if (process.env.E2E_ALLOW_WRITE !== 'true' || !process.env.CLERK_SECRET_KEY) {
    throw new Error('Requires E2E_ALLOW_WRITE=true, Clerk development setup and an isolated test database. See docs/operations.md.');
  }
  const users: string[] = [];
  const contexts: BrowserContext[] = [];
  const run = randomUUID().slice(0, 8);
  const provider = async (path: string, body?: unknown, method = 'POST') => {
    const response = await fetch('https://api.clerk.com/v1/' + path, {
      method, headers: { Authorization: 'Bearer ' + process.env.CLERK_SECRET_KEY, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Never print provider responses: they may contain sign-in tickets.
    if (!response.ok) throw new Error(`Development identity fixture failed (${response.status})`);
    return response.status === 204 ? {} : await response.json();
  };
  async function identity(name: string, viewport = { width: 1440, height: 1000 }) {
    const email = `sejukguard-${run}-${name.toLowerCase()}+clerk_test@example.com`;
    const user = await provider('users', { email_address: [email], first_name: name, skip_password_requirement: true });
    users.push(user.id);
    const ticket = await provider('sign_in_tokens', { user_id: user.id, expires_in_seconds: 600 });
    const context = await browser.newContext({ baseURL, viewport });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).Clerk?.loaded);
    await page.evaluate(async (token) => {
      const clerk = (window as any).Clerk;
      const result = await clerk.client.signIn.create({ strategy: 'ticket', ticket: token });
      await clerk.setActive({ session: result.createdSessionId });
    }, ticket.token);
    const verified = await page.evaluate(async () => {
      const response = await fetch('/v1/access', { credentials: 'include' });
      const body = await response.json();
      return { status: response.status, error: body.error?.message };
    });
    if (verified.status !== 200) throw new Error(`Session verification failed: ${verified.status} ${verified.error}`);
    await page.goto('/onboarding');
    await expect(page.getByTestId('input-business-name')).toBeVisible();
    return { page, context, email, subject: user.id };
  }
  const get = (page: Page, path: string) => page.evaluate(async (p) => {
    const response = await fetch('/v1' + p, { credentials: 'include' });
    return { status: response.status, body: await response.json() };
  }, path);
  const post = (page: Page, path: string, body: unknown = {}, method = 'POST') => page.evaluate(async ({ p, b, m }) => {
    const response = await fetch('/v1' + p, { method: m, credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { status: response.status, body: await response.json() };
  }, { p: path, b: body, m: method });
  const onboard = async (page: Page, name: string) => {
    await page.getByTestId('input-business-name').fill(name);
    await page.getByTestId('input-business-kind').fill('Bakery');
    await page.getByTestId('button-create-business').click();
    await expect(page).toHaveURL(/\/(dashboard|equipment)$/);
    await page.goto('/equipment');
    await expect(page.getByTestId('button-add-equipment')).toBeVisible();
  };
  async function equipment(page: Page, name: string) {
    await page.goto('/equipment');
    await page.getByTestId('button-add-equipment').click();
    await page.getByTestId('input-asset-name').fill(name);
    await page.getByTestId('select-asset-type').click();
    await page.getByRole('option', { name: 'Freezer', exact: true }).click();
    await page.getByTestId('input-asset-capacity').fill('200');
    await page.getByTestId('input-asset-min').fill('-24');
    await page.getByTestId('input-asset-max').fill('-15');
    await page.getByTestId('input-asset-aliases').fill(name.toLowerCase());
    await page.getByTestId('button-save-asset').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const data = await get(page, '/assets');
    const asset = data.body.find((a: any) => a.name === name);
    expect(asset).toBeTruthy();
    return asset;
  }
  async function invite(owner: Page, recipient: { page: Page; email: string }, role: 'staff' | 'supervisor') {
    await owner.goto('/team');
    await owner.getByTestId('button-invite').click();
    await owner.getByTestId('input-invite-email').fill(recipient.email);
    await owner.getByTestId('select-invite-role').click();
    await owner.getByRole('option', { name: role === 'staff' ? 'Staff' : 'Supervisor', exact: true }).click();
    await owner.getByTestId('button-send-invite').click();
    const link = await owner.getByTestId('input-invite-link').inputValue();
    expect(link).toContain('/invite?token=');
    await owner.getByTestId('button-close-invite-link').click();
    await recipient.page.goto(link);
    await recipient.page.getByTestId('button-accept-invite').click();
    await expect(recipient.page).toHaveURL(/\/dashboard$/);
    await expect(recipient.page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  try {
    const owner = await identity('Owner');
    await onboard(owner.page, 'Browser Kitchen ' + run);
    expect((await get(owner.page, '/assets')).body).toEqual([]);
    const source = await equipment(owner.page, 'Freezer Alpha');
    const backup = await equipment(owner.page, 'Freezer Backup');
    const disposable = await equipment(owner.page, 'Disposable Freezer');
    await owner.page.goto('/equipment/' + disposable.id);
    await owner.page.getByTestId('button-edit-equipment').click();
    await owner.page.getByTestId('input-asset-capacity').fill('250');
    await owner.page.getByTestId('button-save-asset').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    expect((await get(owner.page, '/assets/' + disposable.id)).body.capacity_l).toBe(250);
    await owner.page.getByTestId('button-archive-equipment').click();
    await owner.page.getByTestId('button-archive-equipment-confirm').click();
    await expect(owner.page.getByRole('alertdialog')).toHaveCount(0);
    expect((await get(owner.page, '/assets')).body.some((a: any) => a.id === disposable.id)).toBe(false);
    await owner.page.getByTestId('button-archive-equipment').click();
    await owner.page.getByTestId('button-archive-equipment-confirm').click();
    await expect(owner.page.getByRole('alertdialog')).toHaveCount(0);
    await owner.page.getByTestId('button-delete-equipment').click();
    await owner.page.getByTestId('button-delete-equipment-confirm').click();
    await expect(owner.page).toHaveURL(/\/equipment$/);
    await owner.page.goto('/equipment/' + source.id);
    await expect(owner.page.getByText('No readings yet', { exact: false }).first()).toBeVisible();
    await owner.page.getByTestId('button-add-stock').click();
    await owner.page.getByTestId('input-stock-name').fill('Frozen chicken');
    await owner.page.getByTestId('input-stock-qty').fill('10');
    await owner.page.getByTestId('input-stock-unit').fill('kg');
    await owner.page.getByTestId('input-stock-cost').fill('15.00');
    await owner.page.getByTestId('input-stock-volume').fill('50');
    await owner.page.getByTestId('button-save-stock').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    await expect(owner.page.getByText('Frozen chicken', { exact: true })).toBeVisible();
    await owner.page.reload();
    await expect(owner.page.getByText('Frozen chicken', { exact: true })).toBeVisible();
    await owner.page.goto('/vendors');
    await owner.page.getByTestId('button-add-vendor').click();
    await owner.page.getByTestId('input-vendor-name').fill('Actual Repair Partner');
    await owner.page.getByTestId('input-vendor-phone').fill('0123456789');
    await owner.page.getByTestId('input-vendor-callout').fill('120.00');
    await owner.page.getByTestId('input-vendor-sla').fill('2');
    // The default service selection includes freezer.
    await owner.page.getByTestId('button-save-vendor').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    const staff = await identity('Staff', { width: 390, height: 844 });
    const supervisor = await identity('Supervisor', { width: 820, height: 1180 });
    await invite(owner.page, staff, 'staff');
    await invite(owner.page, supervisor, 'supervisor');
    const foreign = await identity('OtherOwner');
    await onboard(foreign.page, 'Isolated Kitchen ' + run);
    expect((await get(foreign.page, '/assets/' + source.id)).status).toBe(404);
    expect((await get(foreign.page, '/assets')).body).toEqual([]);
    expect((await get(staff.page, '/metrics')).status).toBe(403);
    expect((await get(supervisor.page, '/metrics')).status).toBe(403);
    const staffAsset = await get(staff.page, '/assets/' + source.id);
    expect(staffAsset.body.stock_value_rm).toBeNull();
    await staff.page.goto('/equipment/' + source.id);
    await expect(staff.page.getByTestId('button-add-stock')).toHaveCount(0);
    await staff.page.getByTestId('button-record-reading-' + source.id).click();
    await staff.page.getByTestId('input-temperature').fill('-18');
    await staff.page.getByTestId('button-submit-reading').click();
    await expect(staff.page.getByRole('dialog')).toHaveCount(0);
    await staff.page.goto('/report');
    await staff.page.getByTestId('input-report').fill('Freezer Alpha tak sejuk, ais dah cair');
    await staff.page.getByTestId('button-submit-report').click();
    await staff.page.getByTestId('link-report-incident').click();
    await expect(staff.page).toHaveURL(/\/incidents\/inc_/);
    const incidentPath = new URL(staff.page.url()).pathname;
    const incidentId = incidentPath.split('/').at(-1)!;
    const incident = (await get(owner.page, '/incidents/' + incidentId)).body;
    expect(incident.approval).toBeTruthy();
    expect(incident.stock_at_risk_rm).toBe('150.00');
    expect((await get(staff.page, '/incidents/' + incidentId)).body.stock_at_risk_rm).toBeNull();
    await supervisor.page.goto(incidentPath);
    await supervisor.page.getByTestId('button-open-transfer').click();
    await supervisor.page.getByTestId('select-transfer-destination').click();
    await supervisor.page.getByRole('option', { name: /Freezer Backup/ }).click();
    await supervisor.page.getByRole('textbox', { name: /Quantity of Frozen chicken/ }).fill('4');
    await supervisor.page.getByTestId('button-submit-transfer').click();
    await expect(supervisor.page.getByRole('dialog')).toHaveCount(0);
    const afterTransfer = await get(owner.page, '/assets/' + source.id);
    expect(afterTransfer.body.stock[0].qty).toBe(6);
    expect((await get(owner.page, '/assets/' + backup.id)).body.stock[0].qty).toBe(4);
    expect((await get(owner.page, '/incidents/' + incidentId)).body.stock_at_risk_rm).toBe('150.00');
    await supervisor.page.getByTestId('button-approve-' + incident.approval.id).click();
    await supervisor.page.getByTestId('input-approval-note').fill('Approved after checking stock');
    await supervisor.page.getByTestId('button-confirm-decision').click();
    await expect(supervisor.page.getByRole('dialog')).toHaveCount(0);
    const dispatched = (await get(owner.page, '/incidents/' + incidentId)).body;
    expect(dispatched.status).toBe('DISPATCHED');
    const jobId = dispatched.job.id;
    await supervisor.page.getByTestId('button-confirm-job-' + jobId).click();
    await supervisor.page.getByTestId('button-save-confirmation').click();
    await expect(supervisor.page.getByRole('dialog')).toHaveCount(0);
    // Repair complete while warm must not falsely resolve.
    expect((await post(staff.page, '/readings', { asset_id: source.id, temp_c: -10 })).status).toBe(200);
    await supervisor.page.getByTestId('button-complete-job-' + jobId).click();
    await supervisor.page.getByTestId('button-complete-job-' + jobId + '-confirm').click();
    expect((await get(owner.page, '/incidents/' + incidentId)).body.status).toBe('DISPATCHED');
    await staff.page.goto('/equipment/' + source.id);
    await staff.page.getByTestId('button-record-reading-' + source.id).click();
    await staff.page.getByTestId('input-temperature').fill('-18');
    await staff.page.getByTestId('button-submit-reading').click();
    await expect(staff.page.getByRole('dialog')).toHaveCount(0);
    expect((await get(owner.page, '/incidents/' + incidentId)).body.status).toBe('RESOLVED');
    await owner.page.goto('/dashboard');
    await expect(owner.page.getByText('Recorded risk on resolved incidents')).toBeVisible();
    await expect(owner.page.getByText('Freezer Alpha', { exact: true }).first()).toBeVisible();
    await expect(owner.page.locator('[aria-busy="true"]')).toHaveCount(0);
    await owner.page.screenshot({ path: '../../generated-artifacts/owner-dashboard.jpg', fullPage: true });
    await staff.page.goto(incidentPath);
    await expect(staff.page.getByTestId('link-incident-asset')).toBeVisible();
    await expect(staff.page.getByText('Timeline', { exact: true })).toBeVisible();
    expect(await staff.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await staff.page.screenshot({ path: '../../generated-artifacts/staff-incident-mobile.jpg', fullPage: true });
    await staff.page.goto('/notifications');
    await expect(staff.page.locator('[data-testid^="row-notification-"]').first()).toBeVisible();
    await staff.page.locator('[data-testid^="button-mark-read-"]').first().click();
    const staffId = (await get(staff.page, '/me')).body.id;
    await owner.page.goto('/team');
    await owner.page.getByTestId('switch-active-' + staffId).click();
    await owner.page.getByTestId('button-confirm-member-change').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    expect((await get(staff.page, '/assets')).status).toBe(403);
    await owner.page.getByTestId('switch-active-' + staffId).click();
    await owner.page.getByTestId('button-confirm-member-change').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    expect((await get(staff.page, '/assets')).status).toBe(200);
    const supervisorId = (await get(supervisor.page, '/me')).body.id;
    await owner.page.getByTestId('select-role-' + supervisorId).click();
    await owner.page.getByRole('option', { name: 'Staff', exact: true }).click();
    await owner.page.getByTestId('button-confirm-member-change').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    expect((await get(supervisor.page, '/vendors')).status).toBe(403);
    await owner.page.getByTestId('select-role-' + supervisorId).click();
    await owner.page.getByRole('option', { name: 'Supervisor', exact: true }).click();
    await owner.page.getByTestId('button-confirm-member-change').click();
    await expect(owner.page.getByRole('dialog')).toHaveCount(0);
    // Revoke and reissue a link without pretending it was emailed.
    await owner.page.getByTestId('button-invite').click();
    await owner.page.getByTestId('input-invite-email').fill(`unused-${run}@example.test`);
    await owner.page.getByTestId('button-send-invite').click();
    await expect(owner.page.getByTestId('input-invite-link')).toBeVisible();
    await owner.page.getByTestId('button-close-invite-link').click();
    const pending = (await get(owner.page, '/invitations')).body.find((i: any) => i.email === `unused-${run}@example.test`);
    await owner.page.getByTestId('button-revoke-' + pending.id).click();
    await owner.page.getByTestId('button-revoke-' + pending.id + '-confirm').click();
    await expect(owner.page.getByRole('alertdialog')).toHaveCount(0);
    await owner.page.getByTestId('button-reissue-' + pending.id).click();
    await expect(owner.page.getByTestId('input-invite-link')).toBeVisible();
    await owner.page.getByTestId('button-close-invite-link').click();
    await owner.page.goto('/settings');
    await owner.page.getByTestId('input-settings-name').fill('Renamed Kitchen ' + run);
    await owner.page.getByTestId('button-save-settings').click();
    await owner.page.reload();
    await expect(owner.page.getByTestId('input-settings-name')).toHaveValue('Renamed Kitchen ' + run);
    await owner.page.goto('/account');
    await owner.page.getByTestId('input-profile-name').fill('Kitchen Owner');
    await owner.page.getByTestId('button-save-profile').click();
    await owner.page.reload();
    await expect(owner.page.getByTestId('input-profile-name')).toHaveValue('Kitchen Owner');
    await owner.page.goto('/activity');
    await expect(owner.page.getByText('Stock transferred', { exact: false }).first()).toBeVisible();
    // Keyboard access to the skip link and main landmark.
    await owner.page.keyboard.press('Control+Home');
    await owner.page.getByRole('link', { name: 'Skip to content' }).focus();
    await expect(owner.page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    // Owner transfer is explicit and takes effect with existing provider sessions.
    await owner.page.goto('/team');
    await owner.page.getByTestId('button-transfer-ownership-' + supervisorId).click();
    await owner.page.getByTestId('button-transfer-ownership-' + supervisorId + '-confirm').click();
    await expect(owner.page.getByRole('alertdialog')).toHaveCount(0);
    expect((await get(owner.page, '/team')).status).toBe(403);
    expect((await get(supervisor.page, '/me')).body.role).toBe('owner');
    await staff.context.setOffline(true);
    await expect(staff.page.getByText(/You are offline|You're offline/).first()).toBeVisible();
    await staff.context.setOffline(false);
    await staff.page.goto('/team');
    await expect(staff.page.getByTestId('state-denied')).toBeVisible();
    // Server-session expiry is handled without keeping cached business data visible.
    await staff.page.route('**/v1/access', (route) => route.fulfill({ status: 401, contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Your session expired' } }) }));
    await staff.page.goto('/dashboard');
    await expect(staff.page).toHaveURL(/\/sign-in/);
  } finally {
    for (const context of contexts) await context.close();
    for (const user of users) await provider('users/' + user, undefined, 'DELETE');
  }
});
