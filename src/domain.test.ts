import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleBuyers, feasibleEvents, buildCampaign, approveCampaign, campaignIsCurrent, outcomes, recordSamplePurchase, advanceDemoClock, ordersAt, captureOutcomeSnapshots, replanCampaign, exportCampaign, type Workspace, type Event, type Order } from './domain.ts';

import { createSampleWorkspace } from './sample.ts';

const clock = '2026-10-29T12:00:00.000Z';
const date = (days: number) => new Date(Date.parse(clock) + days * 86400000).toISOString();
const event = (id: string, days: number, options: Partial<Event> = {}): Event => ({ id, artist: id, startsAt: date(days), timezone: 'America/Los_Angeles', priceCents: 2000, currency: 'USD', status: 'on_sale', remaining: 10, inventoryAsOf: clock, catalogVersion: 1, genre: 'rock', source: 'sample', ...options });
const order = (id: string, customerId: string, eventId: string, days = -40, options: Partial<Order> = {}): Order => ({ id, customerId, eventId, purchasedAt: date(days), updatedAt: clock, status: 'paid', netCents: 1000, source: 'sample', ...options });
function workspace(): Workspace {
  return { source:'sample', clock, asOf:clock, events:[event('first',-50),event('good',2),event('other',4)], customers:[{id:'a',consent:'granted',source:'sample'},{id:'b',consent:'unknown',source:'sample'},{id:'c',consent:'granted',source:'sample'}], orders:[order('a1','a','first'),order('b1','b','first'),order('c1','c','first')], campaigns:[], feedback:[], clicks:[] };
}

describe('first-buyer and feasibility rules', () => {
  it('counts distinct qualifying shows, not multiple orders for the same show', () => {
    const w = workspace();
    w.orders.push(order('a2','a','first',-39),order('c2','c','other',-1));
    const result = eligibleBuyers(w);
    assert.deepEqual(result.eligible.map(x=>x.customerId), ['a']);
    assert.match(result.excluded.find(x=>x.customerId==='b')?.reason ?? '', /consent/i);
    assert.match(result.excluded.find(x=>x.customerId==='c')?.reason ?? '', /more than one/i);
  });
  it('excludes refunds and canceled purchases from qualification', () => {
    const w=workspace();
    w.orders[0].status='refunded';
    w.events.find(e=>e.id==='first')!.status='canceled';
    assert.equal(eligibleBuyers(w).eligible.length, 0);
  });
  it('rejects sold out, canceled, purchased, rejected, outside-window and over-budget events', () => {
    const w=workspace();
    w.events.push(event('sold',1,{remaining:0}),event('canceled',1,{status:'canceled'}),event('late',31),event('expensive',2,{priceCents:3000}));
    w.orders.push(order('purchase-other','a','other',-1));
    w.feedback.push({customerId:'a',eventId:'good',type:'taste',at:clock,source:'sample'});
    assert.deepEqual(feasibleEvents(w,'a',{windowDays:30,budgetCents:2500}), []);
  });
  it('enforces explicit local date and admission restrictions, and fails closed on invalid constraints', () => {
    const w=workspace(); w.events.find(e=>e.id==='good')!.minimumAge=21;
    assert.ok(!feasibleEvents(w,'a',{windowDays:30}).some(e=>e.id==='good'));
    w.customers[0].admissionAge=20;
    assert.ok(!feasibleEvents(w,'a',{windowDays:30}).some(e=>e.id==='good'));
    w.customers[0].admissionAge=21;
    assert.ok(feasibleEvents(w,'a',{windowDays:30}).some(e=>e.id==='good'));
    w.customers[0].unavailableDates=['2026-10-31'];
    assert.ok(!feasibleEvents(w,'a',{windowDays:30}).some(e=>e.id==='good'));
    assert.deepEqual(feasibleEvents(w,'a',{windowDays:NaN}),[]);
    assert.deepEqual(feasibleEvents(w,'a',{windowDays:30,budgetCents:NaN}),[]);
  });
  it('stops using first-show genre after interest correction in both new drafts and replans', () => {
    const w=workspace(); w.events.find(e=>e.id==='good')!.startsAt=date(4); w.events.find(e=>e.id==='other')!.startsAt=date(2); w.events.find(e=>e.id==='other')!.genre='jazz';
    const c=buildCampaign(w); assert.equal(c.recommendations.find(r=>r.customerId==='a')?.eventIds[0],'good');
    w.feedback.push({customerId:'a',eventId:'first',type:'interest',at:clock,source:'sample'});
    for (const draft of [buildCampaign(w),replanCampaign(w,c)]) {
      const rec=draft.recommendations.find(r=>r.customerId==='a')!;
      assert.equal(rec.eventIds[0],'other');
      assert.match(rec.reason,/without a genre assumption/);
    }
  });
  it('does not mix imported records into sample eligibility or candidates', () => {
    const w=workspace();
    w.orders.push(order('foreign','a','other',-1,{source:'import'}));
    w.events.push(event('import-show',1,{source:'import'}));
    assert.ok(eligibleBuyers(w).eligible.some(x=>x.customerId==='a'));
    assert.ok(!feasibleEvents(w,'a',{windowDays:30}).some(x=>x.id==='import-show'));
  });
});

