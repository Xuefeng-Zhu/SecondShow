import type { Dispatch, SetStateAction } from 'react';
import { Workspace, Campaign, outcomes, advanceDemoClock } from '../domain';
export default function OutcomesView({
  w,
  c,
  setW,
  setNotice
}: {
  w: Workspace;
  c: Campaign | undefined;
  setW: Dispatch<SetStateAction<Workspace | null>>;
  setNotice: (s: string) => void;
}) {
  return <section>
    <h2>Observed, not attributed.</h2>{w.source === 'sample' && <button data-testid="advance-clock" onClick={() => {
      setW(advanceDemoClock(w, 30));
      setNotice('Demo clock advanced 30 days. This is a simulation, not elapsed real time.');
    }}>Advance demo clock 30 days</button>}
{c ? (() => {
      const o = outcomes(w, c);
      return <>
        <div className="stats">
          <div>
            <strong>{o.cohort}
</strong>
            <span>frozen cohort</span>
          </div>
          <div>
            <strong>{o.purchases}
</strong>
            <span>second-show purchases · {w.source}
</span>
          </div>
          <div>
            <strong>{o.rate === null ? '—' : `${Math.round(o.rate * 100)}%`}
</strong>
            <span>fully observed 30-day repeat rate</span>
          </div>
          <div>
            <strong>{o.incomplete}
</strong>
            <span>incomplete follow-up windows</span>
          </div>
        </div>
        <p>{o.mature} buyers have a fully observed 30-day window. {o.afterClick} recorded purchases follow a tracked click. {c.exports.length} exports. Delivered: not connected.</p>
        <p>Sample purchases affect sample metrics only. These observations do not establish incremental impact or conversion lift.</p>
        <p className="fine">Mature observations are frozen; later corrections do not automatically rewrite them.</p>
        <details className="snapshot-details">
          <summary>Historical observation snapshots</summary>
          {c.outcomeSnapshots?.length ? <div className="table-wrap"><table>
            <thead><tr><th>Buyer</th><th>Observed at</th><th>Window ends</th></tr></thead>
            <tbody>{c.outcomeSnapshots.map(snapshot => <tr key={snapshot.customerId}>
              <td>{snapshot.customerId}</td>
              <td><time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0, 10)}</time></td>
              <td><time dateTime={snapshot.windowEndsAt}>{snapshot.windowEndsAt.slice(0, 10)}</time></td>
            </tr>)}</tbody>
          </table></div> : <p>No mature observations yet.</p>}
        </details>
      </>;
    })() : <p>Create a campaign to freeze an audience and inspect its observation window.</p>}
</section>;
}
