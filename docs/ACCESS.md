# SecondShow API access

## Current project configuration

On October 30, 2026, the project used an authorized Qloo event credential and performed live tests against `https://hackathon.api.qloo.com`. The key was stored in a server-side `.env.local`, with file mode 0600; `.env*` is ignored. It was not included in browser variables, committed source, example values, reports, screenshots or recordings.

The Qloo setup configured `QLOO_API_KEY`, `QLOO_BASE_URL` and `ENABLE_LIVE_PROVIDERS`. An authorized Nebius key and model were later configured in the protected server file; see NEBIUS.md. Local development scripts bind to 127.0.0.1.

## Observed live result

The actual app searched Japanese Breakfast and Alvvays, displayed returned identities, and explicitly confirmed the exact artists. A same-origin request through the app’s guarded Qloo route ranked the one submitted candidate, returned real explainability data, and then returned `cached_live` with the same retrieval timestamp on repetition. This verifies API connectivity, schema compatibility, candidate restriction and caching, not comparative ranking quality or conversion impact.

Two bounded verification attempts made six upstream Qloo GET requests total (two searches and one ranking each). The first reached all provider checks but its final UI assertion matched Next’s route announcer as well as the app alert; the selector was corrected and the complete second attempt passed. There was no upstream authentication or rate-limit failure. The two repeated ranking requests used cache. Two full-planning attempts returned an expected 503 `unconfigured` before making a model request.

See `artifacts/SecondShow-qloo-live-verification.json` for the final public-entity evidence and `artifacts/SecondShow-qloo-live-attempt-1.json` for the preserved initial test failure. No personal buyer information or credentials went to Qloo.

## Remaining access boundary

The October 30 live test used `nvidia/nemotron-3-super-120b-a12b`; Qloo ranking and both Nebius tool calls succeeded in a direct orchestration run. A subsequent local browser run passed live identity searches, campaign planning, human approval and export enablement with fictional booking and sample data. See NEBIUS.md and `artifacts/SecondShow-nebius-live-ui-verification.json`. The adapter uses Nebius Chat Completions and does not read OpenAI or OpenRouter credentials.

Production live calls additionally require the trusted deployment, exact origin and shared quota configuration described in `.env.example`; Redis has not been live tested. As of October 30, no public deployment or final submission had been verified.

## Official references

- [Event access guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide)
- [Search](https://docs.qloo.com/reference/get-search)
- [Parameter reference](https://docs.qloo.com/reference/parameters)

The guide, search type, candidate filter and explainability parameters were checked against official documentation. Authentication uses the event host and X-Api-Key contract, confirmed by actual responses.