describe('approval and observed outcomes', () => {
  it('labels imported baseline honestly and binds approval to provenance and planner mode', () => {
    const initial=workspace();
    const w: Workspace={...initial,source:'import',events:initial.events.map(e=>({...e,source:'import'})),customers:initial.customers.map(c=>({...c,source:'import'})),orders:initial.orders.map(o=>({...o,source:'import'}))};
    const c=approveCampaign(w,buildCampaign(w));
    assert.equal(c.plannerMode,'deterministic');
    assert.equal(c.recommendations[0].provenance,'genre/date baseline');
    assert.ok(campaignIsCurrent(w,c));
    assert.equal(campaignIsCurrent(w,{...c,plannerMode:'live model'}),false);
    assert.equal(campaignIsCurrent(w,{...c,recommendations:c.recommendations.map((r,i)=>i===0?{...r,provenance:'live Qloo' as const}:r)}),false);
    assert.equal(replanCampaign(w,c).recommendations[0].provenance,'genre/date baseline');
  });
  it('refuses duplicate recipients, duplicate shows and more than two shows', () => {
    const w=workspace(), c=buildCampaign(w), first=c.recommendations[0];
    assert.equal(approveCampaign(w,{...c,recommendations:[first,first]}).status,'needs_review');
    assert.equal(approveCampaign(w,{...c,recommendations:[{...first,eventIds:['good','good']}]}).status,'needs_review');
    assert.equal(approveCampaign(w,{...c,recommendations:[{...first,eventIds:['good','other','first']}]}).status,'needs_review');
  });
  it('rejects empty and pending invitation copy for approval and export, including previously signed drafts', () => {
    const w=workspace(), draft=buildCampaign(w);
    for (const copy of ['', '  \n ', 'Awaiting live proposal.', '  AWAITING   LIVE proposal...  ']) {
      const pending={...draft,copy};
      const rejected=approveCampaign(w,pending);
      assert.equal(rejected.status,'needs_review');
      assert.equal(rejected.approvalSignature,undefined);
      assert.equal(exportCampaign(w,rejected),null);
      // A pre-fix persisted campaign may have a valid old fingerprint for a placeholder.
      const oldApproval=approveCampaign(w,draft);
      const oldSignature=JSON.parse(oldApproval.approvalSignature!);
      oldSignature.copy=copy;
      const legacy={...oldApproval,copy,approvalSignature:JSON.stringify(oldSignature)};
      assert.equal(campaignIsCurrent(w,legacy),false);
      assert.equal(exportCampaign(w,legacy),null);
    }
    const custom='Join us for another night of music.';
    const approved=approveCampaign(w,{...draft,copy:custom});
    assert.equal(approved.status,'approved');
    assert.ok(campaignIsCurrent(w,approved));
    assert.equal(JSON.parse(exportCampaign(w,approved)!.json).recipients[0].message,custom);
  });
  it('invalidates approval when a recommended show sells out or consent changes', () => {
    const w=workspace();
    const c=approveCampaign(w,buildCampaign(w));
    assert.equal(c.status, 'approved');
    assert.equal(campaignIsCurrent(w,c), true);
    const sold={...w,events:w.events.map(e=>e.id==='good'?{...e,status:'sold_out' as const,remaining:0}:e)};
    assert.equal(campaignIsCurrent(sold,c), false);
    const noConsent={...w,customers:w.customers.map(x=>x.id==='a'?{...x,consent:'declined' as const}:x)};
    assert.equal(campaignIsCurrent(noConsent,c), false);
  });
  it('records after campaign and freezes the denominator when the window matures', () => {
    const w=workspace(); w.orders=w.orders.map(o=>({...o,purchasedAt:date(-20)}));
    const campaign=buildCampaign(w); w.campaigns=[campaign];
    assert.equal(outcomes(w,campaign).mature,0);
    const purchased=recordSamplePurchase(w,campaign,'a','good');
    const sim=purchased.orders.find(o=>o.id.startsWith('sample-outcome'))!;
    assert.equal(sim.purchasedAt,clock);
    assert.equal(recordSamplePurchase(purchased,campaign,'a','good').orders.length,purchased.orders.length);
    assert.equal(recordSamplePurchase(purchased,campaign,'a','other').orders.length,purchased.orders.length);
    const later=advanceDemoClock(purchased,30), frozen=later.campaigns[0];
    assert.equal(outcomes(later,frozen).purchases,1);
    assert.equal(outcomes(later,frozen).cohort,campaign.cohort.length);
    assert.equal(outcomes(later,frozen).afterClick,0);
    const refund={...sim,status:'refunded' as const,netCents:0,updatedAt:date(31)};
    const corrected={...later,clock:date(31),asOf:date(31),orders:later.orders.map(o=>o.id===sim.id?refund:o),orderRevisions:[...(later.orderRevisions??[]),refund]};
    assert.equal(ordersAt(corrected,date(30)).find(o=>o.id===sim.id)?.status,'paid');
    assert.equal(ordersAt(corrected,date(31)).find(o=>o.id===sim.id)?.status,'refunded');
    assert.equal(outcomes(corrected,frozen).purchases,1);
    assert.equal(captureOutcomeSnapshots(corrected,frozen).outcomeSnapshots?.find(x=>x.customerId==='a')?.purchaseOrderIds[0],sim.id);
    assert.equal(frozen.cohort.find(x=>x.customerId==='a')?.qualificationOrders?.[0].status,'paid');
  });
  it('reports an incomplete observation window without a misleading zero rate', () => {
    const w=workspace();
    w.orders=w.orders.map(o=>({...o,purchasedAt:date(-10)}));
    const result=outcomes(w,buildCampaign(w));
    assert.equal(result.mature, 0);
    assert.equal(result.incomplete, 2);
    assert.equal(result.rate, null);
  });
});


