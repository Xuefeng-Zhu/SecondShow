import { QlooError, rankArtists } from './qloo.ts';
import { PlannerError, runPlanner } from './planner.ts';

type Status = 'on_sale' | 'sold_out' | 'canceled';
type Event = { id: string; artistId: string; startsAt: string; priceCents: number; status: Status; remaining: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const obj = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const invalid = (message: string): never => { throw new QlooError('invalid_input', message); };
function stringList(v: unknown, name: string, pattern: RegExp, limit: number): string[] {
  if (!Array.isArray(v) || v.length > limit || v.some(x => typeof x !== 'string' || !pattern.test(x))) return invalid(`Invalid ${name}.`);
  return [...new Set(v as string[])];
}
function timestamp(v: unknown, name: string): number {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v) || !Number.isFinite(Date.parse(v))) return invalid(`Invalid ${name}; use UTC ISO timestamps.`);
  return Date.parse(v);
}
function validate(input: unknown) {
  const body = obj(input); if (!body) return invalid('Invalid request body.');
  const seedIds = stringList(body.seedIds, 'seed IDs', UUID, 10); if (!seedIds.length) return invalid('A confirmed seed artist is required.');
  if (typeof body.catalogVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(body.catalogVersion)) return invalid('Invalid catalog version.');
  const cutoff = timestamp(body.cutoff, 'cutoff');
  if (!Number.isInteger(body.windowDays) || (body.windowDays as number) < 1 || (body.windowDays as number) > 90) return invalid('Window must be 1–90 days.');
  const windowDays = body.windowDays as number;
  if (body.budgetCents !== null && (!Number.isSafeInteger(body.budgetCents) || (body.budgetCents as number) < 0 || (body.budgetCents as number) > 10000000)) return invalid('Invalid budget.');
  const budget = body.budgetCents === null ? Infinity : body.budgetCents as number;
  const purchased = new Set(stringList(body.purchasedEventIds, 'purchased event IDs', EVENT_ID, 100));
  const rejected = new Set(stringList(body.rejectedEventIds, 'rejected event IDs', EVENT_ID, 100));
  if (!Array.isArray(body.events) || body.events.length > 50) return invalid('At most 50 events are supported.');
  const all: Event[] = body.events.map(item => {
    const e = obj(item);
    if (!e || typeof e.id !== 'string' || !EVENT_ID.test(e.id) || typeof e.artistId !== 'string' || !UUID.test(e.artistId) || !Number.isSafeInteger(e.priceCents) || (e.priceCents as number) < 0 || (e.priceCents as number) > 10000000 || !Number.isSafeInteger(e.remaining) || (e.remaining as number) < 0 || (e.remaining as number) > 10000000 || (e.status !== 'on_sale' && e.status !== 'sold_out' && e.status !== 'canceled')) return invalid('Invalid catalog event.');
    timestamp(e.startsAt, 'event start');
    return { id:e.id, artistId:e.artistId.toUpperCase(), startsAt:e.startsAt as string, priceCents:e.priceCents as number, status:e.status as Status, remaining:e.remaining as number };
  });
  if (new Set(all.map(e => e.id)).size !== all.length) return invalid('Event IDs must be unique.');
  const eligible = all.filter(e => e.status === 'on_sale' && e.remaining > 0 && Date.parse(e.startsAt) > cutoff && Date.parse(e.startsAt) <= cutoff + windowDays * 86400000 && e.priceCents <= budget && !purchased.has(e.id) && !rejected.has(e.id));
  return { seedIds, catalogVersion: body.catalogVersion, eligible };
}
type Dependencies = { rank: typeof rankArtists; plan: typeof runPlanner };
/** One bounded, nonpersonal shortlist. The caller must recheck real workspace facts before applying. */
export async function orchestrateCampaign(input: unknown, dependencies: Dependencies = { rank: rankArtists, plan: runPlanner }) {
  const { seedIds, catalogVersion, eligible } = validate(input);
  const taste = await dependencies.rank({ seedIds, candidateIds: [...new Set(eligible.map(e => e.artistId))], catalogVersion });
  const rankById = new Map(taste.ranked.map(item => [item.id.toUpperCase(), item.rank]));
  const rankedEvents = eligible.filter(event => rankById.has(event.artistId)).sort((a,b) => rankById.get(a.artistId)! - rankById.get(b.artistId)! || Date.parse(a.startsAt)-Date.parse(b.startsAt) || a.priceCents-b.priceCents || a.id.localeCompare(b.id));
  // The model sees generated aliases and ranks, not venue IDs or customer data.
  const aliases = rankedEvents.map((event, index) => ({ eventId: `candidate_${index+1}`, rank: index+1, actualId: event.id }));
  const planner = await dependencies.plan(aliases.map(({eventId,rank}) => ({eventId,rank})));
  const mapping = new Map(aliases.map(x => [x.eventId,x.actualId]));
  if (planner.eventIds.some(id => !mapping.has(id)) || new Set(planner.eventIds).size !== planner.eventIds.length || planner.eventIds.length > 2) throw new PlannerError('malformed_response', 'The planner returned an invalid candidate.');
  return { mode: rankedEvents.length ? 'live' as const : 'not_called' as const, eventIds: planner.eventIds.map(id => mapping.get(id)!), eligibleEventIds: eligible.map(e => e.id), unrankedEventIds: eligible.filter(e => !rankById.has(e.artistId)).map(e => e.id), taste, planner: { mode:planner.mode, progress:planner.progress } };
}
