# SecondShow

Turn a first show into a second. A working sample-data prototype for an independent venue marketer. All sample appearances, inventory, buyers and orders are fictional. Real artist names do not imply bookings.

## Run and verify

Use Node.js 24 or newer. Run `npm ci`, then `npm run dev` and open http://127.0.0.1:3000. Scripts bind to loopback. A production build uses `npm run build` and `npm start`.

```sh
npm test
npm run lint
npm run typecheck
npx playwright install chromium
npm run test:e2e
npm run build
```

The Playwright tests start a separate local server on port 3100. See [the validation record](docs/VALIDATION.md) for executed checks and their limits.

## Workflow and architecture

Load the fictional venue or import anonymized CSVs, choose a first-show cohort and constraints, review a proposal, approve it and export CSV or JSON. Neither action sends a message. Recipient previews offer feedback and a simulated checkout for sample events. The separate operator demo control records a sample purchase at the current simulated clock; advancing the demo clock makes follow-up windows mature.

`src/domain.ts` owns deterministic eligibility, feasibility, approvals, export snapshots and outcomes. `src/csv.ts` owns bounded imports. `src/server/` holds Qloo, model orchestration and shared quota adapters. Provider keys remain server-side. Workspace state lives in localStorage for the browser profile and origin; separate profiles are isolated, while tabs in one profile share storage. Refresh preserves work. Reset only clears the current origin's demo workspace.

This is a synthetic/anonymized-data prototype without production contact ingestion, email delivery, ticket issuance, authentication or multi-venue tenancy. Do not import real personal data.

## Operating modes and live configuration

Data source and planning source are distinct. Sample data with a deterministic workflow is labeled `synthetic fixture`; an anonymized import with deterministic selection uses the transparent `genre/date baseline`. Live Qloo and cached live Qloo evidence carry actual retrieval times. The operator must explicitly select the fallback baseline after a live error.

