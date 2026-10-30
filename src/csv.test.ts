import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, safeCsvCell, importCsv, isHttpsCheckout } from './csv.ts';
import { createSampleWorkspace } from './sample.ts';
import { buildCampaign } from './domain.ts';

describe('CSV boundaries', () => {
  it('parses quoted commas, quotes and newlines', () => {
    const parsed=parseCsv('id,artist\r\n1,"A, B"\r\n2,"Say ""hello""\nagain"');
    assert.deepEqual(parsed.rows,[['1','A, B'],['2','Say "hello"\nagain']]);
    assert.deepEqual(parsed.errors,[]);
  });
  it('reports malformed quoted data and missing required headers', () => {
    assert.ok(parseCsv('id,name\n1,"unfinished').errors.length);
    assert.ok(importCsv('id,consent\na,granted',createSampleWorkspace(),'orders').errors.some(e=>e.message.includes('Missing header')));
  });
  it('escapes spreadsheet formula prefixes, including whitespace and tabs', () => {
    for(const text of ['=1+1',' +1','-5','@cmd','\t=1']) assert.ok(safeCsvCell(text).startsWith('"\''));
    assert.equal(safeCsvCell('Plain "word"'),'"Plain ""word"""');
  });
  it('accepts only HTTPS checkout URLs without credentials', () => {
    assert.equal(isHttpsCheckout('https://example.com/tickets'),true);
    assert.equal(isHttpsCheckout('http://example.com'),false);
    assert.equal(isHttpsCheckout('https://user:pass@example.com'),false);
    assert.equal(isHttpsCheckout('javascript:alert(1)'),false);
  });
  it('upserts an order by ID and ignores repeated or older revisions', () => {
    let w=createSampleWorkspace();
    w=importCsv('id,consent\nc1,granted',w,'customers').workspace;
    w=importCsv('id,artist,startsAt,timezone,priceCents,currency,status,remaining,inventoryAsOf,catalogVersion,checkoutUrl,genre\ne1,Artist,2026-11-10T12:00:00Z,America/Los_Angeles,2000,USD,on_sale,10,2026-10-29T12:00:00Z,1,https://example.com,rock',w,'events').workspace;
    const header='id,customerId,eventId,purchasedAt,status,netCents,updatedAt\n';
    const first=importCsv(header+'o1,c1,e1,2026-10-01T12:00:00Z,paid,2000,2026-10-02T12:00:00Z',w,'orders');
    assert.equal(first.imported,1);
    const repeat=importCsv(header+'o1,c1,e1,2026-10-01T12:00:00Z,paid,2000,2026-10-02T12:00:00Z',first.workspace,'orders');
    assert.equal(repeat.skipped,1);
    const older=importCsv(header+'o1,c1,e1,2026-10-01T12:00:00Z,refunded,0,2026-10-01T13:00:00Z',repeat.workspace,'orders');
    assert.equal(older.skipped,1);
    assert.equal(older.workspace.orders.filter(o=>o.source==='import'&&o.id==='o1').length,1);
    assert.equal(older.workspace.orders.find(o=>o.source==='import'&&o.id==='o1')?.status,'paid');
  });
  it('requires a timezone and leaves sample campaigns unchanged on import', () => {
    const sample=createSampleWorkspace();
    const campaign=buildCampaign(sample);
    sample.campaigns.push(campaign);
    const header='id,artist,startsAt,timezone,priceCents,currency,status,remaining,inventoryAsOf,catalogVersion,checkoutUrl,genre\n';
    const result=importCsv(header+'e1,Artist,2026-11-10T12:00:00,America/Los_Angeles,2000,USD,on_sale,10,2026-10-29T12:00:00Z,1,https://example.com,rock',sample,'events');
    assert.equal(result.imported,0);
    assert.ok(result.errors.length);
    assert.equal(result.workspace.campaigns[0].status,campaign.status);
  });
});

