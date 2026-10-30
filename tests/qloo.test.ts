import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { searchArtist, rankArtists, QlooError } from '../src/server/qloo.ts';
const oldKey = process.env.QLOO_API_KEY;
process.env.QLOO_API_KEY = 'test-only';
after(() => { if (oldKey === undefined) delete process.env.QLOO_API_KEY; else process.env.QLOO_API_KEY = oldKey; });
const a='70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C', b='C71B6CCE-3F05-4A57-AA84-9D2C2B4D67C5', c='E5CBD5F7-B29C-48F7-A488-CE71EF9C4FDE';
const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
test('search returns artist candidates for operator selection and rejects malformed responses', async () => {
  const matches = await searchArtist('Artist', ok({ results: [{ entity_id: a, name: 'Artist', types: ['urn:entity:artist'] }, { entity_id: b, name: 'Album', types: ['urn:entity:album'] }] }) as typeof fetch);
  assert.deepEqual(matches.map(x => x.id), [a]);
  await assert.rejects(searchArtist('Artist', ok({ results: [{ name: 'Unknown' }] }) as typeof fetch), (e: unknown) => e instanceof QlooError && e.code === 'malformed_response');
});
test('rank deduplicates inputs, intersects output, and preserves warning', async () => {
  let requested='';
  const mock = async (url: string | URL | Request) => { requested=String(url); return new Response(JSON.stringify({ results: { entities: [{entity_id:b}, {entity_id:c}, {entity_id:b}] }, query: { explainability: { warning: 'explanation unavailable' } } }), { status:200 }); };
  const result = await rankArtists({seedIds:[a,a],candidateIds:[b,b],catalogVersion:'test-rank'}, mock as typeof fetch);
  assert.deepEqual(result.ranked.map(r=>r.id),[b]);
  assert.equal(new URL(requested).searchParams.get('take'), '1');
  assert.equal(new URL(requested).searchParams.get('signal.interests.entities'), a);
  assert.equal(result.warning, 'explanation unavailable');
  assert.equal((await rankArtists({seedIds:[a],candidateIds:[b],catalogVersion:'test-rank'}, mock as typeof fetch)).mode, 'cached_live');
});
test('empty shortlist skips provider, malformed IDs and error statuses stay honest', async () => {
  let called = false;
  const never = async () => { called = true; throw new Error('must not call'); };
  const empty = await rankArtists({seedIds:[a],candidateIds:[],catalogVersion:'empty'}, never as typeof fetch);
  assert.equal(called, false); assert.equal(empty.mode,'not_called');
  await assert.rejects(rankArtists({seedIds:[a],candidateIds:['not-an-id'],catalogVersion:'bad'}, never as typeof fetch), (e: unknown) => e instanceof QlooError && e.code === 'invalid_input');
  for (const [status,code] of [[401,'auth'],[429,'rate_limited'],[500,'unavailable']] as const) {
    await assert.rejects(searchArtist('Artist', (async()=>new Response('',{status})) as typeof fetch), (e: unknown) => e instanceof QlooError && e.code === code);
  }
});

test('a stalled upstream request times out without retry or fixture fallback', async context => {
  context.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  const stalled: typeof fetch = async (_input,init) => {
    calls++;
    return new Promise<Response>((_resolve,reject) => {
      init?.signal?.addEventListener('abort',()=>reject(new Error('upstream aborted')),{once:true});
    });
  };
  const result=searchArtist('Timeout Artist',stalled);
  context.mock.timers.tick(8000);
  await assert.rejects(result,(error:unknown)=>error instanceof QlooError&&error.code==='timeout');
  assert.equal(calls,1);
});
