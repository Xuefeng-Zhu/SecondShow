import { test, expect, type Page } from '@playwright/test';

// Fabricated IDs exist only in these mocked tests, never in application sample data.
const ids: Record<string, string> = {
  'Japanese Breakfast': '00000000-0000-4000-8000-000000000001',
  Alvvays: '00000000-0000-4000-8000-000000000002',
  'The War on Drugs': '00000000-0000-4000-8000-000000000003',
};
async function prepareLive(page: Page) {
  await page.route('**/api/qloo', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: { candidates: [{ id: ids[body.name], name: body.name, types: ['urn:entity:artist'] }] } });
  });
  await page.goto('/');
  if (await page.locator('details.workspace-settings').getAttribute('open') === null) await page.getByText('Workspace & import',{exact:true}).click();
  await page.getByRole('button', { name: /Load sample venue/ }).click();
  await page.getByRole('button', { name: /Campaigns/ }).click();
  await page.getByLabel('Prior show cohort').selectOption('past-1');
  await page.getByLabel('Window days').fill('10');
  await page.getByLabel('Planning mode').selectOption('live');
  await page.getByRole('button', { name: 'Draft campaign', exact: true }).click();
  await page.getByRole('button',{name:'Review invitation',exact:true}).click();
  await expect(page.getByRole('button', { name: 'Approve draft', exact: true })).toBeDisabled();
  await page.getByText('Live providers & artist evidence',{exact:true}).click();
  for (const id of ['past-1', 'show-1', 'show-2']) {
    await page.getByLabel('Artist to resolve').selectOption(id);
    await page.getByRole('button', { name: 'Search Qloo', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm identity', exact: true }).click();
  }
}

test('mocked provider evidence changes the campaign and remains subject to review', async ({ page }) => {
  const requests: unknown[] = [];
  await page.route('**/api/campaign-plan', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    expect(JSON.stringify(body)).not.toMatch(/buyer-|customerId|order-/);
    expect(body.catalogVersion).toMatch(/^[a-zA-Z0-9._-]{1,80}$/);
    expect(body.events.map((e: {id: string}) => e.id)).toEqual(['show-1', 'show-2']);
    await route.fulfill({ json: {
      mode: 'live', eventIds: ['show-2', 'show-1'], eligibleEventIds: ['show-1', 'show-2'], unrankedEventIds: [],
      taste: { mode: 'live', retrievedAt: '2026-10-29T12:00:00.000Z', seedIds: [ids['Japanese Breakfast']], candidateIds: [ids.Alvvays, ids['The War on Drugs']], ranked: [{id:ids['The War on Drugs'], rank:1},{id:ids.Alvvays,rank:2}], warning: 'Explanation metadata unavailable.', catalogVersion: body.catalogVersion },
      planner: { mode: 'live_model', progress: ['Inspected 2 candidates.', 'Proposed 2 events.'] },
    }});
  });
  await prepareLive(page);
  await page.getByTestId('live-plan').click();
  await expect(page.getByText('Live proposal validated. Human approval required.', {exact:true})).toBeVisible();
  expect(requests).toHaveLength(1); // equivalent shortlists are shared, not per recipient calls
  const copy = page.getByLabel('Invitation copy');
  await expect(copy).toHaveValue('Thanks for joining us. Here are some shows you might enjoy next.');
  await copy.fill('   ');
  await expect(page.getByText('Add complete invitation copy before approving or exporting.')).toBeVisible();
  await expect(page.getByRole('button', {name:'Approve draft', exact:true})).toBeDisabled();
  await expect(page.getByRole('button', {name:'Export campaign', exact:true})).toBeDisabled();
  const customCopy = 'Thank you for joining us. See what is coming up next.';
  await copy.fill(customCopy);
  const replanned = page.waitForResponse(response => response.url().endsWith('/api/campaign-plan'));
  await page.getByTestId('live-plan').click();
  await replanned;
  await expect(copy).toHaveValue(customCopy);
  await expect(page.getByText('Live proposal validated. Human approval required.', {exact:true})).toBeVisible();
  await page.getByText('Review audience & recipient previews',{exact:true}).click();
  const table = page.getByRole('table').last();
  await expect(table.getByRole('row').nth(1)).toContainText('The War on Drugs / Alvvays');
  await page.getByText('Baseline versus Qloo / campaign evidence', {exact:true}).click();
  await expect(page.getByText('Explanation metadata unavailable.', {exact:false})).toBeVisible();
  await page.getByRole('button', { name:'Approve draft', exact:true }).click();
  await expect(page.getByRole('button', {name:'Export campaign', exact:true})).toBeEnabled();
  await page.getByText('Campaign preferences',{exact:true}).click();
  await page.getByLabel('Budget dollars').fill('29');
  await expect(page.getByRole('button', {name:'Export campaign', exact:true})).toBeDisabled();
});

test('live failure stays visible and does not produce a fixture campaign', async ({ page }) => {
  await page.route('**/api/campaign-plan', route => route.fulfill({ status:503, json:{ error:{code:'auth',message:'Mock credential rejected.'} } }));
  await prepareLive(page);
  await page.getByTestId('live-plan').click();
  await expect(page.getByRole('alert').filter({hasText:'Mock credential rejected.'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Export campaign',exact:true})).toBeDisabled();
  await page.getByText('Campaign preferences',{exact:true}).click();
  await page.getByLabel('Planning mode').selectOption('sample');
  await page.getByRole('button', {name:'Replan draft',exact:true}).click();
  await expect(page.getByRole('status').first()).toContainText('Draft ready');
});


test('a pending live result cannot restore a reset workspace', async ({ page }) => {
  let unblock: () => void = () => {};
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  let started: () => void = () => {};
  const begun = new Promise<void>(resolve => { started = resolve; });
  await page.route('**/api/campaign-plan', async route => {
    started(); await gate;
    await route.fulfill({status:503,json:{error:{message:'Delayed test response.'}}});
  });
  await prepareLive(page);
  await page.getByTestId('live-plan').click();
  await begun;
  if (await page.locator('details.workspace-settings').getAttribute('open') === null) await page.getByText('Workspace & import',{exact:true}).click();
  await page.getByRole('button',{name:'Reset my demo',exact:true}).click();
  unblock();
  await expect(page.getByRole('heading',{name:'A second visit starts here.'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'A second visit starts here.'})).toBeVisible();
});


test('a live response with no proposed event cannot turn pending copy into an approvable campaign', async ({ page }) => {
  await page.route('**/api/campaign-plan', async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: {
      mode: 'live', eventIds: [], eligibleEventIds: ['show-1', 'show-2'], unrankedEventIds: [],
      taste: { mode:'live', retrievedAt:'2026-10-29T12:00:00.000Z', seedIds:body.seedIds, candidateIds:body.events.map((e:{artistId:string})=>e.artistId), ranked:body.events.map((e:{artistId:string},index:number)=>({id:e.artistId,rank:index+1})), catalogVersion:body.catalogVersion },
      planner: { mode:'live_model', progress:['Inspected 2 candidates.', 'Proposed 0 events.'] },
    }});
  });
  await prepareLive(page);
  await page.getByTestId('live-plan').click();
  await expect(page.getByText('No live model proposal was produced. Unranked recipients have no recommendations.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Invitation copy')).toHaveValue('Awaiting live proposal.');
  await expect(page.getByRole('button',{name:'Approve draft',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Export campaign',exact:true})).toBeDisabled();
});
