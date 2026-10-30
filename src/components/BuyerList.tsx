import { Workspace, eligibleBuyers } from '../domain';
export default function BuyerList({
  w,
  eligible
}: {
  w: Workspace;
  eligible: ReturnType<typeof eligibleBuyers> | null;
}) {
  return <section>
    <h2>Audience, with boundaries.</h2>
    <p>Exactly one distinct qualifying purchase and explicit marketing consent are required.</p>
    <table>
      <thead>
        <tr>
          <th>Buyer</th>
          <th>Consent</th>
          <th>Eligibility</th>
        </tr>
      </thead>
      <tbody>{w.customers.filter(x => x.source === w.source).map(x => <tr key={x.id}>
        <td>{x.id}
</td>
        <td>{x.consent}
</td>
        <td>{eligible?.excluded.find(y => y.customerId === x.id)?.reason || 'Eligible first observed buyer'}
</td>
      </tr>)}
</tbody>
    </table>
  </section>;
}