describe('replanning and export', () => {
  it('keeps manually removed recipients out of replans and approval without altering frozen cohort', () => {
    const w=workspace(), draft=buildCampaign(w), target=draft.recommendations[0];
    const removed={...draft,removedRecipientIds:[target.customerId],recommendations:draft.recommendations.filter(r=>r.customerId!==target.customerId)};
    const replanned=replanCampaign(w,removed);
    assert.deepEqual(replanned.cohort,draft.cohort);
    assert.ok(!replanned.recommendations.some(r=>r.customerId===target.customerId));
    assert.equal(approveCampaign(w,{...removed,recommendations:[...removed.recommendations,target]}).status,'needs_review');
  });
  it('keeps the frozen cohort while removing a buyer who has since purchased a second show', () => {
    const w=workspace();
    const campaign=buildCampaign(w);
    const changed={...w,orders:[...w.orders,order('new','a','good',-1)]};
    const replanned=replanCampaign(changed,campaign);
    assert.deepEqual(replanned.cohort,campaign.cohort);
    assert.ok(!replanned.recommendations.some(r=>r.customerId==='a'));
    assert.equal(replanned.status,'draft');
    assert.equal(replanned.revision,campaign.revision+1);
  });
  it('refuses stale export and preserves an immutable export snapshot without duplicates', () => {
    const w=workspace();
    const approved=approveCampaign(w,{...buildCampaign(w),copy:'=HYPERLINK("evil")'});
    const first=exportCampaign(w,approved);
    assert.ok(first);
    assert.equal(JSON.parse(first.json).messagesSent,false);
    assert.ok(first.csv.includes('shows_json'));
    assert.equal(JSON.parse(first.json).recipients[0].shows[0].priceCents,2000);
    assert.match(first.csv, /"'=HYPERLINK\(""evil""\)"/);
    const second=exportCampaign(w,first.campaign);
    assert.ok(second);
    assert.equal(second.campaign.exports.length,1);
    assert.equal(second.campaign.exports[0].snapshot,first.csv);
    const changed={...w,events:w.events.map(e=>e.id==='good'?{...e,status:'sold_out' as const,remaining:0}:e)};
    assert.equal(exportCampaign(changed,first.campaign),null);
    assert.equal(first.campaign.exports[0].snapshot,first.csv);
  });
});


