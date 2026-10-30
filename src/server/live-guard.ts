import { readTextLimited } from './read-text.ts';
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
/** Live calls are off by default. Production additionally requires a Vercel trusted client IP,
 * configured same-origin allowlist, and atomic shared Upstash quotas; errors fail closed.
 * Local development must bind the server to 127.0.0.1. */
let started = Date.now(), used = 0, active = 0;
const LUA = `local cost=tonumber(ARGV[1]); local daymax=tonumber(ARGV[2]); local ratemax=tonumber(ARGV[3]); local now=tonumber(ARGV[4]); redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',now); if redis.call('ZCARD',KEYS[3])>=2 then return 0 end; local day=tonumber(redis.call('GET',KEYS[1]) or '0'); local rate=tonumber(redis.call('GET',KEYS[2]) or '0'); if day+cost>daymax or rate+cost>ratemax then return 0 end; redis.call('INCRBY',KEYS[1],cost); if day==0 then redis.call('EXPIRE',KEYS[1],86400) end; redis.call('INCRBY',KEYS[2],cost); if rate==0 then redis.call('EXPIRE',KEYS[2],60) end; redis.call('ZADD',KEYS[3],now+45000,ARGV[5]); redis.call('EXPIRE',KEYS[3],60); return 1`;
const fail = (code:string,message:string,status:number) => Response.json({error:{code,message}}, {status,headers:{'Cache-Control':'no-store'}});
export async function acquireLive(request: Request, cost: number, fetcher: typeof fetch = fetch): Promise<(() => Promise<void>) | Response> {
  if (process.env.ENABLE_LIVE_PROVIDERS !== 'true') return fail('unconfigured','Live providers are disabled.',503);
  const host = request.headers.get('host') || '', origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'development') {
    if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host) || origin !== `http://${host}`) return fail('forbidden','A same-origin loopback request is required.',403);
    if (Date.now()-started >= 60_000) { started=Date.now(); used=0; }
    if (active >= 2 || used + cost > 9) return fail('rate_limited','The local provider budget is exhausted. Try later.',429);
    active++; used += cost; let released=false;
    return async () => { if (!released) { active--; released=true; } };
  }
  const allowed = process.env.LIVE_ALLOWED_ORIGIN, url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN, salt = process.env.LIVE_IP_HASH_SALT, budget = Number(process.env.LIVE_DAILY_BUDGET);
  const ip = request.headers.get('x-vercel-forwarded-for');
  if (process.env.VERCEL !== '1' || !allowed || !url || !token || !salt || salt.length < 32 || !Number.isSafeInteger(budget) || budget < 1 || budget > 10000) return fail('unconfigured','Live providers require a configured shared quota and trusted Vercel deployment.',503);
  let allowedUrl: URL, redisUrl: URL;
  try { allowedUrl=new URL(allowed); redisUrl=new URL(url); } catch { return fail('unconfigured','Live provider configuration is invalid.',503); }
  if (allowedUrl.protocol !== 'https:' || allowedUrl.origin !== allowed || origin !== allowed || host !== allowedUrl.host || redisUrl.protocol !== 'https:' || !redisUrl.hostname.endsWith('.upstash.io') || redisUrl.username || redisUrl.password || redisUrl.pathname !== '/' || redisUrl.search || redisUrl.hash || !ip || !isIP(ip)) return fail('forbidden','Live provider request or configuration was not accepted.',403);
  const client = createHash('sha256').update(salt).update('\0').update(ip).digest('hex');
  const now = new Date(); const day = now.toISOString().slice(0,10); const minute = Math.floor(now.getTime()/60000); const lease=randomUUID(); const leaseKey=`secondshow:active:${client}`;
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),3000);
  try {
    const response = await fetcher(redisUrl.origin, {method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['EVAL',LUA,3,`secondshow:daily:${day}`,`secondshow:client:${client}:${minute}`,leaseKey,cost,budget,9,now.getTime(),lease]),redirect:'error',signal:controller.signal,cache:'no-store'});
    if (!response.ok) return fail('unavailable','The shared quota service is unavailable.',503);
    const text=await readTextLimited(response,4096);
    const data:unknown=JSON.parse(text);
    if (!data || typeof data!=='object' || !('result' in data) || ((data as {result:unknown}).result !== 0 && (data as {result:unknown}).result !== 1)) return fail('unavailable','The shared quota service returned an invalid response.',503);
    if ((data as {result:number}).result===0) return fail('rate_limited','The shared provider budget is exhausted. Try later.',429);
    return async () => { const cleanup=new AbortController(); const timeout=setTimeout(()=>cleanup.abort(),3000); try { await fetcher(redisUrl.origin,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(['ZREM',leaseKey,lease]),redirect:'error',signal:cleanup.signal,cache:'no-store'}); } catch { /* Lease expires automatically. */ } finally { clearTimeout(timeout); } };
  } catch { return fail('unavailable','The shared quota service is unavailable.',503); } finally { clearTimeout(timer); }
}
/** Limit actual bytes even when Content-Length is missing or inaccurate. */
export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('Expected JSON.');
  const length = request.headers.get('content-length'); if (length && (!/^\d+$/.test(length) || Number(length)>maxBytes)) throw new Error('Request too large.');
  const reader = request.body?.getReader(); if (!reader) throw new Error('A JSON body is required.');
  const chunks: Uint8Array[]=[]; let total=0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_,reject) => {timer=setTimeout(()=>reject(new Error('Request body timed out.')),5000);});
  try {
    while (true) { const {done,value} = await Promise.race([reader.read(), deadline]); if (done) break; total+=value.length; if (total>maxBytes) { await reader.cancel(); throw new Error('Request too large.'); } chunks.push(value); }
  } catch (error) { void reader.cancel(); throw error; } finally { clearTimeout(timer); }
  const bytes = new Uint8Array(total); let offset=0; for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); } catch { throw new Error('Invalid JSON body.'); }
}
