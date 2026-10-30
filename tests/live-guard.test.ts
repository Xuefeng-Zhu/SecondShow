import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquireLive, readJson } from '../src/server/live-guard.ts';
const save={...process.env};
test('production permits a configured same-origin request without Redis and rejects untrusted requests',async()=>{
  try {
    Object.assign(process.env,{NODE_ENV:'production',ENABLE_LIVE_PROVIDERS:'true',VERCEL:'1',LIVE_ALLOWED_ORIGIN:'https://demo.example'});
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const request=(origin:string, host='demo.example', ip='192.0.2.1')=>new Request('https://demo.example/api/campaign-plan',{headers:{host,origin,'x-vercel-forwarded-for':ip}});
    assert.equal(typeof await acquireLive(request('https://demo.example')),'function');
    for (const req of [request('https://evil.example'),request('https://demo.example','evil.example'),request('https://demo.example','demo.example','invalid')]) {
      const denied=await acquireLive(req); assert.ok(denied instanceof Response); assert.equal(denied.status,403);
    }
    delete process.env.VERCEL;
    const unconfigured=await acquireLive(request('https://demo.example')); assert.ok(unconfigured instanceof Response); assert.equal(unconfigured.status,503);
    process.env.VERCEL='1'; process.env.ENABLE_LIVE_PROVIDERS='false';
    const disabled=await acquireLive(request('https://demo.example')); assert.ok(disabled instanceof Response); assert.equal(disabled.status,503);
  } finally { process.env=save; }
});
test('development permits loopback only',async()=>{
  try {
    Object.assign(process.env,{NODE_ENV:'development',ENABLE_LIVE_PROVIDERS:'true'});
    const good=new Request('http://localhost:3000/api/qloo',{headers:{host:'localhost:3000',origin:'http://localhost:3000'}});
    assert.equal(typeof await acquireLive(good),'function');
    const bad=new Request('http://localhost:3000/api/qloo',{headers:{host:'localhost:3000',origin:'https://evil.example'}});
    const denied=await acquireLive(bad); assert.ok(denied instanceof Response); assert.equal(denied.status,403);
  } finally { process.env=save; }
});
test('request body byte limit applies without Content-Length',async()=>{
  const request=new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({value:'x'.repeat(100)})});
  await assert.rejects(readJson(request,30),/too large/);
});
