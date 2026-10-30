import { orchestrateCampaign } from '../../../src/server/orchestrator';
import { QlooError } from '../../../src/server/qloo';
import { PlannerError, assertPlannerConfigured } from '../../../src/server/planner';
import { acquireLive, readJson } from '../../../src/server/live-guard';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const release = await acquireLive(request); if (release instanceof Response) return release;
  try {
    let input: unknown; try { input = await readJson(request); } catch (error) { return Response.json({error:{code:'invalid_input',message:error instanceof Error ? error.message : 'Invalid request.'}},{status:400}); }
    if (!process.env.QLOO_API_KEY) throw new PlannerError('unconfigured','The Qloo server credential is required for live planning.');
    assertPlannerConfigured();
    return Response.json(await orchestrateCampaign(input), {headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    const issue = error instanceof QlooError || error instanceof PlannerError ? error : new PlannerError('unavailable','Live planning failed.');
    return Response.json({error:{code:issue.code,message:issue.message}}, {status:issue.code==='invalid_input' ? 400 : issue.code==='rate_limited' ? 429 : 503,headers:{'Cache-Control':'no-store'}});
  } finally { await release(); }
}
