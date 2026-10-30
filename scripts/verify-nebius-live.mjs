/** Opt-in actual UI verification: no secrets, customer data or messages are exported. */
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
if (process.env.RUN_NEBIUS_LIVE_VERIFY !== '1') throw new Error('Explicit opt-in required.');
const evidence={verifiedAt:new Date().toISOString(),source:'local browser and live Qloo/Nebius',searches:[],result:'failed'};
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto('http://127.0.0.1:3000');
 if(await page.locator('details.workspace-settings').getAttribute('open')===null) await page.getByText('Workspace & import',{exact:true}).click();
 await page.getByRole('button',{name:/Load sample venue/}).click();
 await page.getByRole('button',{name:/Campaigns/}).click();
 await page.getByLabel('Prior show cohort').selectOption('past-1');
 await page.getByLabel('Window days').fill('6');
 await page.getByLabel('Planning mode').selectOption('live');
 await page.getByRole('button',{name:'Draft campaign',exact:true}).click();
 await page.getByRole('button',{name:'Review invitation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Approve draft',exact:true})).toBeDisabled();
 await page.getByText('Live providers & artist evidence',{exact:true}).click();
 for(const [eventId,name] of [['past-1','Japanese Breakfast'],['show-1','Alvvays']]) {
  await page.getByLabel('Artist to resolve').selectOption(eventId);
  const pending=page.waitForResponse(r=>r.url().endsWith('/api/qloo')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Search Qloo',exact:true}).click();
  const response=await pending; const body=await response.json();
  evidence.searches.push({name,status:response.status()});
  if(!response.ok()) throw new Error(`Qloo search failed: ${body.error?.code||response.status()}`);
  const index=body.candidates.findIndex(c=>c.name.toLowerCase()===name.toLowerCase()&&c.types.includes('urn:entity:artist'));
  if(index<0) throw new Error('Exact artist identity not returned.');
  await page.getByRole('button',{name:'Confirm identity',exact:true}).nth(index).click();
  await expect(page.getByLabel('Artist to resolve').locator(`option[value="${eventId}"]`)).toContainText('confirmed');
 }
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/campaign-plan')&&r.request().method()==='POST');
 await page.getByTestId('live-plan').click();
 const response=await pending; const body=await response.json();
 evidence.plan={status:response.status(),error:body.error??null,qlooMode:body.taste?.mode,plannerMode:body.planner?.mode,proposedCount:body.eventIds?.length,warning:body.taste?.warning??null};
 if(!response.ok()) throw new Error(`Live planning failed: ${body.error?.code||response.status()}`);
 expect(body.taste.mode).toBe('live'); expect(body.planner.mode).toBe('live_model'); expect(body.eventIds).toContain('show-1');
 await expect(page.getByText('Live proposal validated. Human approval required.',{exact:true})).toBeVisible();
 const copy = page.getByLabel('Invitation copy');
 const text = await copy.inputValue();
 if (!text.trim() || /awaiting live proposal/i.test(text)) throw new Error('Live invitation copy is incomplete.');
 evidence.copyReady = true;
 await expect(page.getByRole('button',{name:'Approve draft',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Approve draft',exact:true}).click();
 await expect(page.getByRole('button',{name:'Export campaign',exact:true})).toBeEnabled();
 const downloadPromise = page.waitForEvent('download');
 await page.getByRole('button',{name:'Export campaign',exact:true}).click();
 const download = await downloadPromise; const csv = await readFile(await download.path(), 'utf8');
 if (!csv.includes(text) || /awaiting live proposal/i.test(csv)) throw new Error('Exported copy is incomplete.');
 evidence.exportCopyVerified=true;
 evidence.humanApprovalRequired=true; evidence.exportEnabledAfterApproval=true; evidence.result='passed';
 console.log(JSON.stringify(evidence,null,2));
} catch(error) {
 evidence.error=error instanceof Error ? error.message.split('\n')[0] : 'Verification failed';
 console.error(JSON.stringify(evidence,null,2)); process.exitCode=1;
} finally {
 await writeFile('artifacts/SecondShow-live-copy-fix-verification.json',JSON.stringify(evidence,null,2)+'\n');
 await browser.close();
}