describe('sample chronology', () => {
  it('places every purchase before its show and preserves a sequential repeat buyer', () => {
    const w = createSampleWorkspace(new Date(clock));
    for (const order of w.orders) {
      const show = w.events.find(event => event.id === order.eventId);
      assert.ok(show, `Missing show for ${order.id}`);
      assert.ok(Date.parse(order.purchasedAt) <= Date.parse(show.startsAt), `${order.id} purchased after show`);
    }
    const first = w.orders.find(order => order.customerId === 'buyer-02' && order.id !== 'repeat-order')!;
    const repeat = w.orders.find(order => order.id === 'repeat-order')!;
    assert.ok(Date.parse(first.purchasedAt) < Date.parse(repeat.purchasedAt));
    assert.ok(Date.parse(w.events.find(event => event.id === first.eventId)!.startsAt) <= Date.parse(repeat.purchasedAt));
    assert.ok(!eligibleBuyers(w).eligible.some(buyer => buyer.customerId === 'buyer-02'));
  });
});

describe('operator queue review', () => {
  it('requires approval again after curation and exports honest provenance without changing the cohort', () => {
    const w = workspace();
    const approved = approveCampaign(w, buildCampaign(w));
    const curated = {...approved, recommendations: approved.recommendations.map((rec, i) => i === 0 ? {
      ...rec, eventIds: [...rec.eventIds].reverse(), reason: 'Operator selected and ordered these shows.',
      provenance: 'operator curated' as const, evidence: undefined,
    } : rec)};
    assert.equal(campaignIsCurrent(w, curated), false);
    assert.equal(exportCampaign(w, curated), null);
    assert.deepEqual(curated.cohort, approved.cohort);
    const reviewed = approveCampaign(w, curated);
    assert.equal(campaignIsCurrent(w, reviewed), true);
    const exported = exportCampaign(w, reviewed)!;
    const recipient = JSON.parse(exported.json).recipients[0];
    assert.equal(recipient.tasteMode, 'operator curated');
    assert.equal(recipient.evidence, null);
    assert.deepEqual(recipient.shows.map((show: {id: string}) => show.id), curated.recommendations[0].eventIds);
    assert.equal(exported.campaign.cohort.length, approved.cohort.length);
  });
});
