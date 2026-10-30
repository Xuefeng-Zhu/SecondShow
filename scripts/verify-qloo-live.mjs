import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';

if (process.env.RUN_QLOO_LIVE_VERIFY !== '1') {
  console.error('Not run: set RUN_QLOO_LIVE_VERIFY=1 only with permission for live Qloo calls.');
  process.exit(2);
}
const evidence = { verifiedAt: new Date().toISOString(), source: 'actual local application; real Qloo responses', searches: [], rank: null, cache: null, campaignPlanning: null, secretExposed: false };
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('button', { name: /Load sample venue/ }).click();
  await page.getByLabel('Prior show cohort').selectOption('past-1');
  await page.getByLabel('Window days').fill('6');
  await page.getByLabel('Planning mode').selectOption('live');
  await page.getByRole('button', { name: 'Draft campaign', exact: true }).click();
  await page.getByText('Live providers & artist evidence', { exact: true }).click();
  for (const [eventId, name] of [['past-1', 'Japanese Breakfast'], ['show-1', 'Alvvays']]) {
    await page.getByLabel('Artist to resolve').selectOption(eventId);
    const pending = page.waitForResponse(response => response.url().endsWith('/api/qloo') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Search Qloo', exact: true }).click();
    const response = await pending;
    const payload = await response.json();
    const entry = { name, status: response.status(), error: payload.error ?? null, candidates: payload.candidates ?? [] };
    evidence.searches.push(entry);
    if (!response.ok()) throw new Error(`Qloo search failed: ${payload.error?.code || response.status()}`);
    const index = payload.candidates.findIndex(candidate => candidate.name.toLowerCase() === name.toLowerCase() && candidate.types.includes('urn:entity:artist'));
    if (index < 0) throw new Error('No exact artist identity returned for explicit confirmation.');
    await page.getByRole('button', { name: 'Confirm identity', exact: true }).nth(index).click();
    entry.confirmedId = payload.candidates[index].id;
    await expect(page.getByLabel('Artist to resolve').locator(`option[value="${eventId}"]`)).toContainText('confirmed');
  }
  const body = { operation: 'rank', seedIds: [evidence.searches[0].confirmedId], candidateIds: [evidence.searches[1].confirmedId], catalogVersion: `authorized-real-qloo-smoke-${Date.now().toString(36)}` };
  const rank = async () => page.evaluate(async input => {
    const response = await fetch('/api/qloo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  }, body);
  evidence.rank = await rank();
  if (evidence.rank.status !== 200 || evidence.rank.body.mode !== 'live') throw new Error(`Qloo ranking failed: ${evidence.rank.body.error?.code || evidence.rank.status}`);
  expect(evidence.rank.body.ranked).toHaveLength(1);
  expect(evidence.rank.body.ranked[0].id).toBe(body.candidateIds[0]);
  expect(Number.isFinite(Date.parse(evidence.rank.body.retrievedAt))).toBe(true);
  evidence.cache = await rank();
  expect(evidence.cache.status).toBe(200);
  expect(evidence.cache.body.mode).toBe('cached_live');
  expect(evidence.cache.body.retrievedAt).toBe(evidence.rank.body.retrievedAt);
  if (!process.env.NEBIUS_API_KEY && !process.env.NEBIUS_MODEL) {
    const pending = page.waitForResponse(response => response.url().endsWith('/api/campaign-plan') && response.request().method() === 'POST');
    await page.getByTestId('live-plan').click();
    const response = await pending;
    const payload = await response.json();
    evidence.campaignPlanning = { status: response.status(), error: payload.error, otherProviderConfigured: false };
    expect(payload.error?.code).toBe('unconfigured');
    await expect(page.getByRole('alert').filter({ hasText: 'Nebius' })).toBeVisible();
    await page.screenshot({ path: 'artifacts/SecondShow-qloo-live-verification.png', fullPage: true });
  } else {
    evidence.campaignPlanning = { status: 'not attempted', reason: 'Another provider credential is present but outside this authorization.' };
  }
  evidence.result = 'Qloo UI identity search/confirmation, real ranking and cache passed; full model planning remains unavailable.';
  console.log(JSON.stringify({ result: evidence.result, searches: evidence.searches.map(({ name, status }) => ({ name, status })), rankMode: evidence.rank.body.mode, cacheMode: evidence.cache.body.mode, planning: evidence.campaignPlanning }));
} catch (error) {
  evidence.result = 'failed';
  evidence.error = error instanceof Error ? error.message : 'Live verification failed';
  console.error(JSON.stringify({ result: evidence.result, error: evidence.error }));
  process.exitCode = 1;
} finally {
  await fs.writeFile('artifacts/SecondShow-qloo-live-verification.json', JSON.stringify(evidence, null, 2) + '\n');
  await browser.close();
}
