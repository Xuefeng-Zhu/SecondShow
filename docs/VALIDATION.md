# Validation record

The following historical checks were run locally on October 29–30, 2026, before removal of the application quota guard. They use synthetic records and mocked upstream responses unless stated otherwise; they do not verify the changed guard.

## Executed checks

| Command | Final result | Coverage |
| --- | --- | --- |
| `npm test` | 44 passed, 0 failed | Domain, imports, historical snapshots, approval/export, actual adapter/orchestration interfaces with mocked HTTP, shared quota fail-closed behavior, timeout/error handling |
| `npm run lint` | Passed | ESLint with Next/React/TypeScript rules |
| `npm run typecheck` | Passed | Application and server TypeScript |
| `npm run test:e2e` | 5 Chromium tests passed | Fresh isolated local server on port 3100; details below |
| `npm run build` | Passed | Optimized Next.js production build, including campaign-plan/Qloo/Nebius model routes |
| Bounded real-provider orchestration check | Passed on October 30 | One real Qloo ranking and two real Nebius tool calls returned a proposed fictional event; 940 reported tokens in this run |
| `RUN_QLOO_LIVE_VERIFY=1 node scripts/verify-qloo-live.mjs` | Passed on October 30 | Actual UI identity searches/confirmation, real single-candidate Qloo rank/explanation, cache and then-expected model-unconfigured UI error |
| `RUN_NEBIUS_LIVE_VERIFY=1 node scripts/verify-nebius-live.mjs` | Passed on October 30 | Actual local UI searches, live Qloo + Nebius planning, human approval and export enablement; fictional booking and sample customers |

The browser tests cover:

1. Sample load → draft → sold-out change → replan → human approval → export → recipient preview → simulated checkout → sample purchase at the current business clock → explicit clock advance → outcomes. Refresh preserves state, separate browser contexts start without shared data, and resetting one context does not reset the other.
2. Mocked live artist resolution and confirmation → a Qloo/model proposal that actually changes campaign order → stored evidence and approval. Equivalent shortlists produce one request, no customer data is sent, and constraint edits disable export.
3. A visible mocked authentication failure with no automatic fixture fallback; an explicit operator mode change permits the deterministic baseline.
4. A delayed live response cannot restore a reset workspace.
5. Keyboard queue editing updates the selected buyer’s invitation, invalidates approval, exports honest operator-curated provenance with no stale provider evidence, and fits 320/390-pixel screens. Opening review also moves focus and scrolls the review heading into view. Final production screenshots additionally check 768/1024/1440 pixels and a visible fixed review action without browser errors.

The original in-app-browser manual journey also ran. The final production server was started at http://127.0.0.1:3000, refreshed in the in-app browser, and a fresh fictional sample was loaded for handoff. This is local only.

## Historical and provenance safeguards

Cohort qualification orders are copied at cutoff. Accepted order revisions are append-only, and equal/older reimports are ignored. Event/consent updates have freshness checks. Mature outcome snapshots preserve observation time, window end and the purchase revisions that supported the result. Later refunds do not silently rewrite an already frozen observation; the prototype does not include a reconciliation UI to revise a historical snapshot.

Manual recipient removals survive replanning without changing the frozen denominator. Correcting the original taste assumption stops artist/genre inference from that purchase. Approval binds current eligibility, recommendations, copy, constraints, provenance and catalog facts. CSV and JSON exports retain immutable historical snapshots and say messages have not been sent.

The sample chronology places every purchase before its show. Sample purchases are recorded at the current demo clock. They are no longer backdated. Clock advancement is explicitly fictional, and observation maturity is separate from actual provider retrieval time.

## Real-provider results and remaining blocker

Qloo access is now live verified with the user-authorized event credential. Only project-local server configuration was written, with mode 0600 and ignored `.env*` storage. The issued host `https://hackathon.api.qloo.com` and X-Api-Key contract were confirmed from event instructions, official docs and real responses. Two UI searches and explicit identity confirmation, single-candidate ranking with explainability, and cached repetition passed. The final evidence is `artifacts/SecondShow-qloo-live-verification.json`. The initial attempt’s final alert-selector ambiguity was corrected; both attempts are documented in ACCESS.md. A post-build scan of all 12 client bundle files and 83 other project files found no credential value; the Qloo secret was stored in mode-0600 `.env.local` at that time. Results are in `artifacts/SecondShow-qloo-credential-check.json`.

With user authorization, the existing IncidentCourt Nebius key and explicit `nvidia/nemotron-3-super-120b-a12b` model were configured in the protected server environment. A bounded real orchestration run returned HTTP 200 for Qloo and both Nebius completions and proposed one fictional event. The two model responses reported a total of 940 tokens for that run; price was not reported. A separate actual browser test passed two artist searches and the guarded live campaign route, required human approval and enabled export afterward. Browser-run token usage was not captured. Its evidence is `artifacts/SecondShow-nebius-live-ui-verification.json`. No messages were sent. This single-candidate test does not establish ranking superiority or conversion impact.

Eight model-adapter tests also use Nebius fixtures, and the orchestration HTTP mock verifies alias-only prompts, slash-containing model IDs and the assistant/tool conversation. The previously observed missing-configuration response remains documented in `artifacts/SecondShow-nebius-configuration-check.json` as historical evidence, not the current configuration.

The earlier production quota guard used shared Upstash operations that were mocked, not live tested. The application quota and Redis requirement have since been removed. Production live routes require Vercel and an exact allowed HTTPS origin; the origin check is not authentication. The application has no shared quota or rate limit, and public live requests can incur provider charges. Configure provider account spending limits and monitor usage. The hosted live-provider flow and the changed guard require separate verification.

## Remaining product limits

The model executes a fixed bounded inspect-and-propose task, rather than arbitrary natural-language campaign interpretation. It never approves, sends, grants consent, changes price or invents catalog events. Native Node tests, explicit runtime validators, CSS and npm are used in place of the plan's default Vitest/Zod/Tailwind/pnpm choices. The npm lockfile is included; the public repository is https://github.com/Xuefeng-Zhu/SecondShow.

There is no evidence of conversion lift, ranking superiority, paid demand or product-market fit. CSV inventory is a snapshot, not a reserved seat. Imported data is synthetic/anonymized only, and this one-venue MVP accepts USD prices. There is no delivery connector or payment processing. The public sample-mode deployment was accessible on October 30; that does not verify the hosted live-provider flow or a Devpost submission.

## Invitation-copy regression (October 30)

The live proposal now replaces the pending placeholder with a neutral application template only when a candidate is proposed; operator edits are preserved. Empty and pending placeholder copy fail approval and export, including older saved approvals. Mocked regression coverage passed. A subsequent authorized browser run used real Qloo and Nebius, confirmed human approval, and verified that the sample CSV contained the complete copy; see `artifacts/SecondShow-live-copy-fix-verification.json`. The earlier live demo was recorded before this fix and visibly contains the old placeholder.
