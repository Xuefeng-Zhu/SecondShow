/** The model accepts only server-generated aliases through /api/campaign-plan. */
export async function POST() {
  return Response.json({error:{code:'forbidden',message:'Use the campaign planning workflow.'}},{status:403,headers:{'Cache-Control':'no-store'}});
}
