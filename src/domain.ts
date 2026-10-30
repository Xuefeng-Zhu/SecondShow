/** Deterministic, browser-local business rules. Times are ISO timestamps. */
export type Source = 'sample' | 'import';
export interface Event { id: string; artist: string; startsAt: string; timezone: string; priceCents: number; currency: string; status: 'on_sale' | 'sold_out' | 'canceled'; remaining: number; inventoryAsOf: string; catalogVersion: number; checkoutUrl?: string; qlooId?: string; minimumAge?: number; genre: string; source: Source }
export interface Customer { id: string; consent: 'granted' | 'declined' | 'unknown'; consentUpdatedAt?: string; budgetCents?: number; unavailableDates?: string[]; admissionAge?: number; source: Source }
export interface Order { id: string; customerId: string; eventId: string; purchasedAt: string; status: 'paid' | 'refunded' | 'void'; netCents: number; source: Source; updatedAt: string }
export interface Constraints { windowDays: number; budgetCents?: number }
export interface CohortMember { customerId: string; firstEventId: string; firstPurchasedAt: string; firstOrderId: string; qualificationOrders?: Order[] }
export interface TasteEvidence { seedIds: string[]; candidateIds: string[]; returnedIds: string[]; retrievedAt: string; warning?: string; explanations?: unknown[]; catalogVersion?: string; eventVersions?: {eventId: string; catalogVersion: number; inventoryAsOf: string}[] }
export interface Recommendation { customerId: string; eventIds: string[]; reason: string; provenance: 'synthetic fixture' | 'genre/date baseline' | 'live Qloo' | 'cached live Qloo' | 'operator curated'; evidence?: TasteEvidence }
export interface OutcomeSnapshot { customerId: string; observedAt: string; windowEndsAt: string; purchaseOrderIds: string[]; purchaseRevisions: Order[]; afterClick: boolean }
export interface Campaign { id: string; cutoff: string; source: Source; cohort: CohortMember[]; exclusions: {customerId: string; reason: string}[]; constraints: Constraints; priorEventId?: string; recommendations: Recommendation[]; copy: string; revision: number; status: 'draft' | 'approved' | 'exported' | 'needs_review'; approvalSignature?: string; exports: {at: string; snapshot: string; jsonSnapshot?: string; signature: string}[]; outcomeSnapshots?: OutcomeSnapshot[]; removedRecipientIds?: string[]; plannerMode?: 'deterministic' | 'live model' }
export interface Feedback { customerId: string; eventId: string; type: 'date' | 'price' | 'taste' | 'interest'; at: string; source: Source }
export interface Workspace { source: Source; clock: string; asOf: string; coverageStart?: string; events: Event[]; customers: Customer[]; orders: Order[]; orderRevisions?: Order[]; campaigns: Campaign[]; feedback: Feedback[]; clicks: {customerId: string; eventId: string; campaignId: string; at: string; source: Source}[] }
export interface OutcomeSummary { cohort: number; mature: number; incomplete: number; purchases: number; afterClick: number; rate: number | null; delivered: 0 }
const msDay = 86400000;
const at = (s: string) => Date.parse(s);
/** Latest known revision per order at the observation time. Revisions are append-only. */
export function ordersAt(w: Workspace, observedAt: string): Order[] {
  const versions = w.orderRevisions ?? w.orders;
  const latest = new Map<string,Order>();
  for (const order of versions) {
    if (at(order.updatedAt)>at(observedAt)) continue;
    const key = `${order.source}:${order.id}`;
    const old = latest.get(key);
    if (!old || at(order.updatedAt)>at(old.updatedAt)) latest.set(key,order);
  }
  return [...latest.values()];
}
/** Paid positive net orders for non-canceled shows qualify. */
export function qualifyingOrders(w: Workspace, customerId: string, cutoff = w.clock): Order[] {
  return ordersAt(w,cutoff).filter(o => o.source === w.source && o.customerId === customerId && o.status === 'paid' && o.netCents > 0 && at(o.purchasedAt) <= at(cutoff) && w.events.some(e => e.id === o.eventId && e.source === w.source && e.status !== 'canceled')).sort((a,b) => at(a.purchasedAt)-at(b.purchasedAt) || a.id.localeCompare(b.id));
}
export function eligibleBuyers(w: Workspace, cutoff = w.clock): {eligible: CohortMember[]; excluded: {customerId: string; reason: string}[]} {
  const eligible: CohortMember[] = [], excluded: {customerId: string; reason: string}[] = [];
  for (const c of w.customers.filter(x => x.source === w.source)) {
    const orders = qualifyingOrders(w,c.id,cutoff), distinct = new Set(orders.map(o => o.eventId));
    let reason = '';
    if (c.consent !== 'granted') reason = 'Marketing consent missing or declined';
    else if (!distinct.size) reason = 'No qualifying purchase';
    else if (distinct.size > 1) reason = 'Already purchased more than one distinct show';
    if (reason) excluded.push({customerId:c.id,reason});
    else { const first = orders[0]; eligible.push({customerId:c.id,firstEventId:first.eventId,firstPurchasedAt:first.purchasedAt,firstOrderId:first.id,qualificationOrders:orders.map(o=>({...o}))}); }
  }
  return {eligible,excluded};
}
export function feasibleEvents(w: Workspace, customerId: string, constraints: Constraints, cutoff = w.clock): Event[] {
  const customer = w.customers.find(c => c.id === customerId && c.source === w.source);
  if (!customer || customer.consent !== 'granted' || !Number.isInteger(constraints.windowDays) || constraints.windowDays < 1 || constraints.windowDays > 365 || (constraints.budgetCents !== undefined && (!Number.isSafeInteger(constraints.budgetCents) || constraints.budgetCents < 0)) || (customer.budgetCents !== undefined && (!Number.isSafeInteger(customer.budgetCents) || customer.budgetCents < 0))) return [];
  const purchased = new Set(qualifyingOrders(w,customerId,cutoff).map(o => o.eventId));
  const rejected = new Set(w.feedback.filter(f => f.customerId === customerId && f.source === w.source).map(f => f.eventId));
  const budget = Math.min(constraints.budgetCents ?? Infinity, customer.budgetCents ?? Infinity);
  const availableOnDate = (e: Event) => {
    try { const parts = new Intl.DateTimeFormat('en-US',{timeZone:e.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(e.startsAt)); const get=(type: string)=>parts.find(p=>p.type===type)?.value; return !customer.unavailableDates?.includes(`${get('year')}-${get('month')}-${get('day')}`); } catch { return false; }
  };
  return w.events.filter(e => e.source === w.source && availableOnDate(e) && (e.minimumAge === undefined || (Number.isInteger(e.minimumAge) && e.minimumAge >= 0 && e.minimumAge <= 120 && Number.isInteger(customer.admissionAge) && customer.admissionAge! >= e.minimumAge && customer.admissionAge! <= 120)) && e.status === 'on_sale' && e.remaining > 0 && at(e.startsAt) > at(cutoff) && at(e.startsAt) <= at(cutoff)+constraints.windowDays*msDay && e.priceCents <= budget && !purchased.has(e.id) && !rejected.has(e.id)).sort((a,b) => at(a.startsAt)-at(b.startsAt) || a.priceCents-b.priceCents || a.id.localeCompare(b.id));
}
export function buildCampaign(w: Workspace, constraints: Constraints = {windowDays:30}, priorEventId?: string): Campaign {
  const {eligible,excluded} = eligibleBuyers(w);
  const cohort = eligible.filter(c => !priorEventId || c.firstEventId === priorEventId);
  const recommendations = cohort.map(c => {
    const first = w.events.find(e => e.id === c.firstEventId);
    const seedRejected = w.feedback.some(f=>f.source===w.source && f.customerId===c.customerId && f.type==='interest');
    const choices = feasibleEvents(w,c.customerId,constraints).sort((a,b) => (seedRejected ? 0 : Number(b.genre === first?.genre)-Number(a.genre === first?.genre)) || at(a.startsAt)-at(b.startsAt) || a.priceCents-b.priceCents || a.id.localeCompare(b.id)).slice(0,2);
    return {customerId:c.customerId,eventIds:choices.map(e => e.id),reason:choices.length ? seedRejected ? 'Original purchase was not representative; ordered by date, then price without a genre assumption.' : `${w.source === 'sample' ? 'Sample' : 'Genre/date'} baseline: matching genre, then soonest date and price.` : 'No available show fits the current constraints.',provenance:w.source === 'sample' ? 'synthetic fixture' as const : 'genre/date baseline' as const};
  });
  const draft: Campaign = {id:`campaign-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cutoff:w.clock,source:w.source,cohort,exclusions:excluded,constraints,priorEventId,recommendations,copy:'Thanks for joining us. Here are two shows you might enjoy next.',revision:1,status:'draft',exports:[],outcomeSnapshots:[],plannerMode:'deterministic'};
  return captureOutcomeSnapshots(w,draft);
}
/** Replan only current eligible recipients while preserving the original cohort denominator. */
export function replanCampaign(w: Workspace, c: Campaign): Campaign {
  const available = new Set(eligibleBuyers(w).eligible.map(m=>m.customerId));
  const recommendations = c.cohort.filter(m=>available.has(m.customerId) && !c.removedRecipientIds?.includes(m.customerId)).map(m=> {
    const seed = w.events.find(e=>e.id===m.firstEventId);
    const seedRejected = w.feedback.some(f=>f.source===w.source && f.customerId===m.customerId && f.type==='interest');
    const choices = feasibleEvents(w,m.customerId,c.constraints).sort((a,b)=>(seedRejected ? 0 : Number(b.genre===seed?.genre)-Number(a.genre===seed?.genre)) || at(a.startsAt)-at(b.startsAt) || a.priceCents-b.priceCents || a.id.localeCompare(b.id)).slice(0,2);
    return {customerId:m.customerId,eventIds:choices.map(e=>e.id),reason:choices.length ? seedRejected ? 'Original purchase was not representative; ordered by date, then price without a genre assumption.' : `${w.source === 'sample' ? 'Sample' : 'Genre/date'} baseline: matching genre, then soonest date and price.` : 'No available show fits the current constraints.',provenance:w.source === 'sample' ? 'synthetic fixture' as const : 'genre/date baseline' as const};
  });
  return {...c,recommendations,revision:c.revision+1,status:'draft',approvalSignature:undefined,plannerMode:'deterministic'};
}
/** Block empty or unfinished system placeholder copy before approval and export. */
export function invitationCopyIsComplete(copy: unknown): copy is string {
  if (typeof copy !== 'string' || !copy.trim()) return false;
  return !/^awaiting\s+live\s+proposal[.!…]*$/iu.test(copy.trim());
}
/** A conservative fingerprint invalidates approval whenever relevant data or proposal changes. */
function signature(w: Workspace,c: Campaign): string {
  return JSON.stringify({source:w.source,clock:w.clock,events:w.events.filter(e=>e.source===c.source),customers:w.customers.filter(x=>x.source===c.source),orders:w.orders.filter(o=>o.source===c.source),feedback:w.feedback.filter(f=>f.source===c.source),cohort:c.cohort,constraints:c.constraints,recommendations:c.recommendations,copy:c.copy,revision:c.revision,plannerMode:c.plannerMode,removedRecipientIds:c.removedRecipientIds ?? []});
}
export function campaignIsCurrent(w: Workspace,c: Campaign): boolean {
  if (c.source !== w.source || !invitationCopyIsComplete(c.copy) || !c.approvalSignature || c.approvalSignature !== signature(w,c)) return false;
  const nowEligible = new Set(eligibleBuyers(w).eligible.map(x=>x.customerId));
  return c.recommendations.every(r => nowEligible.has(r.customerId) && r.eventIds.every(id => feasibleEvents(w,r.customerId,c.constraints).some(e=>e.id===id)));
}
export function approveCampaign(w: Workspace,c: Campaign): Campaign {
  const currentEligible = new Set(eligibleBuyers(w).eligible.map(x=>x.customerId));
  const valid = invitationCopyIsComplete(c.copy) && c.recommendations.some(r=>r.eventIds.length>0) && new Set(c.recommendations.map(r=>r.customerId)).size === c.recommendations.length && c.recommendations.every(r=>r.eventIds.length<=2 && new Set(r.eventIds).size===r.eventIds.length && !c.removedRecipientIds?.includes(r.customerId) && currentEligible.has(r.customerId) && c.cohort.some(x=>x.customerId===r.customerId) && r.eventIds.every(id=>feasibleEvents(w,r.customerId,c.constraints).some(e=>e.id===id)));
  if (!valid) return {...c,status:'needs_review',approvalSignature:undefined};
  return {...c,status:'approved',approvalSignature:signature(w,c)};
}
/** Freeze mature observations before applying later revisions or advancing time. */
export function captureOutcomeSnapshots(w: Workspace,c: Campaign): Campaign {
  if (c.source !== w.source) return c;
  const snapshots = [...(c.outcomeSnapshots ?? [])];
  for (const member of c.cohort) {
    if (snapshots.some(s=>s.customerId===member.customerId) || at(member.firstPurchasedAt)+30*msDay>at(w.asOf)) continue;
    const purchases = ordersAt(w,w.asOf).filter(o=>o.source===c.source && o.customerId===member.customerId && o.eventId!==member.firstEventId && o.status==='paid' && o.netCents>0 && at(o.purchasedAt)>at(member.firstPurchasedAt) && at(o.purchasedAt)<=at(member.firstPurchasedAt)+30*msDay && at(o.purchasedAt)<=at(w.asOf) && w.events.some(e=>e.id===o.eventId && e.source===c.source && e.status!=='canceled'));
    snapshots.push({customerId:member.customerId,observedAt:w.asOf,windowEndsAt:new Date(at(member.firstPurchasedAt)+30*msDay).toISOString(),purchaseOrderIds:purchases.map(o=>o.id),purchaseRevisions:purchases.map(o=>({...o})),afterClick:purchases.some(o=>w.clicks.some(click=>click.source===c.source && click.campaignId===c.id && click.customerId===member.customerId && click.eventId===o.eventId && at(click.at)<=at(o.purchasedAt)))});
  }
  return {...c,outcomeSnapshots:snapshots};
}
export function outcomes(w: Workspace,c: Campaign): OutcomeSummary {
  const captured = captureOutcomeSnapshots(w,c).outcomeSnapshots ?? [];
  const mature = captured.length;
  const purchases = captured.filter(s=>s.purchaseOrderIds.length>0).length;
  const afterClick = captured.filter(s=>s.afterClick).length;
  return {cohort:c.cohort.length,mature,incomplete:c.cohort.length-mature,purchases,afterClick,rate:mature ? purchases/mature : null,delivered:0};
}
/** Simulate a purchase at the current business clock; never backdate. */
export function recordSamplePurchase(w: Workspace,c: Campaign,customerId: string,eventId: string): Workspace {
  if (w.source!=='sample' || c.source!=='sample' || !c.recommendations.some(r=>r.customerId===customerId && r.eventIds.includes(eventId))) return w;
  const member = c.cohort.find(m=>m.customerId===customerId);
  if (!member || !eligibleBuyers(w).eligible.some(x=>x.customerId===customerId) || at(w.clock)<=at(member.firstPurchasedAt) || at(w.clock)>at(member.firstPurchasedAt)+30*msDay || !feasibleEvents(w,customerId,c.constraints).some(e=>e.id===eventId)) return w;
  const id = `sample-outcome-${c.id}-${customerId}-${eventId}`;
  if (w.orders.some(o=>o.id===id)) return w;
  const order: Order = {id,customerId,eventId,purchasedAt:w.clock,status:'paid',netCents:w.events.find(e=>e.id===eventId)?.priceCents ?? 0,source:'sample',updatedAt:w.clock};
  const campaigns = w.campaigns.map(x=>captureOutcomeSnapshots(w,x));
  return {...w,campaigns,orders:[...w.orders,order],orderRevisions:[...(w.orderRevisions ?? w.orders),order]};
}
/** Advance only the fictional demo clock, never real-world time or imported workspaces. */
export function advanceDemoClock(w: Workspace, days: number): Workspace {
  if (w.source!=='sample' || !Number.isInteger(days) || days<1 || days>365) return w;
  const before = w.campaigns.map(c=>captureOutcomeSnapshots(w,c));
  const next = {...w,clock:new Date(at(w.clock)+days*msDay).toISOString(),asOf:new Date(at(w.asOf)+days*msDay).toISOString(),campaigns:before};
  return {...next,campaigns:next.campaigns.map(c=>captureOutcomeSnapshots(next,c))};
}

/** Produces a historical, immutable snapshot; it never sends a message. */
export function exportCampaign(w: Workspace, c: Campaign): {campaign: Campaign; csv: string; json: string} | null {
  if ((c.status !== 'approved' && c.status !== 'exported') || !campaignIsCurrent(w,c)) return null;
  const cell = (input: string) => { const safe = /^[\s]*[=+@\-\t\r]/.test(input) ? "'"+input : input; return `"${safe.replace(/"/g,'""')}"`; };
  const rows = c.recommendations.filter(r=>r.eventIds.length>0).map(r=>({
    customerId:r.customerId, message:c.copy, status:'not sent', tasteMode:r.provenance,
    evidence:r.evidence ?? null,
    shows:r.eventIds.map(id=>{const e=w.events.find(x=>x.source===c.source && x.id===id)!;return {id:e.id,artist:e.artist,startsAt:e.startsAt,timezone:e.timezone,priceCents:e.priceCents,currency:e.currency,inventoryAsOf:e.inventoryAsOf,checkoutUrl:e.checkoutUrl ?? null};})
  }));
  const lines = [['customer_id','message','status','taste_mode','shows_json','evidence_json'].map(cell).join(',')];
  rows.forEach(r=>lines.push([r.customerId,r.message,r.status,r.tasteMode,JSON.stringify(r.shows),JSON.stringify(r.evidence)].map(cell).join(',')));
  const csv = lines.join('\r\n');
  const json = JSON.stringify({campaignId:c.id,revision:c.revision,cutoff:c.cutoff,source:c.source,plannerMode:c.plannerMode ?? 'deterministic',constraints:c.constraints,messagesSent:false,recipients:rows},null,2);
  const existing = c.exports.some(x=>x.signature===c.approvalSignature);
  return {campaign:{...c,status:'exported',exports:existing ? c.exports : [...c.exports,{at:w.clock,snapshot:csv,jsonSnapshot:json,signature:c.approvalSignature!}]},csv,json};
}