For live planning, copy `.env.example` to `.env.local`, set `ENABLE_LIVE_PROVIDERS=true`, and configure `QLOO_API_KEY`, `QLOO_BASE_URL`, `NEBIUS_API_KEY` and `NEBIUS_MODEL`. Nebius Token Factory is the only model endpoint, and model selection is explicit. Configure a persistent model key and run paid inference only after the user authorizes those actions. Confirm the host against the event credential instructions before enabling it. Never paste secrets into chat or client code. The [official event kit](https://github.com/qloo/qloo-hackathon-kit) documents the Qloo harness; this application's REST adapter and a Nebius-backed planning flow were verified with authorized credentials on October 30. See [Nebius setup and verification](docs/NEBIUS.md).

Search and explicitly confirm each artist identity. Choose `Live Qloo + model` (Nebius Token Factory), create the frozen review cohort and generate a live proposal. The client submits only nonpersonal, already-filtered shortlists. The server filters again, ranks confirmed artist IDs through Qloo, and runs at most two model tool calls using temporary candidate aliases. The client rechecks current recipients and event IDs before applying the proposal. The same feasible catalog is shown beside the genre/date baseline. Affinity and ordering differences are not purchase probabilities or proof of better conversion.

One run supports at most three distinct shortlist queries, each reserving three external-call units. Queries are deduplicated across equivalent recipients. Timeouts, response/body limits, identity validation, errors and missing explanation warnings are preserved. The bounded model performs a fixed inspect-and-propose task; arbitrary natural-language interpretation and model-written copy are outside this narrow implementation. Operator copy remains editable.

Production live routes fail closed unless running on Vercel with an exact `LIVE_ALLOWED_ORIGIN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, a secret `LIVE_IP_HASH_SALT` of at least 32 characters, and `LIVE_DAILY_BUDGET`. The shared limiter atomically enforces a daily project budget, nine provider-call units per client per minute, and two concurrent client leases. Client IP keys are hashed. Redis errors refuse calls. Units bound request counts, not monetary spend; configure provider account spending limits separately. Sample-only deployment needs none of these services. No external service has been created by this project.

An opt-in `npm run smoke:live` command requires `RUN_LIVE_SMOKE=1`, `CONFIRM_QLOO_HOST=1`, and operator-confirmed `QLOO_SMOKE_SEED_ID` / `QLOO_SMOKE_CANDIDATE_ID`, in addition to provider credentials. It makes at most one Qloo ranking call and two Nebius model calls with a fictional nonpersonal event; ordinary tests never call live providers. It tests providers directly, not the production Redis guard.

Qloo UI search/confirmation, single-candidate ranking and cache behavior were verified on October 30. A separate live Qloo + Nemotron planning run and the actual local browser flow also passed with fictional bookings and sample customers; human approval was required before export became available. Run opt-in live verification only with permission for provider requests and paid inference. Shared production Redis remains unverified. See docs/ACCESS.md and the saved verification evidence.

## CSV contract

Templates are available at `/templates/customers.csv`, `/templates/events.csv` and `/templates/orders.csv`. Import customers and events before orders. Specify history coverage start and as-of dates; use “first observed buyer” when earlier history is unknown. Dates include an explicit timezone. Cents, inventory and versions use nonnegative safe integers. This single Seattle venue prototype accepts USD event prices; cross-currency budgets are outside scope.

- Customers: `id,consent`; consent is `granted`, `declined` or `unknown`. Optional `consentUpdatedAt`, `unavailableDates` (pipe-separated local `YYYY-MM-DD`) and `admissionAge` (0–120). Age is never inferred.
- Events: `id,artist,startsAt,timezone,priceCents,currency,status,remaining,inventoryAsOf,catalogVersion,checkoutUrl,genre`; optional `minimumAge`. Status is `on_sale`, `sold_out` or `canceled`. Checkout must be operator-supplied HTTPS without URL credentials. Inventory is a timestamped snapshot, not a reservation.
- Orders: `id,customerId,eventId,purchasedAt,status,netCents,updatedAt`; status is `paid`, `refunded` or `void`. Referenced customers/events must already exist. Net cents represent value remaining after refunds; a partially refunded purchase with positive net remains `paid`.

Headers are case-sensitive. Quoted commas, escaped quotes and newlines are supported. Row errors are reported; malformed headers prevent import. Limits are 2 million characters, 10,000 records, 50 columns and 10,000 characters per field. Stable IDs upsert within the import partition. Equal/older order revisions, stale catalog versions/inventory timestamps and stale consent timestamps are skipped or rejected. As-of cannot move backwards. Accepted order revisions are append-only. Imports preserve historical exports. CSV exports neutralize formula prefixes, including after whitespace.

## Eligibility and historical measurement

Qualifying orders are paid positive-net purchases for non-canceled events. Exactly one distinct qualifying event and granted marketing consent are required. Multiple orders for the same show do not make a repeat buyer. Future recommendations must fit date/budget/admission constraints, have inventory, be on sale, and be neither already purchased nor explicitly rejected. Correcting the original taste assumption stops first-event genre/artist inference.

A campaign freezes its cohort, cutoff and original qualification evidence. Approval binds exact content, recipients, recommendations, provenance, constraints and relevant input versions. Edits, stock changes or new purchases require review; export rechecks current eligibility. CSV/JSON export history is immutable and messages remain marked “not sent.”

The endpoint is a later qualifying purchase for a different event, after the first purchase and no later than exactly 30×24 hours after it. Only a fully observed window enters the rate denominator; an empty mature denominator has no percentage. Mature results freeze at the first persisted observation with observation time, window end and purchase revision evidence. Subsequent corrections remain in order history but do not silently rewrite that snapshot. This prototype has no operator reconciliation UI for revising a previously frozen result.

Click association requires the same campaign, buyer and event and a click preceding or simultaneous with the recorded purchase. It is observational. Delivered counts remain zero. Sample orders affect sample metrics only. Simulated time is distinct from actual provider retrieval timestamps.

## Delivery and future evaluation

This repository is MIT licensed. No public repository, deployment or Devpost submission is claimed. For an authorized Vercel deployment, build this project with the committed npm lockfile. Keep live routes disabled for a sample-only deployment; configure the above shared limits and secrets before enabling live calls. Test through the judging period. Submission and demo drafts are in `docs/`.

A future paid pilot would randomize consenting eligible buyers between the same feasible catalog ordered by genre/date and Qloo-assisted ordering, with a predeclared distinct-event purchase endpoint. Willingness to pay, incremental impact, ranking superiority and product-market fit remain unproven.
