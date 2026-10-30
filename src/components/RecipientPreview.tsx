import type { Dispatch, SetStateAction } from 'react';
import { Workspace, Campaign, Recommendation, Event, replanCampaign, recordSamplePurchase } from '../domain';
import { isHttpsCheckout } from '../csv';
interface Props {
  w: Workspace;
  c: Campaign;
  rec: Recommendation;
  event: (id: string) => Event | undefined;
  money: (n: number) => string;
  setW: Dispatch<SetStateAction<Workspace | null>>;
  setNotice: (s: string) => void;
  setPreview: (s: string) => void;
  ticket: string | null;
  setTicket: (s: string | null) => void;
}
export default function RecipientPreview({
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
}: Props) {
  return <section className="recipient">
    <p className="eyebrow">LOCAL RECIPIENT PREVIEW · {rec.customerId}
</p>
    <h2>Your next night out.</h2>{!rec.eventIds.length && <p role="status">No currently available recommendation. Return to the campaign and replan.</p>}
{ticket && rec.eventIds.includes(ticket) && <div className="notice" role="region" aria-label="Simulated ticket page">
      <h3>Simulated ticket page</h3>
      <p>{event(ticket)?.artist} · {money(event(ticket)?.priceCents || 0)}
</p>
      <p>Fictional appearance. No payment is collected and no ticket is issued. This preview click is not a purchase.</p>
      <button onClick={() => setTicket(null)}>Close ticket preview</button>
    </div>}
<p>{c.copy}
</p>{rec.eventIds.map(id => {
      const e = event(id)!;
      return <article className="ticket" key={id}>
        <div className="poster">SECOND<br />SHOW<span>{e.genre}
</span>
        </div>
        <div>
          <h3>{e.artist}
</h3>
          <p>{new Date(e.startsAt).toLocaleString('en-US', {
              timeZone: e.timezone
            })} · {money(e.priceCents)}
</p>
          <p>{rec.reason}
</p>
          <button onClick={() => {
            setW({
              ...w,
              clicks: [...w.clicks, {
                customerId: rec.customerId,
                eventId: id,
                campaignId: c.id,
                at: w.clock,
                source: w.source
              }]
            });
            if (w.source === 'sample') setTicket(id);else if (e.checkoutUrl && isHttpsCheckout(e.checkoutUrl)) window.open(e.checkoutUrl, '_blank', 'noopener,noreferrer');
          }}>{w.source === 'sample' ? 'Preview sample checkout ↗' : 'Open venue checkout ↗'}
</button>
          <div className="feedback">{['date', 'price', 'taste', 'interest'].map(type => <button key={type} onClick={() => {
              const next = {
                ...w,
                feedback: [...w.feedback, {
                  customerId: rec.customerId,
                  eventId: id,
                  type: type as 'date' | 'price' | 'taste' | 'interest',
                  at: w.clock,
                  source: w.source
                }]
              };
              setW({
                ...next,
                campaigns: next.campaigns.map(x => x.id === c.id ? c.plannerMode === 'live model' ? {
                  ...c,
                  status: 'needs_review' as const,
                  approvalSignature: undefined
                } : replanCampaign(next, c) : x)
              });
              setNotice(c.plannerMode === 'live model' ? 'Feedback saved. Live campaign needs a new live proposal.' : 'Feedback saved. Recommendations replanned.');
            }}>{{
                date: 'Date does not work',
                price: 'Too expensive',
                taste: 'Not my taste',
                interest: 'Original purchase was not for me'
              }[type]}
</button>)}
</div>
        </div>
      </article>;
    })}
<button onClick={() => setPreview('')}>Back to workspace</button>{w.source === 'sample' && rec.eventIds.length > 0 && <section className="operator-demo" aria-label="Operator demo controls">
      <p className="eyebrow">OPERATOR DEMO CONTROLS</p>
      <h3>Simulate a recorded outcome</h3>
      <p>This operator action records a fictional second purchase for {event(rec.eventIds[0])?.artist} at the current demo clock. No payment occurs. Advance the clock in Outcomes to complete follow-up.</p>
      <button onClick={() => {
        setW(recordSamplePurchase(w, c, rec.customerId, rec.eventIds[0]));
        setNotice('Sample second purchase recorded at the current demo clock. View Outcomes, then advance the clock to complete follow-up.');
      }}>Record sample second purchase</button>
    </section>}
</section>;
}
