import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { runPlanner, PlannerError } from '../src/server/planner.ts';
const previous = process.env.NEBIUS_API_KEY;
process.env.NEBIUS_API_KEY = 'test-only';
const previousModel = process.env.NEBIUS_MODEL; process.env.NEBIUS_MODEL = 'org/test-model';
after(() => { if (previousModel === undefined) delete process.env.NEBIUS_MODEL; else process.env.NEBIUS_MODEL = previousModel; if (previous === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = previous; });
const candidates = [{eventId:'event-b',rank:2},{eventId:'event-a',rank:1}];
const call = (name:string,args:unknown) => ({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{type:'function',id:'call-1',function:{name,arguments:JSON.stringify(args)}}]}}]});
test('bounded agent executes inspect then proposal and preserves deterministic rank order', async () => {
  let requests = 0;
  const mock = async (_url: unknown, init?: RequestInit) => {
    assert.equal(_url,'https://api.tokenfactory.nebius.com/v1/chat/completions'); assert.equal(init?.redirect,'error'); assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-only'); requests++; const payload = JSON.parse(String(init?.body));
    assert.equal(payload.model,'org/test-model'); assert.equal(payload.max_tokens,400); assert.equal(payload.store, false); assert.equal(payload.parallel_tool_calls, false);
    if (requests === 2) assert.equal(payload.messages.at(-1).tool_call_id,'call-1');
    return Response.json(requests === 1 ? call('inspect_candidates',{}) : call('propose_events',{event_ids:['event-b','event-a']}));
  };
  const result = await runPlanner(candidates, mock as typeof fetch);
  assert.deepEqual(result.eventIds,['event-a','event-b']); assert.equal(requests,2); assert.equal(result.mode,'live_model');
});
test('rejects invented IDs and makes no request for empty shortlist', async () => {
  let calls=0;
  const mock = async () => { calls++; return Response.json(calls === 1 ? call('inspect_candidates',{}) : call('propose_events',{event_ids:['invented']})); };
  await assert.rejects(runPlanner(candidates,mock as typeof fetch), (e: unknown) => e instanceof PlannerError && e.code === 'malformed_response');
  calls=0; const empty = await runPlanner([],mock as typeof fetch); assert.equal(empty.mode,'not_called'); assert.equal(calls,0);
});
test('does not silently fall back after authentication failure', async () => {
  await assert.rejects(runPlanner(candidates,(async()=>new Response('',{status:401})) as typeof fetch), (e: unknown) => e instanceof PlannerError && e.code === 'auth');
});
test('configuration and input errors make no requests', async () => {
  let count=0; const mock=(async()=>{count++; throw Error('must not run');}) as typeof fetch;
  const saved=process.env.NEBIUS_MODEL; delete process.env.NEBIUS_MODEL;
  try { await assert.rejects(runPlanner(candidates,mock), (e:unknown)=>e instanceof PlannerError && e.code==='unconfigured'); }
  finally {process.env.NEBIUS_MODEL=saved;}
  await assert.rejects(runPlanner([{eventId:'bad id',rank:1}],mock)); assert.equal(count,0);
});
test('rejects unexpected, duplicate and parallel tool calls and truncated responses', async () => {
  const parallel=call('inspect_candidates',{}); parallel.choices[0].message.tool_calls.push(parallel.choices[0].message.tool_calls[0]);
  const truncated={...call('inspect_candidates',{})}; truncated.choices[0].finish_reason='length';
  for (const payload of [call('propose_events',{event_ids:[]}),call('inspect_candidates',{extra:true}),parallel,truncated,{}, {choices:[]}]) {
    await assert.rejects(runPlanner(candidates,(async()=>Response.json(payload)) as typeof fetch),(e:unknown)=>e instanceof PlannerError && e.code==='malformed_response');
  }
  let count=0;
  await assert.rejects(runPlanner(candidates,(async()=>Response.json(++count===1?call('inspect_candidates',{}):call('propose_events',{event_ids:['event-a','event-a']}))) as typeof fetch)); assert.equal(count,2);
});
test('malformed and oversized responses and transport failures expose no raw message', async () => {
  for (const body of ['secret model content',' '.repeat(200001)]) {
    await assert.rejects(runPlanner(candidates,(async()=>new Response(body)) as typeof fetch),(e:unknown)=>e instanceof PlannerError && e.code==='malformed_response' && !e.message.includes('secret'));
  }
  for (const status of [403,429,500]) {
    let count=0;
    await assert.rejects(runPlanner(candidates,(async()=>{count++; return new Response('secret',{status});}) as typeof fetch),(e:unknown)=>e instanceof PlannerError && e.code===(status===403?'auth':status===429?'rate_limited':'unavailable') && !e.message.includes('secret')); assert.equal(count,1);
  }
  await assert.rejects(runPlanner(candidates,(async()=>{throw Error('secret');}) as typeof fetch),(e:unknown)=>e instanceof PlannerError && e.code==='unavailable' && !e.message.includes('secret'));
});
test('timeout aborts the only request without retrying', async (t) => {
  t.mock.timers.enable({apis:['setTimeout']});
  let count=0;
  const pending=runPlanner(candidates,(async (_url:unknown,init?:RequestInit)=>{
    count++;
    return await new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('private transport detail')),{once:true}));
  }) as typeof fetch);
  const rejection=assert.rejects(pending,(e:unknown)=>e instanceof PlannerError && e.code==='timeout' && !e.message.includes('private'));
  t.mock.timers.tick(12001);
  await rejection;
  assert.equal(count,1);
});
test('legacy OpenAI configuration cannot substitute for missing Nebius key', async () => {
  const key=process.env.NEBIUS_API_KEY;
  const legacy=process.env.OPENAI_API_KEY;
  delete process.env.NEBIUS_API_KEY;
  process.env.OPENAI_API_KEY='legacy-test-only';
  let count=0;
  try {
    await assert.rejects(runPlanner(candidates,(async()=>{count++; throw Error('must not request');}) as typeof fetch),(e:unknown)=>e instanceof PlannerError && e.code==='unconfigured');
    assert.equal(count,0);
  } finally {
    if(key===undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY=key;
    if(legacy===undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY=legacy;
  }
});
