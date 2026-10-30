# Nebius Token Factory integration

The model provider is now Nebius Token Factory. The adapter targets the fixed official endpoint `https://api.tokenfactory.nebius.com/v1/chat/completions` and does not accept a client-supplied URL or fall back to OpenAI/OpenRouter. The existing Qloo credential and sample journey remain separate.

## Current status

On October 30, 2026, the user authorized configuring an existing IncidentCourt Nebius key in the project’s ignored server-only `.env.local` and running a small live test. The file is mode 0600; no key value is included in this document. The explicitly configured model is `nvidia/nemotron-3-super-120b-a12b`.

A real nonpersonal orchestration run returned HTTP 200 from Qloo and both Nebius completions, and proposed one eligible fictional event. Nebius reported 373 input and 26 output tokens for the first completion, and 473 input and 68 output tokens for the second: 940 tokens total for that run. Cost was not reported. A separate local browser test used two real artist identity searches, a fictional booking and sample customers; the live campaign API succeeded, required human approval, and enabled export after approval. Its token usage was not captured. See `artifacts/SecondShow-nebius-live-ui-verification.json`. These checks do not establish comparative ranking quality, conversion impact or production readiness.

## Configuration and bounded testing

To enable live planning elsewhere, configure `NEBIUS_API_KEY` and an explicit function-calling `NEBIUS_MODEL` in the protected server environment, alongside the Qloo configuration and `ENABLE_LIVE_PROVIDERS=true`. Never paste a key into chat. The model has no implicit default or endpoint fallback; production additionally requires Vercel and the exact allowed HTTPS origin documented in README. The origin check is not authentication, and the application has no quota or rate limit; public live requests can incur provider charges. Configure provider account spending limits and monitor usage. Persist credentials and run paid inference only with the user’s authorization. No account, key, subscription, deployment or dedicated endpoint was created.

Use one small, fictional, nonpersonal shortlist for an authorized live test. The opt-in `npm run smoke:live` requires explicit flags, confirmed Qloo IDs and model configuration documented in README; it makes at most one Qloo ranking request and two Nebius completions. Each completion has a 400-token output cap and 12-second deadline, with no retry. Up to 50 alias/rank pairs are input, and no buyer or venue IDs are sent to the model. This is a token/request bound, not a dollar spending cap.

The first completion must call `inspect_candidates`. The server returns the sorted candidate aliases as a tool result. The second must call `propose_events`, and every returned ID must belong to that list. Parallel/unexpected/duplicate calls, invented IDs, truncated/oversized responses and provider failures are rejected. Human review remains mandatory for application and export.

The current guarded route rejects absent or invalid Nebius configuration before making any Qloo or model request. Provider authentication and rate-limit errors stay visible and never silently switch providers or use sample results.

## Official references

- [Quickstart and endpoint](https://docs.tokenfactory.nebius.com/quickstart)
- [Function calling and forced tool choice](https://docs.tokenfactory.nebius.com/ai-models-inference/function-calling)
- [Chat Completions reference](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion)

These sources establish the wire contract. A model example in documentation is not a verified availability or price commitment for this account.
