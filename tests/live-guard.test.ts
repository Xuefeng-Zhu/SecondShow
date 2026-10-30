import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireLive, readJson } from '../src/server/live-guard.ts';
const save={...process.env};
test('production fails closed without durable quota and uses atomic shared budget when configured',async()=>{
  Object.assign(process.env,{NODE_ENV:'production',ENABLE_LIVE_PROVIDERS:'true',VERCEL:'1',LIVE_ALLOWED_ORIGIN:'https://demo.example',UPSTASH_REDIS_REST_URL:'https://demo.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test',LIVE_IP_HASH_SALT:'x'.repeat(32),LIVE_DAILY_BUDGET:'100'});
  const req=new Request('https://demo.example/api/campaign-plan',{headers:{host:'demo.example',origin:'https://demo.example','x-vercel-forwarded-for':'192.0.2.1'}});
  let body:unknown;
  const fetcher=async (_url:unknown,init?:RequestInit)=>{body=JSON.parse(String(init?.body));return Response.json({result:1});};
  const release=await acquireLive(req,3,fetcher as typeof fetch); assert.equal(typeof release,'function');
  assert.ok(Array.isArray(body)); assert.equal(body[0],'EVAL'); assert.ok(!(JSON.stringify(body)).includes('192.0.2.1'));
  const denied=await acquireLive(req,3,(async()=>Response.json({result:0})) as typeof fetch); assert.ok(denied instanceof Response); assert.equal((denied as Response).status,429);
  delete process.env.UPSTASH_REDIS_REST_TOKEN; const missing=await acquireLive(req,3,fetcher as typeof fetch); assert.ok(missing instanceof Response); assert.equal((missing as Response).status,503);
  process.env=save;
});
test('request body byte limit applies without Content-Length',async()=>{
  const request=new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'x'.repeat(100)})});
  await assert.rejects(readJson(request,30),/too large/);
});
