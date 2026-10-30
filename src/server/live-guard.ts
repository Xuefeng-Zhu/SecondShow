import { isIP } from 'node:net';
/** Live calls are off by default. Production requires a trusted Vercel deployment and
 * an exact same-origin configuration. These checks are not authentication or a usage limit. */
const fail = (code:string,message:string,status:number) => Response.json({error:{code,message}}, {status,headers:{'Cache-Control':'no-store'}});
export async function acquireLive(request: Request): Promise<(() => Promise<void>) | Response> {
  if (process.env.ENABLE_LIVE_PROVIDERS !== 'true') return fail('unconfigured','Live providers are disabled.',503);
  const host = request.headers.get('host') || '', origin = request.headers.get('origin');
  if (process.env.NODE_ENV === 'development') {
    if (!/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host) || origin !== `http://${host}`) return fail('forbidden','A same-origin loopback request is required.',403);
    return async () => {};
  }
  const allowed = process.env.LIVE_ALLOWED_ORIGIN;
  const ip = request.headers.get('x-vercel-forwarded-for');
  if (process.env.VERCEL !== '1' || !allowed) return fail('unconfigured','Live providers require a trusted Vercel deployment and an allowed origin.',503);
  let allowedUrl: URL;
  try { allowedUrl=new URL(allowed); } catch { return fail('unconfigured','Live provider configuration is invalid.',503); }
  if (allowedUrl.protocol !== 'https:' || allowedUrl.origin !== allowed || origin !== allowed || host !== allowedUrl.host || !ip || !isIP(ip)) return fail('forbidden','Live provider request or configuration was not accepted.',403);
  return async () => {};
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
