'use client';

import { useEffect, useState, useRef } from 'react';
import { Workspace, Campaign, buildCampaign, replanCampaign, eligibleBuyers, approveCampaign, campaignIsCurrent, feasibleEvents, invitationCopyIsComplete, exportCampaign as makeExport } from '../src/domain';
import QueueReview from '../src/components/QueueReview';
import RecipientPreview from '../src/components/RecipientPreview';
import UpcomingShows from '../src/components/UpcomingShows';
import BuyerList from '../src/components/BuyerList';
import OutcomesView from '../src/components/OutcomesView';
import LiveTaste from '../src/LiveTaste';
import WorkspaceImport from '../src/components/WorkspaceImport';
const key = 'secondshow-workspace-v1';
export default function Home() {
  const generation = useRef(0);
  const reviewStage = useRef<HTMLDivElement>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [w, setW] = useState<Workspace | null>(null),
    [ready, setReady] = useState(false),
    [tab, setTab] = useState('Campaigns'),
    [notice, setNotice] = useState(''),
    [days, setDays] = useState(30),
    [budget, setBudget] = useState(''),
    [preview, setPreview] = useState(''),
    [evidence, setEvidence] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [prior, setPrior] = useState(''),
    [plannerMode, setPlannerMode] = useState('sample');
  useEffect(() => {
    if (reviewing && reviewStage.current) {
      reviewStage.current.focus({ preventScroll: true });
      reviewStage.current.scrollIntoView({ block: 'start' });
    }
  }, [reviewing]);
  useEffect(() => {
    queueMicrotask(() => {
      try {
        const s = localStorage.getItem(key);
        if (s) setW(JSON.parse(s));
      } catch {
        setNotice('Saved workspace could not be read. Load a fresh sample.');
      }
      setReady(true);
    });
  }, []);
  useEffect(() => {
    if (ready) {
      if (w) localStorage.setItem(key, JSON.stringify(w));else localStorage.removeItem(key);
    }
  }, [w, ready]);
  const c = w?.campaigns.at(-1),
    eligible = w ? eligibleBuyers(w) : null;
  const save = (next: Campaign) => {
    if (w) setW({
      ...w,
      campaigns: w.campaigns.some(x => x.id === next.id) ? w.campaigns.map(x => x.id === next.id ? next : x) : [...w.campaigns, next]
    });
  };
  const draft = () => {
    if (w) {
      if (plannerMode === 'live') {
        if (!c || c.priorEventId !== (prior || undefined)) {
          save({
            ...buildCampaign(w, {
              windowDays: days,
              budgetCents: budget ? Number(budget) * 100 : undefined
            }, prior || undefined),
            recommendations: [],
            status: 'needs_review',
            copy: 'Awaiting live proposal.'
          });
          setTab('Campaigns');
          setNotice('Cohort created. Confirm artists and generate a live proposal.');
          return;
        }
        setNotice(c ? 'Use Generate live campaign proposal below to replan with live providers.' : 'Choose deterministic sample mode to create the initial review cohort, then select live mode and generate a live proposal.');
        setTab('Campaigns');
        return;
      }
      save(c && c.priorEventId === (prior || undefined) ? replanCampaign(w, {
        ...c,
        plannerMode: 'deterministic',
        constraints: {
          windowDays: days,
          budgetCents: budget ? Number(budget) * 100 : undefined
        }
      }) : buildCampaign(w, {
        windowDays: days,
        budgetCents: budget ? Number(budget) * 100 : undefined
      }, prior || undefined));
      setTab('Campaigns');
      setNotice('Draft ready for human review. No messages sent.');
    }
  };
  const invalidate = () => {
    if (c) save({
      ...c,
      status: 'needs_review',
      approvalSignature: undefined
    });
  };
  const download = (name: string, text: string, type = 'text/csv') => {
    const url = URL.createObjectURL(new Blob([text], {
      type
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportCampaign = () => {
    if (!w || !c) return;
    if (!campaignIsCurrent(w, c)) {
      setNotice('Inputs changed. Replan and approve before exporting.');
      return;
    }
    const result = makeExport(w, c);
    if (!result) return;
    download('secondshow-campaign.csv', result.csv);
    save(result.campaign);
    setNotice('Campaign exported. Messages have not been sent.');
  };
  const rawRec = c?.recommendations.find(r => r.customerId === preview) || c?.recommendations.find(r => r.eventIds.length);
  const rec = rawRec && w && c ? {
    ...rawRec,
    eventIds: eligible?.eligible.some(member => member.customerId === rawRec.customerId) ? rawRec.eventIds.filter(id => feasibleEvents(w, rawRec.customerId, c.constraints).some(e => e.id === id)) : []
  } : undefined;
  const event = (id: string) => w?.events.find(e => e.id === id);
  const money = (n: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(n / 100);
  return <div className={`shell ${w ? 'workspace-loaded' : ''} ${preview ? 'preview-mode' : ''} ${w && tab === 'Campaigns' ? 'queue-workspace' : ''}`}>
    <aside>
      <a className="brand" href="#">SecondShow<span>VENUE WORKSPACE</span>
      </a>
      <div className="venue">◈<br />SecondShow<br />Demo Room<small>{w?.source === 'import' ? 'ANONYMIZED WORKSPACE' : 'SEATTLE · SAMPLE VENUE'}
</small>
      </div>
      <nav>{['Upcoming Shows', 'Buyers', 'Campaigns', 'Outcomes'].map((t, i) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => {
          setTab(t);
          setPreview('');
        }}>
        <span>0{i + 1}
</span>{t}
</button>)}
</nav>
      <div className="rail-foot">A first show is a beginning.<br />
        <b>Make room for the next.</b>
      </div>
    </aside>
    <main>
      <header>
        <span>THE RETURN VISIT / {tab.toUpperCase()}
</span>
        <span className="mode">{w?.source === 'import' ? 'ANONYMIZED IMPORT' : 'SAMPLE DATA'} · NO DELIVERY</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">YOUR ROOM. THEIR NEXT FAVORITE.</p>
          <h1>{w && tab === 'Campaigns' ? c?.priorEventId ? `Next up after ${event(c.priorEventId)?.artist || 'their first show'}` : 'Build the next invitation' : <>Turn a first show{' '}<br />into a <em>second.</em></>}
          </h1>
          <p>Find the next right show for first-time buyers.<br />Review the audience, approve the invitation, export when ready.</p>
        </div>
        <div className="intro-note">
          <span>01 — THE HUMAN COMES FIRST</span>
          <p>You choose the room.<br />You review the invitation.<br />Nothing sends itself.</p>
        </div>
      </section>
      <details className="workspace-settings" key={w ? 'loaded' : 'empty'} open={!w}><summary>Workspace & import</summary><WorkspaceImport {...{
        w,
        setW,
        generationRef: generation,
        setTicket,
        setPreview,
        setNotice
      }} /></details>{notice && <p role="status" className="notice">{notice}
</p>}
{!ready ? <p>Opening workspace…</p> : !w ? <section className="empty">
        <p className="eyebrow">WELCOME TO THE ROOM</p>
        <h2>A second visit starts here.</h2>
        <p>Load the fictional venue to try the complete approval and export workflow.</p>
      </section> : <>
        <details className="workspace-summary" open={tab !== 'Campaigns'}><summary>Workspace summary</summary><div className="stats">
          <div>
            <strong>{eligible?.eligible.length}
</strong>
            <span>eligible first-time buyers</span>
          </div>
          <div>
            <strong>{w.events.filter(e => e.status === 'on_sale' && Date.parse(e.startsAt) > Date.parse(w.clock)).length}
</strong>
            <span>upcoming shows on sale</span>
          </div>
          <div>
            <strong>{c?.status.replace('_', ' ') || '—'}
</strong>
            <span>campaign status</span>
          </div>
          <div>
            <strong>0</strong>
            <span>messages delivered · not connected</span>
          </div>
        </div>
        <p className="fine">{w.source === 'sample' ? 'Fictional appearances, customers, inventory and purchases.' : 'Anonymized operator import. History coverage: ' + w.coverageStart + '.'} Taste: {c?.recommendations.some(r => r.provenance === 'live Qloo' || r.provenance === 'cached live Qloo') ? 'live / cached live Qloo (see evidence)' : w.source === 'import' ? 'genre/date baseline' : 'synthetic fixture'} · Planner: {c?.plannerMode || 'deterministic'}. Demo clock: {w.clock.slice(0, 10)}. Inventory is a snapshot; seats are not reserved.</p></details>{preview && c && rec ? <RecipientPreview {...{
          w,
          c,
          rec,
          event,
          money,
          setW,
          setNotice,
          setPreview,
          ticket,
          setTicket
        }} /> : tab === 'Upcoming Shows' ? <UpcomingShows {...{
          w,
          draft,
          money
        }} /> : tab === 'Buyers' ? <BuyerList {...{
          w,
          eligible
        }} /> : tab === 'Campaigns' ? <section>
          <p className="queue-subtitle">{c ? `${c.recommendations.filter(r => r.eventIds.length).length} invitation recipients` : `${eligible?.eligible.length} eligible first-time buyers`} · {w.source === 'sample' ? 'Fictional sample lineup' : 'Operator catalog'} · Nothing sent</p><div className="section-head campaign-section-head">
            <h2>Your return-visit queue</h2>
            <span className="pill">{c ? `REVISION ${c.revision}` : 'NEW CAMPAIGN'}
</span>
          </div>
          <details className="preferences" open={!c}><summary>Campaign preferences</summary><div className="builder">
            <label>Prior show <select aria-label="Prior show cohort" value={prior} onChange={e => {
                setPrior(e.target.value);
                invalidate();
              }}>
              <option value="">All first-show cohorts</option>{w.events.filter(e => e.source === w.source && Date.parse(e.startsAt) <= Date.parse(w.clock)).map(e => <option key={e.id} value={e.id}>{e.artist}
</option>)}
</select>
            </label>
            <label>Planning mode <select aria-label="Planning mode" value={plannerMode} onChange={e => {
                setPlannerMode(e.target.value);
                invalidate();
              }}>
              <option value="sample">{w.source === 'sample' ? 'Deterministic sample baseline' : 'Deterministic genre/date baseline'}
</option>
              <option value="live">Live Qloo + model</option>
            </select>
            </label>
            <label>Next <input aria-label="Window days" type="number" min="1" max="365" value={days} onChange={e => {
                const value = Math.max(1, Number(e.target.value));
                setDays(value);
                if (c) save({
                  ...c,
                  constraints: {
                    ...c.constraints,
                    windowDays: value
                  },
                  status: 'needs_review',
                  approvalSignature: undefined
                });
              }} /> days</label>
            <label>Budget $ <input aria-label="Budget dollars" type="number" min="0" placeholder="Any" value={budget} onChange={e => {
                setBudget(e.target.value);
                if (c) save({
                  ...c,
                  constraints: {
                    ...c.constraints,
                    budgetCents: e.target.value ? Number(e.target.value) * 100 : undefined
                  },
                  status: 'needs_review',
                  approvalSignature: undefined
                });
              }} />
            </label>
            <button onClick={draft}>{c ? 'Replan draft' : 'Draft campaign'}
</button>
          </div></details>{c && <>
            <QueueReview w={w} c={c} save={save} />
            <button className={reviewing ? "review-next" : "primary review-next"} onClick={() => {
              setReviewing(!reviewing);
              if (reviewing) window.scrollTo({ top: 0 });
            }}>{reviewing ? 'Back to show queue' : 'Review invitation'}</button>
            <div ref={reviewStage} tabIndex={-1} role="region" aria-labelledby="review-stage-heading" className={reviewing ? "review-stage" : "review-stage collapsed-review"}><h2 id="review-stage-heading">Review and approve invitation</h2><p className="fine">Check the copy and selected shows before approving this revision.</p><label className="copy-label">Invitation copy<textarea value={c.copy} onChange={e => save({
                ...c,
                copy: e.target.value,
                status: 'needs_review',
                approvalSignature: undefined
              })} />
            </label>
            {!invitationCopyIsComplete(c.copy) && <p role="status" className="fine">Add complete invitation copy before approving or exporting.</p>}
            <div className="actions">
              <button onClick={() => {
                const id = c.recommendations.find(r => r.eventIds.length)?.eventIds[0];
                if (!id) return;
                setW({
                  ...w,
                  events: w.events.map(e => e.id === id ? {
                    ...e,
                    status: 'sold_out',
                    remaining: 0,
                    catalogVersion: e.catalogVersion + 1
                  } : e),
                  campaigns: w.campaigns.map(x => x.id === c.id ? {
                    ...x,
                    status: 'needs_review',
                    approvalSignature: undefined
                  } : x)
                });
                setNotice('Top recommendation is sold out. Replan to find an available replacement.');
              }}>Mark top recommendation sold out</button>
              <button className={campaignIsCurrent(w, c) ? "" : "primary"} disabled={c.recommendations.length === 0 || !invitationCopyIsComplete(c.copy)} onClick={() => {
                const next = approveCampaign(w, c);
                save(next);
                setNotice(next.status === 'approved' ? 'Draft approved. Export is ready.' : 'Draft needs review. Replan before approval.');
              }}>Approve draft</button>
              <button className={campaignIsCurrent(w, c) ? "primary" : ""} disabled={!campaignIsCurrent(w, c)} onClick={exportCampaign}>Export campaign</button>
              <button disabled={!campaignIsCurrent(w, c)} onClick={() => {
                const result = makeExport(w, c);
                if (result) {
                  download("secondshow-campaign.json", result.json, "application/json");
                  save(result.campaign);
                }
              }}>Export JSON package</button>
              <button onClick={() => setEvidence(!evidence)}>Evidence {evidence ? '−' : '+'}
</button>
            </div></div>{evidence && <div className="notice">{c.plannerMode === 'live model' ? 'Live provider evidence is shown below. Rankings compare candidates within a query only.' : 'Genre/date baseline with any operator edits labeled in the queue. Unedited candidate order uses matching genre, then date and price.'} Cutoff: {c.cutoff}. Frozen cohort: {c.cohort.length}. Excluded buyers: {c.exclusions.map(x => `${x.customerId}: ${x.reason}`).join('; ')}.</div>}
<p className="fine">Frozen reporting cohort: {c.cohort.length} · Current recipients: {c.recommendations.filter(r => r.eventIds.length).length}. Removing a recipient does not change the reporting denominator.</p>
            <details className="provider-details"><summary>Live providers & artist evidence</summary><LiveTaste workspace={w} onWorkspaceChange={setW} campaign={c} onCampaignChange={save} liveMode={plannerMode === 'live'} /></details>
            <details className="audience-details"><summary>Review audience & recipient previews</summary><table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Proposed shows</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>{c.recommendations.map(r => <tr key={r.customerId}>
                <td>{r.customerId}
</td>
                <td>{r.eventIds.map(id => event(id)?.artist).join(' / ') || r.reason}
</td>
                <td>
                  <button onClick={() => setPreview(r.customerId)}>Preview</button> <button onClick={() => save({
                      ...c,
                      recommendations: c.recommendations.filter(x => x.customerId !== r.customerId),
                      removedRecipientIds: [...new Set([...(c.removedRecipientIds || []), r.customerId])],
                      status: 'needs_review',
                      approvalSignature: undefined
                    })}>Remove</button>
                </td>
              </tr>)}
</tbody>
            </table></details>
          </>}
</section> : <OutcomesView {...{
          w,
          c,
          setW,
          setNotice
        }} />}
</>}
<footer>SECOND SHOW, SAME ROOM.<span>Built for a thoughtful return.</span>
      </footer>
    </main>
  </div>;
}
