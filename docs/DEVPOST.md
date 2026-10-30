# SecondShow — submission draft

**Tagline:** Turn a first show into a second.

Independent venues have little purchase history for a first-time buyer. SecondShow explores whether aggregate cultural relationships can help a marketer select the next show from the venue's own upcoming lineup.

The application imports synthetic/anonymized records, freezes first-buyer cohorts, and filters events using explicit consent, purchases, inventory, dates, budget and admission constraints. The operator selects a deterministic baseline or confirms artist identities for Qloo-assisted planning. A server-side workflow ranks only feasible artist IDs and uses a bounded model tool loop with temporary candidate aliases. Results return to deterministic validation before human approval. Provider failures remain visible; fallback requires an explicit operator choice.

The operator reviews and exports a campaign; no messages are delivered. Recipient previews collect feedback and offer clearly simulated checkout for sample events. Recorded purchases, click associations and mature 30-day outcomes remain distinct from unmeasured incremental impact. Historical order revisions and frozen outcome/export snapshots preserve the evidence used at an observation time.

Built with Next.js, React and TypeScript, browser-local persistence, bounded REST adapters, ESLint and Playwright. Sample mode needs no keys. Every sample booking, buyer, inventory record and purchase is fictional. Artist affinity is not purchase probability.

**Verification boundary:** Local tests cover the sample journey, independent browser contexts, mocked live planning, provider failure, stale-response protection, approval and measurement invariants. A real nonpersonal orchestration run returned successful responses from Qloo and two Nebius Token Factory completions using `nvidia/nemotron-3-super-120b-a12b`, and proposed one fictional event. A separate local browser run used live Qloo and Nebius planning, required human approval and enabled export; a later run also verified the exported sample invitation copy. See [Nebius verification](NEBIUS.md) and [validation](VALIDATION.md). These tests do not establish comparative ranking quality, conversion impact or production readiness. The hosted live-provider flow remains unverified. The application has no shared quota or rate limit; its origin check is not authentication and repeated live requests can incur provider charges. The fixed model task inspects and proposes ranked IDs; it does not interpret arbitrary freeform marketing requests or autonomously approve, send or price anything.

A future paid pilot would randomize consenting eligible buyers between the same feasible catalog ordered by genre/date and Qloo-assisted ordering, with a predeclared second distinct-event purchase endpoint. Paid demand, ranking superiority and conversion lift remain hypotheses.

Before submission, provide a verified public, licensed source repository, a judge-accessible application and a public YouTube demo showing the required provider use, and keep the application freely testable through judging. As of October 30, the Devpost entry was a draft, not a submitted entry.
