import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateCampaign } from '../src/server/orchestrator.ts';
import type { rankArtists } from '../src/server/qloo.ts';
const seed='70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C', a='C71B6CCE-3F05-4A57-AA84-9D2C2B4D67C5', b='E5CBD5F7-B29C-48F7-A488-CE71EF9C4FDE';
const initial={seedIds:[seed],catalogVersion:'v1',cutoff:'2026-10-01T00:00:00.000Z',windowDays:30,budgetCents:5000,purchasedEventIds:['bought'],rejectedEventIds:['rejected'],events:[{id:'first',artistId:a,startsAt:'2026-10-10T00:00:00.000Z',priceCents:3000,status:'on_sale',remaining:5},{id:'second',artistId:b,startsAt:'2026-10-12T00:00:00.000Z',priceCents:4000,status:'on_sale',remaining:4},{id:'bought',artistId:a,startsAt:'2026-10-13T00:00:00.000Z',priceCents:3000,status:'on_sale',remaining:2},{id:'rejected',artistId:b,startsAt:'2026-10-14T00:00:00.000Z',priceCents:3000,status:'on_sale',remaining:2},{id:'sold',artistId:b,startsAt:'2026-10-15T00:00:00.000Z',priceCents:3000,status:'sold_out',remaining:0}]};
test('full orchestration filters eligibility, ranks, aliases model inputs and maps suggestions back',async()=>{
  let calls=0;
  const rank=async (input:Parameters<typeof rankArtists>[0])=>{calls++; assert.deepEqual(input.candidateIds,[a,b]); return {mode:'live' as const,retrievedAt:'2026-10-01T01:00:00Z',seedIds:[seed],candidateIds:[a,b],ranked:[{id:b,rank:1}],catalogVersion:'v1',warning:'No explanation available'};};
  const plan=async (input:unknown)=>{calls++; assert.deepEqual(input,[{eventId:'candidate_1',rank:1}]); return {mode:'live_model',eventIds:['candidate_1'],progress:['inspected','proposed']};};
  const result=await orchestrateCampaign(initial,{rank,plan});
  assert.deepEqual(result.eventIds,['second']); assert.deepEqual(result.unrankedEventIds,['first']); assert.equal(result.taste.warning,'No explanation available'); assert.equal(calls,2);
});
test('provider errors surface and out-of-shortlist model results are rejected',async()=>{
  const rank=async()=>({mode:'live' as const,retrievedAt:'2026-10-01T01:00:00Z',seedIds:[seed],candidateIds:[a],ranked:[{id:a,rank:1}],catalogVersion:'v1'});
  await assert.rejects(orchestrateCampaign(initial,{rank,plan:async()=>({mode:'live_model',eventIds:['invented'],progress:[]})}),/invalid candidate/);
  await assert.rejects(orchestrateCampaign(initial,{rank:async()=>{throw new Error('provider failed');},plan:async()=>({mode:'live_model',eventIds:[],progress:[]})}),/provider failed/);
});

test('full mocked HTTP chain validates Qloo response and model tool calls',async()=>{
  const {rankArtists}=await import('../src/server/qloo.ts');
  const {runPlanner}=await import('../src/server/planner.ts');
  const beforeQ=process.env.QLOO_API_KEY, beforeO=process.env.NEBIUS_API_KEY, beforeM=process.env.NEBIUS_MODEL;
  process.env.QLOO_API_KEY='test'; process.env.NEBIUS_API_KEY='placeholder-nebius-key'; process.env.NEBIUS_MODEL='provider/test-model';
  try {
    let qlooCalls=0, modelCalls=0;
    const qloo=async (url:unknown)=>{qlooCalls++; const u=new URL(String(url)); assert.equal(u.searchParams.get('filter.results.entities'),`${a},${b}`); return Response.json({results:{entities:[{entity_id:b,query:{explainability:{}}},{entity_id:a,query:{explainability:{}}}]}});};
    const model=async (url:unknown,init?:RequestInit)=>{
      modelCalls++;
      assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer placeholder-nebius-key');
      const body=JSON.parse(String(init?.body));
      assert.equal(body.model,'provider/test-model');
      const serialized=JSON.stringify(body);
      for (const privateValue of [seed,a,b,'first','second','bought','rejected','buyer-','customerId','order-']) assert.ok(!serialized.includes(privateValue),`Model request leaked ${privateValue}`);
      assert.equal(body.tools[0].type,'function');
      assert.equal(body.tools[0].function.name,'inspect_candidates');
      if(modelCalls===2){
        const assistant=body.messages.find((message:{role:string})=>message.role==='assistant');
        const tool=body.messages.find((message:{role:string})=>message.role==='tool');
        assert.equal(assistant.tool_calls[0].id,'call-1');
        assert.equal(tool.tool_call_id,'call-1');
        assert.deepEqual(JSON.parse(tool.content),{candidates:[{eventId:'candidate_1',rank:1},{eventId:'candidate_2',rank:2}]});
      }
      return Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:`call-${modelCalls}`,type:'function',function:{name:modelCalls===1?'inspect_candidates':'propose_events',arguments:JSON.stringify(modelCalls===1?{}:{event_ids:['candidate_1']})}}]}}]});
    };
    const input={...initial,catalogVersion:'full-http-test'};
    const result=await orchestrateCampaign(input,{rank:input=>rankArtists(input,qloo as typeof fetch),plan:input=>runPlanner(input,model as typeof fetch)});
    assert.deepEqual(result.eventIds,['second']); assert.equal(qlooCalls,1); assert.equal(modelCalls,2); assert.equal(result.taste.mode,'live'); assert.equal(result.planner.mode,'live_model');
  } finally { if(beforeQ===undefined) delete process.env.QLOO_API_KEY; else process.env.QLOO_API_KEY=beforeQ; if(beforeO===undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY=beforeO; if(beforeM===undefined) delete process.env.NEBIUS_MODEL; else process.env.NEBIUS_MODEL=beforeM; }
});
