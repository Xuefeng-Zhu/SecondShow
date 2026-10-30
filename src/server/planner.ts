import { readTextLimited } from './read-text.ts';
/** Bounded Nebius Chat Completions agent. Inputs are public event IDs and ranks only; no customer data.
 * The result is a suggestion, never an approval or an eligibility decision.
 * A bounded live test verified this account and configured model on 2026-10-30.
 */
export class PlannerError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; this.name = 'PlannerError'; }
}
type Candidate = { eventId: string; rank: number };
const tools = [
  { type: 'function', name: 'inspect_candidates', description: 'Inspect the prefiltered, ranked event IDs.', strict: true, parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } },
  { type: 'function', name: 'propose_events', description: 'Propose at most two event IDs from the inspected list, keeping rank order.', strict: true, parameters: { type: 'object', properties: { event_ids: { type: 'array', items: { type: 'string' }, maxItems: 2 } }, required: ['event_ids'], additionalProperties: false } },
].map(({ type, ...fn }) => ({ type, function: fn }));
const record = (x: unknown): Record<string, unknown> | null => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null;
function validateCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value) || value.length > 50) throw new PlannerError('invalid_input', 'At most 50 candidates are allowed.');
  const list = value.map(item => {
    const candidate = record(item);
    if (!candidate || typeof candidate.eventId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(candidate.eventId) || !Number.isInteger(candidate.rank) || (candidate.rank as number) < 1 || (candidate.rank as number) > 50) throw new PlannerError('invalid_input', 'Invalid candidate.');
    return { eventId: candidate.eventId, rank: candidate.rank as number };
  });
  if (new Set(list.map(c => c.eventId)).size !== list.length) throw new PlannerError('invalid_input', 'Candidate IDs must be unique.');
  return list.sort((a,b) => a.rank - b.rank || a.eventId.localeCompare(b.eventId));
}
function plannerConfig() {
  const key = process.env.NEBIUS_API_KEY;
  const model = process.env.NEBIUS_MODEL;
  if (!key || !key.trim() || /[\r\n]/.test(key) || !model || !/^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,199}$/.test(model)) throw new PlannerError('unconfigured', 'The Nebius planner requires valid NEBIUS_API_KEY and explicit NEBIUS_MODEL server configuration.');
  return { key, model };
}
export function assertPlannerConfigured(): void { plannerConfig(); }
export async function runPlanner(value: unknown, fetcher: typeof fetch = fetch) {
  const candidates = validateCandidates(value);
  if (!candidates.length) return { mode: 'not_called', eventIds: [], progress: ['No feasible candidate IDs were supplied.'] };
  const { key, model } = plannerConfig();
  const input: unknown[] = [{ role: 'user', content: 'Inspect the candidates, then propose up to two IDs in rank order. Never infer facts or add IDs.' }];
  const progress: string[] = [];
  for (let step = 0; step < 2; step++) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetcher('https://api.tokenfactory.nebius.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: input, tools, tool_choice: { type: 'function', function: { name: step === 0 ? 'inspect_candidates' : 'propose_events' } }, parallel_tool_calls: false, store: false, max_tokens: 400 }), signal: controller.signal, cache: 'no-store', redirect: 'error' });
    } catch { clearTimeout(timer); throw new PlannerError(controller.signal.aborted ? 'timeout' : 'unavailable', controller.signal.aborted ? 'The planner timed out.' : 'The planner could not be reached.'); }
    if (!response.ok) { clearTimeout(timer); throw new PlannerError(response.status === 429 ? 'rate_limited' : response.status === 401 || response.status === 403 ? 'auth' : 'unavailable', `The live planner request failed (HTTP ${response.status}).`); }
    let payload: Record<string, unknown> | null;
    try { const body = await readTextLimited(response, 200_000); payload = record(JSON.parse(body)); } catch { throw new PlannerError(controller.signal.aborted ? 'timeout' : 'malformed_response', controller.signal.aborted ? 'The planner timed out.' : 'The planner returned invalid or oversized JSON.'); } finally { clearTimeout(timer); }
    const choices = payload?.choices;
    const choice = Array.isArray(choices) && choices.length === 1 ? record(choices[0]) : null;
    const message = record(choice?.message);
    const calls = message?.tool_calls;
    if (choice?.finish_reason !== 'tool_calls' || message?.role !== 'assistant' || (message.content !== null && message.content !== undefined && message.content !== '') || !Array.isArray(calls) || calls.length !== 1) throw new PlannerError('malformed_response', 'The planner did not return exactly one complete tool call.');
    const wireCall = record(calls[0]);
    const call = record(wireCall?.function);
    if (!call || wireCall?.type !== 'function' || typeof wireCall.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(wireCall.id) || typeof call.arguments !== 'string') throw new PlannerError('malformed_response', 'The planner returned an invalid tool call.');
    let args: Record<string, unknown> | null;
    try { args = record(JSON.parse(call.arguments)); } catch { throw new PlannerError('malformed_response', 'The planner returned invalid tool arguments.'); }
    if (step === 0 && call.name === 'inspect_candidates' && args && Object.keys(args).length === 0) {
      progress.push(`Inspected ${candidates.length} prefiltered candidates.`);
      input.push({ role: 'assistant', content: null, tool_calls: [{ id: wireCall.id, type: 'function', function: { name: 'inspect_candidates', arguments: '{}' } }] }, { role: 'tool', tool_call_id: wireCall.id, content: JSON.stringify({ candidates }) });
      continue;
    }
    if (step === 1 && call.name === 'propose_events' && args && Object.keys(args).length === 1 && Array.isArray(args.event_ids)) {
      const selected = args.event_ids;
      const allowed = new Set(candidates.map(c => c.eventId));
      if (selected.length > 2 || selected.some(id => typeof id !== 'string' || !allowed.has(id)) || new Set(selected).size !== selected.length) throw new PlannerError('malformed_response', 'The planner proposed IDs outside the supplied shortlist.');
      const ordered = candidates.filter(c => selected.includes(c.eventId)).map(c => c.eventId);
      progress.push(`Proposed ${ordered.length} candidate events for deterministic revalidation.`);
      return { mode: 'live_model', eventIds: ordered, progress };
    }
    throw new PlannerError('malformed_response', 'The planner requested an unexpected tool or invalid arguments.');
  }
  throw new PlannerError('unavailable', 'The planner exceeded its tool-call budget.');
}
