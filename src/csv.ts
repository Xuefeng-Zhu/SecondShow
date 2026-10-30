import { captureOutcomeSnapshots } from './domain.ts';
import type { Workspace, Order, Event, Customer } from './domain.ts';
export interface CsvError { row: number; message: string }
/** RFC4180-style parser, including embedded newlines and escaped quotes. */
export function parseCsv(text: string): {headers:string[]; rows:string[][]; errors:CsvError[]} {
  if(text.length>2_000_000)return {headers:[],rows:[],errors:[{row:1,message:'CSV exceeds 2 million characters'}]};
  const records:string[][]=[], errors:CsvError[]=[]; let row:string[]=[], cell='', quoted=false, closed=false;
  text=text.replace(/^\uFEFF/,'');
  const push=()=>{row.push(cell);cell='';closed=false;};
  for(let i=0;i<text.length;i++) { const c=text[i];
    if(cell.length>10000||row.length>50||records.length>10000)return {headers:[],rows:[],errors:[{row:records.length+1,message:'CSV exceeds field, column or 10000-record limit'}]};
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c==='"' && !cell && !closed){quoted=true;continue;}
    if(c===','){push();continue;}
    if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;push();records.push(row);row=[];continue;}
    if(closed || c==='"') errors.push({row:records.length+1,message:'Unexpected character outside quoted field'});
    cell+=c;
  }
  if(quoted)errors.push({row:records.length+1,message:'Unclosed quoted field'});
  if(cell||row.length||closed){push();records.push(row);}
  const headers=(records.shift()??[]).map(x=>x.trim());
  if(new Set(headers).size!==headers.length)errors.push({row:1,message:'Duplicate headers'});
  return {headers,rows:records,errors};
}
export function safeCsvCell(value:unknown):string {let s=String(value??'');if(/^\s*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function toCsv(headers:string[],rows:unknown[][]):string{return [headers,...rows].map(r=>r.map(safeCsvCell).join(',')).join('\r\n');}
export function isHttpsCheckout(value:string):boolean{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
const validDate=(s:string)=>/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
const integer=(s:string)=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s));
const id=(s:string)=>/^[a-zA-Z0-9_-]{1,100}$/.test(s);
export type ImportKind='orders'|'events'|'customers';
const columns:Record<ImportKind,string[]>={orders:['id','customerId','eventId','purchasedAt','status','netCents','updatedAt'],customers:['id','consent'],events:['id','artist','startsAt','timezone','priceCents','currency','status','remaining','inventoryAsOf','catalogVersion','checkoutUrl','genre']};
export interface ImportMetadata {coverageStart?:string;asOf?:string}
export function importCsv(text:string,w:Workspace,kind:ImportKind,metadata:ImportMetadata={}):{workspace:Workspace;errors:CsvError[];imported:number;skipped:number}{
 const p=parseCsv(text), errors=[...p.errors];let imported=0,skipped=0;
 for(const h of columns[kind])if(!p.headers.includes(h))errors.push({row:1,message:`Missing header: ${h}`});
 if(errors.length)return {workspace:w,errors,imported,skipped};
 const asOf=metadata.asOf??w.asOf;
 const coverageStart=metadata.coverageStart??(w.source==='import'?w.coverageStart:undefined);
 if(!validDate(asOf)||(w.source==='import'&&Date.parse(asOf)<Date.parse(w.asOf))||(coverageStart&&(!validDate(coverageStart)||Date.parse(coverageStart)>Date.parse(asOf))))return {workspace:w,errors:[{row:1,message:'Invalid coverage/as-of metadata; as-of must not move backwards'}],imported,skipped};
 const next:Workspace={...w,source:'import',clock:asOf,asOf,coverageStart,orderRevisions:[...(w.orderRevisions??w.orders)],orders:[...w.orders],customers:[...w.customers],events:[...w.events],campaigns:w.campaigns.map(c=>captureOutcomeSnapshots({...w,source:c.source},c))};
 p.rows.forEach((cells,index)=>{if(cells.every(x=>!x.trim()))return;const row=index+2; const r=Object.fromEntries(p.headers.map((h,i)=>[h,cells[i]?.trim()??'']));
 const fail=(message:string)=>errors.push({row,message});
 if(cells.length!==p.headers.length){fail('Column count does not match header');return;}
 if(!id(r.id)){fail('Use a stable pseudonymous ID (letters, digits, underscore or hyphen)');return;}
 let value:Order|Event|Customer;
 if(kind==='orders'){
 if(!id(r.customerId)||!id(r.eventId)||!validDate(r.purchasedAt)||!validDate(r.updatedAt)||!integer(r.netCents)||!['paid','refunded','void'].includes(r.status)||Date.parse(r.updatedAt)<Date.parse(r.purchasedAt)){fail('Invalid order IDs, timestamps, status, or net cents');return;}
 if(!next.customers.some(c=>c.source==='import'&&c.id===r.customerId)||!next.events.some(e=>e.source==='import'&&e.id===r.eventId)){fail('Import the referenced anonymized customer and event first');return;}
 if(Date.parse(r.updatedAt)>Date.parse(asOf)||(coverageStart&&Date.parse(r.purchasedAt)<Date.parse(coverageStart))){fail('Order falls outside declared coverage/as-of times');return;}
 value={...r,netCents:Number(r.netCents),source:'import'} as Order;
 }else if(kind==='customers'){
 if(!['granted','declined','unknown'].includes(r.consent)){fail('Invalid consent');return;}if(r.consentUpdatedAt&&(!validDate(r.consentUpdatedAt)||Date.parse(r.consentUpdatedAt)>Date.parse(asOf))){fail('Invalid consent update timestamp');return;}const unavailableDates=r.unavailableDates?r.unavailableDates.split('|'):undefined;
 if(unavailableDates?.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)||(r.admissionAge&&(!integer(r.admissionAge)||Number(r.admissionAge)>120))){fail('Invalid unavailable dates or admission age');return;}
 value={id:r.id,consent:r.consent,consentUpdatedAt:r.consentUpdatedAt||asOf,unavailableDates,admissionAge:r.admissionAge?Number(r.admissionAge):undefined,source:'import'} as Customer;
 }else{
 try{new Intl.DateTimeFormat('en',{timeZone:r.timezone});}catch{fail('Invalid timezone');return;}
 if(r.currency!=='USD'){fail('This single-venue prototype accepts USD event prices only');return;}
 if(!r.artist||!validDate(r.startsAt)||!validDate(r.inventoryAsOf)||!integer(r.priceCents)||!integer(r.remaining)||!integer(r.catalogVersion)||!['on_sale','sold_out','canceled'].includes(r.status)||! /^[A-Z]{3}$/.test(r.currency)||!isHttpsCheckout(r.checkoutUrl)){fail('Invalid event fields; checkout URL must use HTTPS');return;}
 if(r.minimumAge&&(!integer(r.minimumAge)||Number(r.minimumAge)>120)){fail('Invalid minimum admission age');return;}
 value={...r,minimumAge:r.minimumAge?Number(r.minimumAge):undefined,priceCents:Number(r.priceCents),remaining:Number(r.remaining),catalogVersion:Number(r.catalogVersion),source:'import'} as Event;
 }
 const list=next[kind] as (Order|Event|Customer)[];const pos=list.findIndex(x=>x.id===value.id&&x.source==='import');
 if(pos>=0){const old=list[pos];if(kind==='orders'&&Date.parse((old as Order).updatedAt)>=Date.parse((value as Order).updatedAt)){skipped++;return;}if(kind==='customers'&&Date.parse((old as Customer).consentUpdatedAt??'9999-01-01')>=Date.parse((value as Customer).consentUpdatedAt!)){skipped++;return;}if(kind==='events'&&((value as Event).catalogVersion<(old as Event).catalogVersion||Date.parse((value as Event).inventoryAsOf)<=Date.parse((old as Event).inventoryAsOf))){skipped++;return;}list[pos]=value;}else list.push(value);if(kind==='orders')next.orderRevisions!.push(value as Order);imported++;
 });
 const metadataChanged=w.source==='import'&&(asOf!==w.asOf||coverageStart!==w.coverageStart);
 if(!imported&&(!metadataChanged||errors.length))return {workspace:w,errors,imported,skipped};
 next.campaigns=next.campaigns.map(c=>c.source==='import'?({...captureOutcomeSnapshots(next,c),status:'needs_review'}):c);
 return {workspace:next,errors,imported,skipped};
}
export const importOrdersCsv=(text:string,w:Workspace)=>importCsv(text,w,'orders');
