import { readTextLimited } from './read-text.ts';
/** Server-only Qloo REST adapter. Event credential/host compatibility was live verified on 2026-10-30.
 * Only cultural entity IDs and artist search terms are sent upstream. No customer data.
 */
export type QlooErrorCode = 'unconfigured' | 'invalid_input' | 'auth' | 'rate_limited' | 'timeout' | 'unavailable' | 'malformed_response';
export class QlooError extends Error {
  code: QlooErrorCode;
  constructor(code: QlooErrorCode, message: string) { super(message); this.code = code; this.name = 'QlooError'; }
}
export type ArtistCandidate = { id: string; name: string; types: string[] };
export type Ranking = { mode: 'live' | 'cached_live' | 'not_called'; retrievedAt: string; seedIds: string[]; candidateIds: string[]; ranked: { id: string; rank: number; explanation?: unknown }[]; warning?: string; catalogVersion: string };
const ARTIST = 'urn:entity:artist';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CACHE = 100;
const cache = new Map<string, { expires: number; result: Ranking }>();
const asRecord = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
function ids(values: unknown, name: string, max: number): string[] {
  if (!Array.isArray(values) || values.length > max || values.some(v => typeof v !== 'string' || !ID.test(v))) throw new QlooError('invalid_input', `${name} must contain at most ${max} valid Qloo entity IDs.`);
  return [...new Set((values as string[]).map(x => x.toUpperCase()))];
}
function parseEntity(v: unknown): ArtistCandidate {
  const item = asRecord(v);
  const types = item?.types;
  if (!item || typeof item.entity_id !== 'string' || !ID.test(item.entity_id) || typeof item.name !== 'string' || !Array.isArray(types) || !types.every(t => typeof t === 'string')) throw new QlooError('malformed_response', 'Qloo returned an unrecognized artist record.');
  return { id: item.entity_id.toUpperCase(), name: item.name.slice(0, 200), types };
}
function baseUrl(): string {
  const value = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';
  let url: URL;
  try { url = new URL(value); } catch { throw new QlooError('unconfigured', 'The server Qloo host is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new QlooError('unconfigured', 'The server Qloo host must be a bare HTTPS origin.');
  return url.origin;
}
async function query(path: '/search' | '/v2/insights', params: URLSearchParams, fetcher: typeof fetch = fetch): Promise<unknown> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError('unconfigured', 'Qloo is not configured on this server. Choose sample mode or configure the event credential.');
  const url = new URL(path, baseUrl()); url.search = params.toString();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, { headers: { 'X-Api-Key': key, Accept: 'application/json' }, redirect: 'error', signal: controller.signal, cache: 'no-store' });
    if (response.status === 404 && path === '/search') return { results: [] };
    if (response.status === 401 || response.status === 403) throw new QlooError('auth', 'Qloo rejected the event credential or host.');
    if (response.status === 429) throw new QlooError('rate_limited', 'Qloo rate limit reached. Try later.');
    if (!response.ok) throw new QlooError('unavailable', `Qloo request failed (HTTP ${response.status}).`);
    try { const body = await readTextLimited(response, 2_000_000); return JSON.parse(body); } catch { throw new QlooError('malformed_response', 'Qloo returned invalid or oversized JSON.'); }
  } catch (error) {
    if (error instanceof QlooError) throw error;
    if (controller.signal.aborted) throw new QlooError('timeout', 'Qloo request timed out.');
    throw new QlooError('unavailable', 'Qloo could not be reached.');
  } finally { clearTimeout(timer); }
}
/** Returns candidates for explicit operator confirmation; never auto-confirms identity. */
export async function searchArtist(name: unknown, fetcher?: typeof fetch): Promise<ArtistCandidate[]> {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120 || !/^[\p{L}\p{N} .,'&()!+_-]+$/u.test(name)) throw new QlooError('invalid_input', 'Artist name must be 2–120 characters.');
  const payload = asRecord(await query('/search', new URLSearchParams({ query: name.trim(), types: ARTIST, take: '5' }), fetcher));
  if (!payload || !Array.isArray(payload.results) || payload.results.length > 5) throw new QlooError('malformed_response', 'Qloo search returned an unrecognized response.');
  return payload.results.map(parseEntity).filter(a => a.types.includes(ARTIST));
}
/** Ranks only submitted eligible candidates; upstream output cannot add a new artist. */
export async function rankArtists(input: { seedIds: unknown; candidateIds: unknown; catalogVersion: unknown }, fetcher?: typeof fetch): Promise<Ranking> {
  const seedIds = ids(input.seedIds, 'Seed IDs', 10); const candidateIds = ids(input.candidateIds, 'Candidate IDs', 50);
  if (!seedIds.length) throw new QlooError('invalid_input', 'At least one confirmed seed artist is required.');
  if (typeof input.catalogVersion !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(input.catalogVersion)) throw new QlooError('invalid_input', 'A valid catalog version is required.');
  // No provider call is needed for an empty feasible shortlist.
  if (!candidateIds.length) return { mode: 'not_called', retrievedAt: new Date().toISOString(), seedIds, candidateIds, ranked: [], catalogVersion: input.catalogVersion, warning: 'No eligible candidates; Qloo was not called.' };
  if (!process.env.QLOO_API_KEY) throw new QlooError('unconfigured', 'Qloo is not configured on this server.');
  const cacheKey = JSON.stringify(['live', baseUrl(), input.catalogVersion, [...seedIds].sort(), [...candidateIds].sort()]);
  const found = cache.get(cacheKey);
  if (found && found.expires > Date.now()) return { ...found.result, mode: 'cached_live' };
  const params = new URLSearchParams({ 'filter.type': ARTIST, 'signal.interests.entities': seedIds.join(','), 'filter.results.entities': candidateIds.join(','), 'feature.explainability': 'true', take: String(candidateIds.length) });
  const payload = asRecord(await query('/v2/insights', params, fetcher));
  const results = asRecord(payload?.results);
  if (!results || !Array.isArray(results.entities) || results.entities.length > 50) throw new QlooError('malformed_response', 'Qloo insights returned an unrecognized response.');
  const allowed = new Set(candidateIds); const seen = new Set<string>();
  const ranked: Ranking['ranked'] = [];
  for (const raw of results.entities) {
    const entry = asRecord(raw); const id = typeof entry?.entity_id === 'string' ? entry.entity_id.toUpperCase() : '';
    if (!ID.test(id)) throw new QlooError('malformed_response', 'Qloo insights returned an invalid entity ID.');
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id); const q = asRecord(entry?.query); const explanation = q?.explainability;
    ranked.push({ id, rank: ranked.length + 1, ...(explanation !== undefined ? { explanation } : {}) });
  }
  const meta = asRecord(asRecord(payload?.query)?.explainability);
  const warning = typeof meta?.warning === 'string' ? meta.warning.slice(0, 500) : ranked.some(r => r.explanation === undefined) ? 'Explanation metadata was unavailable for one or more results.' : undefined;
  const result: Ranking = { mode: 'live', retrievedAt: new Date().toISOString(), seedIds, candidateIds, ranked, catalogVersion: input.catalogVersion, ...(warning ? { warning } : {}) };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { expires: Date.now() + 15 * 60 * 1000, result });
  return result;
}
