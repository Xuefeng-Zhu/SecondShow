'use client';

import { useRef, useState, useEffect } from 'react';
import { Workspace, Campaign, feasibleEvents, eligibleBuyers } from './domain';
import styles from './LiveTaste.module.css';
type Match = {
  id: string;
  name: string;
  types: string[];
};
export default function LiveTaste({
  workspace: w,
  onWorkspaceChange,
  campaign: c,
  onCampaignChange,
  liveMode
}: {
  workspace: Workspace;
  onWorkspaceChange: (w: Workspace) => void;
  campaign: Campaign;
  onCampaignChange: (c: Campaign) => void;
  liveMode: boolean;
}) {
  const [selected, setSelected] = useState(''),
    [matches, setMatches] = useState<Match[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<string[]>([]);
  const campaignRef = useRef<Campaign | null>(c);
  const current = useRef<Workspace | null>(w);
  useEffect(() => {
    current.current = w;
    campaignRef.current = c;
    return () => {
      current.current = null;
      campaignRef.current = null;
    };
  }, [w, c]);
  async function request(url: string, body: unknown) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Live provider failed.');
    return result;
  }
  async function search() {
    setBusy(true);
    setError('');
    const snapshot = w;
    try {
      const e = w.events.find(x => x.id === selected);
      if (!e) return;
      const result = await request('/api/qloo', {
        operation: 'search',
        name: e.artist
      });
      if (current.current !== snapshot || campaignRef.current !== c) throw new Error('Workspace changed. Search again.');
      setMatches(result.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setBusy(false);
    }
  }
  async function plan() {
    setBusy(true);
    setError('');
    setProgress(['Checking confirmed identities and feasible catalog…']);
    const snapshot = w;
    try {
      if (c.constraints.windowDays > 90) throw new Error('Live planning supports a maximum window of 90 days.');
      let liveCalls = 0;
      const eligible = new Set(eligibleBuyers(w).eligible.map(m => m.customerId));
      const recommendations = [];
      const cache = new Map<string, Awaited<ReturnType<typeof request>>>();
      for (const r of c.recommendations.length ? c.recommendations : c.cohort.filter(m => !c.removedRecipientIds?.includes(m.customerId)).map(m => ({
        customerId: m.customerId,
        eventIds: [],
        reason: '',
        provenance: 'synthetic fixture' as const
      }))) {
        if (!eligible.has(r.customerId) || c.removedRecipientIds?.includes(r.customerId)) continue;
        if (w.feedback.some(f => f.source === w.source && f.customerId === r.customerId && f.type === 'interest')) {
          recommendations.push({
            ...r,
            eventIds: [],
            evidence: undefined,
            reason: 'Original purchase was not representative; explicit preferences are required before taste inference.'
          });
          continue;
        }
        const member = c.cohort.find(m => m.customerId === r.customerId);
        const seed = w.events.find(e => e.id === member?.firstEventId);
        const feasible = feasibleEvents(w, r.customerId, c.constraints);
        if (!feasible.length) {
          recommendations.push({
            ...r,
            eventIds: [],
            evidence: undefined,
            reason: 'No currently feasible show meets the explicit constraints.'
          });
          continue;
        }
        if (!seed?.qlooId || feasible.some(e => !e.qlooId)) throw new Error('Confirm seed and every feasible candidate artist before live planning. Select a prior-show cohort to keep the shortlist small.');
        const body = {
          seedIds: [seed.qlooId],
          catalogVersion: 'catalog-' + feasible.map(e => [e.id, e.catalogVersion].join('-')).join('_').split('').reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0) | 0, 0).toString(36).replace('-', 'n'),
          cutoff: w.clock,
          windowDays: c.constraints.windowDays,
          budgetCents: c.constraints.budgetCents ?? null,
          purchasedEventIds: [],
          rejectedEventIds: [],
          events: feasible.map(e => ({
            id: e.id,
            artistId: e.qlooId!,
            startsAt: e.startsAt,
            priceCents: e.priceCents,
            status: e.status,
            remaining: e.remaining
          }))
        };
        const key = JSON.stringify(body);
        let result = cache.get(key);
        if (!result) {
          if (cache.size >= 3) throw new Error('Three-query live budget reached. Narrow the cohort or constraints. No partial plan applied.');
          setProgress(p => [...p, `Requesting live ranking ${cache.size + 1} of at most 3…`]);
          result = await request('/api/campaign-plan', body);
          cache.set(key, result);
          if (Array.isArray(result.planner?.progress)) setProgress(p => [...p, ...result.planner.progress.slice(0, 4).filter((step: unknown) => typeof step === 'string').map((step: string) => `Provider: ${step.slice(0, 200)}`)]);
        }
        if (current.current !== snapshot || campaignRef.current !== c) throw new Error('Workspace changed during live planning. Re-run to use current inventory.');
        const taste = result.taste;
        const ids = (value: unknown): value is string[] => Array.isArray(value) && value.every(x => typeof x === 'string');
        if (!taste || !['live', 'cached_live', 'not_called'].includes(taste.mode) || !Number.isFinite(Date.parse(taste.retrievedAt)) || !ids(taste.seedIds) || !ids(taste.candidateIds) || !Array.isArray(taste.ranked) || taste.seedIds.some((id: string) => !body.seedIds.includes(id)) || taste.candidateIds.some((id: string) => !body.events.some(e => e.artistId === id)) || taste.ranked.some((x: {
          id: string;
          rank: number;
        }) => !x || typeof x.id !== 'string' || !taste.candidateIds.includes(x.id) || !Number.isFinite(x.rank))) throw new Error('Provider taste evidence failed validation.');
        if (result.mode === 'not_called' || result.planner?.mode === 'not_called' || taste.mode === 'not_called') {
          recommendations.push({
            ...r,
            eventIds: [],
            evidence: undefined,
            reason: 'No live proposal: provider was not called or no ranked candidate was available.'
          });
          continue;
        }
        if (result.mode !== 'live' || result.planner?.mode !== 'live_model') throw new Error('Planner mode was not recognized.');
        liveCalls++;
        if (!Array.isArray(result.eventIds) || result.eventIds.length > 2 || new Set(result.eventIds).size !== result.eventIds.length || result.eventIds.some((id: unknown) => typeof id !== 'string' || !feasible.some(e => e.id === id && taste.ranked.some((ranked: {
          id: string;
        }) => ranked.id === e.qlooId)))) throw new Error('Provider returned an event outside the feasible catalog.');
        recommendations.push({
          ...r,
          eventIds: result.eventIds.slice(0, 2),
          reason: 'Live Qloo within-query ordering of the feasible venue catalog; this is not a purchase probability.',
          evidence: {
            seedIds: result.taste.seedIds,
            candidateIds: result.taste.candidateIds,
            returnedIds: result.taste.ranked.map((x: {
              id: string;
            }) => x.id),
            retrievedAt: result.taste.retrievedAt,
            warning: typeof taste.warning === 'string' ? taste.warning.slice(0, 500) : undefined,
            catalogVersion: body.catalogVersion,
            eventVersions: feasible.map(e => ({
              eventId: e.id,
              catalogVersion: e.catalogVersion,
              inventoryAsOf: e.inventoryAsOf
            })),
            explanations: taste.ranked.slice(0, 5).map((x: {
              explanation?: unknown;
            }) => {
              const value = JSON.stringify(x.explanation ?? null);
              return value.length <= 500 ? JSON.parse(value) : {
                note: 'Explanation omitted: exceeds evidence size limit'
              };
            })
          },
          provenance: result.taste.mode === 'cached_live' ? 'cached live Qloo' as const : 'live Qloo' as const
        });
      }
      const hasProposal = recommendations.some(r => r.eventIds.length > 0);
      // This is a neutral application template, not model-generated copy. Preserve operator edits.
      const copy = hasProposal && c.copy === 'Awaiting live proposal.'
        ? 'Thanks for joining us. Here are some shows you might enjoy next.'
        : c.copy;
      onCampaignChange({
        ...c,
        copy,
        recommendations,
        status: 'draft',
        revision: c.revision + 1,
        approvalSignature: undefined,
        plannerMode: liveCalls ? 'live model' : 'deterministic'
      });
      setProgress(p => [...p, liveCalls && hasProposal ? 'Live proposal validated. Human approval required.' : 'No live model proposal was produced. Unranked recipients have no recommendations.']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Live planning failed.');
    } finally {
      setBusy(false);
    }
  }
  return <section className={styles.panel}>
    <h2>Artist identity & live evidence</h2>
    <p>Confirm identities explicitly. Only cultural entity IDs and nonpersonal catalog constraints reach providers. Live provider access remains unverified until a request succeeds. Failures never switch to fixtures.</p>
    <div className={styles.row}>
      <select aria-label="Artist to resolve" value={selected} onChange={e => {
        setSelected(e.target.value);
        setMatches([]);
      }}>
        <option value="">Select artist</option>{w.events.filter(e => e.source === w.source).map(e => <option key={e.id} value={e.id}>{e.artist}
{e.qlooId ? ' · confirmed' : ''}
</option>)}
</select>
      <button disabled={busy || !selected} onClick={search}>Search Qloo</button>
    </div>{matches.map(m => <div key={m.id} className={styles.match}>
      <span>{m.name}
<small>{m.types.join(', ')} · {m.id}
</small>
      </span>
      <button disabled={busy} onClick={() => {
        onWorkspaceChange({
          ...w,
          events: w.events.map(e => e.id === selected ? {
            ...e,
            qlooId: m.id
          } : e),
          campaigns: w.campaigns.map(x => ({
            ...x,
            status: 'needs_review',
            approvalSignature: undefined
          }))
        });
        setMatches([]);
      }}>Confirm identity</button>
    </div>)}
{liveMode && <button data-testid="live-plan" disabled={busy} onClick={plan}>{busy ? 'Planning…' : 'Generate live campaign proposal'}
</button>}
{error && <p role="alert" className={styles.error}>{error} Choose deterministic baseline mode explicitly to use the transparent baseline.</p>}
{progress.length > 0 && <ol aria-live="polite">{progress.map((p, i) => <li key={i}>{p}
</li>)}
</ol>}
<details>
      <summary>Baseline versus Qloo / campaign evidence</summary>
      <p>The transparent baseline orders the same feasible catalog by matching genre, then date and price; a corrected taste assumption uses date and price only. Different ordering is not evidence of conversion lift. Unreturned candidates are unranked.</p>
      <table>
        <thead>
          <tr>
            <th>Recipient</th>
            <th>Genre/date baseline</th>
            <th>Current proposal</th>
          </tr>
        </thead>
        <tbody>{c.recommendations.map(r => {
            const m = c.cohort.find(x => x.customerId === r.customerId);
            const corrected = w.feedback.some(f => f.source === w.source && f.customerId === r.customerId && f.type === 'interest');
            const seed = corrected ? undefined : w.events.find(e => e.id === m?.firstEventId);
            const baseline = feasibleEvents(w, r.customerId, c.constraints).sort((a, b) => Number(b.genre === seed?.genre) - Number(a.genre === seed?.genre) || Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.priceCents - b.priceCents);
            return <tr key={r.customerId}>
            <td>{r.customerId}
</td>
            <td>{baseline.slice(0, 2).map(e => e.artist).join(" / ") || "No feasible event"}
</td>
            <td>{r.eventIds.map(id => w.events.find(e => e.id === id)?.artist).join(" / ") || "Unranked / no proposal"}
</td>
          </tr>;
          })}
</tbody>
      </table>
      <pre>{JSON.stringify(c.recommendations.map(r => ({
          customerId: r.customerId,
          evidence: r.evidence
        })), null, 2)}
</pre>
    </details>
  </section>;
}