describe('import history safeguards',()=>{
 it('bounds input and field lengths',()=>{assert.ok(parseCsv('a'.repeat(2_000_001)).errors.length);assert.ok(parseCsv('id\n'+ 'a'.repeat(10002)).errors.length);});
 it('does not inherit sample coverage and rejects backwards as-of',()=>{
 const w=createSampleWorkspace(new Date('2026-10-29T12:00:00Z'));
 const first=importCsv('id,consent\nc1,granted',w,'customers');
 assert.equal(first.workspace.coverageStart,undefined);
 const invalid=importCsv('id,consent\nc2,granted',first.workspace,'customers',{asOf:'2026-10-28T12:00:00Z'});
 assert.equal(invalid.imported,0);assert.ok(invalid.errors.length);
 });
 it('retains accepted order revisions and rejects stale event snapshots',()=>{
 let w=importCsv('id,consent\nc1,granted',createSampleWorkspace(new Date('2026-10-29T12:00:00Z')),'customers').workspace;
 const eventHeader='id,artist,startsAt,timezone,priceCents,currency,status,remaining,inventoryAsOf,catalogVersion,checkoutUrl,genre\n';
 const event='e1,Artist,2026-11-10T12:00:00Z,UTC,2000,USD,on_sale,10,2026-10-20T12:00:00Z,2,https://example.com,rock';
 w=importCsv(eventHeader+event,w,'events').workspace;
 assert.equal(importCsv(eventHeader+event.replace('2026-10-20','2026-10-19'),w,'events').skipped,1);
 const header='id,customerId,eventId,purchasedAt,status,netCents,updatedAt\n';
 w=importCsv(header+'o1,c1,e1,2026-10-01T12:00:00Z,paid,2000,2026-10-02T12:00:00Z',w,'orders').workspace;
 w=importCsv(header+'o1,c1,e1,2026-10-01T12:00:00Z,refunded,0,2026-10-03T12:00:00Z',w,'orders').workspace;
 assert.equal(w.orderRevisions?.filter(o=>o.source==='import'&&o.id==='o1').length,2);
 assert.equal(w.orders.find(o=>o.id==='o1')?.status,'refunded');
 });
});

describe('explicit admission and date constraints',()=>{
 it('validates local dates and never infers admission age',()=>{
 const w=createSampleWorkspace(new Date('2026-10-29T12:00:00Z'));
 const header='id,consent,unavailableDates,admissionAge\n';
 const valid=importCsv(header+'c1,granted,2026-11-01|2026-11-02,21',w,'customers');
 assert.equal(valid.imported,1);assert.deepEqual(valid.workspace.customers.find(c=>c.id==='c1')?.unavailableDates,['2026-11-01','2026-11-02']);
 assert.equal(importCsv(header+'c1,granted,2026-02-30,21',w,'customers').imported,0);
 assert.equal(importCsv(header+'c1,granted,,121',w,'customers').imported,0);
 assert.equal(importCsv('id,consent\nc1,granted',w,'customers').workspace.customers.find(c=>c.id==='c1')?.admissionAge,undefined);
 });
});


it('can advance a valid observation as-of on a duplicate import without adding purchases', () => {
  const first=importCsv('id,consent,consentUpdatedAt\nc1,granted,2026-10-29T00:00:00Z',createSampleWorkspace(new Date('2026-10-29T00:00:00Z')),'customers',{asOf:'2026-10-29T00:00:00Z'}).workspace;
  const later=importCsv('id,consent,consentUpdatedAt\nc1,granted,2026-10-29T00:00:00Z',first,'customers',{asOf:'2026-11-29T00:00:00Z'});
  assert.equal(later.imported,0);
  assert.equal(later.skipped,1);
  assert.equal(later.workspace.asOf,'2026-11-29T00:00:00Z');
  assert.equal(later.workspace.clock,'2026-11-29T00:00:00Z');
  assert.equal(later.workspace.orders.length,first.orders.length);
  const unsupported=importCsv('id,artist,startsAt,timezone,priceCents,currency,status,remaining,inventoryAsOf,catalogVersion,checkoutUrl,genre\ne2,Artist,2026-12-10T12:00:00Z,America/Los_Angeles,2000,EUR,on_sale,10,2026-11-29T00:00:00Z,1,https://example.com,rock',later.workspace,'events');
  assert.equal(unsupported.imported,0);
  assert.match(unsupported.errors[0].message,/USD/);
});
