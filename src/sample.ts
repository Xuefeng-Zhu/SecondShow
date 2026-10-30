import type { Customer, Event, Order, Workspace } from './domain';

/** Fictional appearances, inventory, buyers, and orders. Artists are real; bookings are not. */
export function createSampleWorkspace(now = new Date()): Workspace {
  const base = now.getTime();
  const date = (days: number) => new Date(base + days * 86400000).toISOString();
  const clock = now.toISOString();
  const rows: [string,string,number,number,string,Event['status'],number][] = [
    ['past-1','Japanese Breakfast',-10,2500,'indie','on_sale',0],
    ['past-2','Khruangbin',-9,3000,'soul','on_sale',0],
    ['show-1','Alvvays',5,2800,'indie','on_sale',42],
    ['show-2','The War on Drugs',8,3600,'indie','on_sale',23],
    ['show-3','Men I Trust',11,3200,'soul','on_sale',18],
    ['show-4','Big Thief',14,3400,'indie','on_sale',31],
    ['show-5','BADBADNOTGOOD',17,3000,'soul','on_sale',12],
    ['show-6','Fleet Foxes',20,3900,'folk','on_sale',14],
    ['show-7','Waxahatchee',23,2700,'folk','on_sale',25],
    ['show-8','Mitski',26,4000,'indie','on_sale',9],
    ['show-9','Unknown Local Act',28,2200,'other','on_sale',20],
    ['show-10','Angel Olsen',9,3100,'indie','sold_out',0],
    ['show-11','Spoon',12,3300,'indie','canceled',30],
    ['show-12','Beach House',40,3500,'indie','on_sale',10]
  ];
  const events: Event[] = rows.map(([id,artist,days,priceCents,genre,status,remaining])=>({id,artist,startsAt:date(days),timezone:'America/Los_Angeles',priceCents,currency:'USD',genre,status,remaining,inventoryAsOf:clock,catalogVersion:1,source:'sample'}));
  const customers: Customer[] = Array.from({length:24},(_,i)=>({id:`buyer-${String(i+1).padStart(2,'0')}`,consent:i===20?'unknown':i===21?'declined':'granted',budgetCents:i===19?1000:undefined,source:'sample'}));
  const orders: Order[] = customers.map((c,i)=>({id:`order-${i+1}`,customerId:c.id,eventId:i%3===0?'past-2':'past-1',purchasedAt:date(i<15?-20:-12),status:i===22?'refunded':'paid',netCents:i===22?0:2500,source:'sample',updatedAt:clock}));
  orders.push({...orders[0],id:'extra-ticket-same-show'});
  orders.push({id:'repeat-order',customerId:'buyer-02',eventId:'past-2',purchasedAt:date(-10),status:'paid',netCents:3000,source:'sample',updatedAt:clock});
  orders.push({id:'void-order',customerId:'buyer-23',eventId:'past-2',purchasedAt:date(-10),status:'void',netCents:0,source:'sample',updatedAt:clock});
  return {source:'sample',clock,asOf:clock,coverageStart:date(-60),events,customers,orders,orderRevisions:orders.map(o=>({...o})),campaigns:[],feedback:[],clicks:[]};
}
