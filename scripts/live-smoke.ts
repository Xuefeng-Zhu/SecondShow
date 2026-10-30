/** Explicit opt-in only. Never prints credentials or uses customer data. */
import { orchestrateCampaign } from '../src/server/orchestrator.ts';

const required=['QLOO_API_KEY','QLOO_BASE_URL','NEBIUS_API_KEY','NEBIUS_MODEL','QLOO_SMOKE_SEED_ID','QLOO_SMOKE_CANDIDATE_ID'];
const missing=required.filter(name=>!process.env[name]);
if(process.env.RUN_LIVE_SMOKE!=='1'||process.env.CONFIRM_QLOO_HOST!=='1'||missing.length){
  process.stderr.write(`Live smoke not run. Set RUN_LIVE_SMOKE=1 and CONFIRM_QLOO_HOST=1 only after confirming event host instructions and artist identities. Missing variable names: ${missing.join(', ')||'none'}.\n`);
  process.exitCode=2;
}else{
  const now=new Date();
  try{
    const result=await orchestrateCampaign({
      seedIds:[process.env.QLOO_SMOKE_SEED_ID],catalogVersion:'opt-in-smoke-v1',cutoff:now.toISOString(),
      windowDays:10,budgetCents:3000,purchasedEventIds:[],rejectedEventIds:[],
      events:[{id:'smoke_fictional_event',artistId:process.env.QLOO_SMOKE_CANDIDATE_ID,startsAt:new Date(now.getTime()+5*86400000).toISOString(),priceCents:2500,status:'on_sale',remaining:1}],
    });
    if(result.mode!=='live'||result.planner.mode!=='live_model'||!result.eventIds.includes('smoke_fictional_event'))throw new Error('No ranked candidate/model proposal was returned; full live smoke is not passed.');
    process.stdout.write(JSON.stringify({status:'passed',taste:result.taste.mode,retrievedAt:result.taste.retrievedAt,planner:result.planner.mode,modelProvider:'Nebius Token Factory',progress:result.planner.progress,warning:result.taste.warning??null,note:'Nonpersonal fictional catalog smoke; no message sent or payment performed.'},null,2)+'\n');
  }catch{
    // Deliberately omit upstream details and all environment values.
    process.stderr.write('Live smoke failed. Check server configuration and provider error evidence through the application. No fixture fallback was used.\n');
    process.exitCode=1;
  }
}
