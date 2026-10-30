import type { Workspace } from '../domain';
export default function UpcomingShows({
  w,
  draft,
  money
}: {
  w: Workspace;
  draft: () => void;
  money: (n: number) => string;
}) {
  return <section>
    <div className="section-head">
      <h2>The upcoming lineup</h2>
      <button className="primary" onClick={draft}>Build campaign →</button>
    </div>
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{w.source === 'sample' ? 'Artist / sample appearance' : 'Artist / operator catalog'}
</th>
            <th>Date · Seattle</th>
            <th>Tickets</th>
            <th>Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>{w.events.filter(e => e.source === w.source && Date.parse(e.startsAt) > Date.parse(w.clock)).map((e, i) => <tr key={e.id}>
          <td>
            <span className={`mini-poster p${i % 4}`}>{String(i + 1).padStart(2, '0')}
</span>
            <b>{e.artist}
</b>
            <small>{e.genre}
</small>
          </td>
          <td>{new Date(e.startsAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: e.timezone
              })}
</td>
          <td>{e.remaining} remaining</td>
          <td>{money(e.priceCents)}
</td>
          <td>
            <span className="pill">{e.status.replace('_', ' ')}
</span>
          </td>
        </tr>)}
</tbody>
      </table>
    </div>
  </section>;
}
