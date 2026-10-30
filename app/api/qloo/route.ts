import { QlooError, rankArtists, searchArtist } from '../../../src/server/qloo';
import { acquireLive, readJson } from '../../../src/server/live-guard';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const release = await acquireLive(request); if (release instanceof Response) return release;
  try {
    let body: unknown; try { body=await readJson(request,8192); } catch (error) { throw new QlooError('invalid_input',error instanceof Error ? error.message : 'Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new QlooError('invalid_input','Invalid JSON body.');
    const input=body as Record<string,unknown>;
    if (input.operation==='search') return Response.json({candidates:await searchArtist(input.name)},{headers:{'Cache-Control':'no-store'}});
    if (input.operation==='rank') return Response.json(await rankArtists({seedIds:input.seedIds,candidateIds:input.candidateIds,catalogVersion:input.catalogVersion}),{headers:{'Cache-Control':'no-store'}});
    throw new QlooError('invalid_input','Unknown operation.');
  } catch (error) { const issue=error instanceof QlooError ? error : new QlooError('unavailable','Qloo request failed.'); return Response.json({error:{code:issue.code,message:issue.message}},{status:issue.code==='invalid_input' ? 400 : issue.code==='rate_limited' ? 429 : 503,headers:{'Cache-Control':'no-store'}}); }
  finally { await release(); }
}
