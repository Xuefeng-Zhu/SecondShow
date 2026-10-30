# SecondShow — submission draft

**Tagline:** Turn a first show into a second.

Independent venues have little purchase history for a first-time buyer. SecondShow explores whether aggregate cultural relationships can help a marketer select the next show from the venue's own upcoming lineup.

The application imports synthetic/anonymized records, freezes first-buyer cohorts, and filters events using explicit consent, purchases, inventory, dates, budget and admission constraints. The operator selects a deterministic baseline or confirms artist identities for Qloo-assisted planning. A server-side workflow ranks only feasible artist IDs and uses a bounded model tool loop with temporary candidate aliases. Results return to deterministic validation before human approval. Provider failures remain visible; fallback requires an explicit operator choice.

The operator reviews and exports a campaign; no messages are delivered. Recipient previews collect feedback and offer clearly simulated checkout for sample events. Recorded purchases, click associations and mature 30-day outcomes remain distinct from unmeasured incremental impact. Historical order revisions and frozen outcome/export snapshots preserve the evidence used at an observation time.

Built with Next.js, React and TypeScript, browser-local persistence, bounded REST adapters, an atomic shared-quota adapter, ESLint and Playwright. Sample mode needs no keys. Every sample booking, buyer, inventory record and purchase is fictional. Artist affinity is not purchase probability.

**Verification boundary:** Local tests cover the complete sample journey, independent browser contexts, mocked live planning, provider failure, stale-response protection, approval and measurement invariants. Qloo-only UI search/confirmation, single-candidate ranking/explanation and cache are live verified. Full model planning, Redis and public deployment remain unverified. The fixed model task inspects and proposes ranked IDs; it does not interpret arbitrary freeform marketing requests or autonomously approve, send or price anything.

A future paid pilot would randomize consenting eligible buyers between the same feasible catalog ordered by genre/date and Qloo-assisted ordering, with a predeclared second distinct-event purchase endpoint. Paid demand, ranking superiority and conversion lift remain hypotheses.

Before submission, insert verified public application and source repository URLs, run the actual live-provider smoke test, and keep the application freely testable through judging. Nothing has been published or submitted by this draft.
