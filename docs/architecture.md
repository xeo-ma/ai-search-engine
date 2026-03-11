# Architecture

## System shape

- `frontend/` (Next.js 14, React 18): UI rendering, URL query state (`?q=`), and server-side API proxy routes.
- `backend/` (Fastify + TypeScript): search retrieval, summarization orchestration, source ranking/filtering, and TTS.
- `shared/` contracts: request/response types shared across app boundaries where needed.
- `frontend/` also owns auth, billing, and account-state enforcement:
  - Auth.js
  - Prisma
  - Stripe checkout/portal/webhook routes

## Core backend modules

- `backend/src/modules/search`: Brave provider integration, result normalization, safe-mode handling, quality reranking, and page-based paging (`offset: 0,1,2...`).
- `backend/src/modules/summarization`: summary generation, claim extraction, evidence mapping, source selection, and fallback behavior.
- `backend/src/modules/tts`: OpenAI TTS integration with in-memory audio cache.
- `backend/src/modules/cache`: lightweight in-memory cache utility used by search.

## Auth and billing modules

- `frontend/src/lib/auth.ts`: Auth.js configuration, credentials auth, magic-link provider wiring, and session callbacks.
- `frontend/src/lib/db.ts`: Prisma client.
- `frontend/src/lib/account-state.ts`: server-side account state, entitlements, preferences, and usage helpers.
- `frontend/src/app/api/auth/*`: register, forgot-password, reset-password, and Auth.js routes.
- `frontend/src/app/api/billing/*`: Stripe checkout, billing portal, and webhook routes.

## Request flow

1. User submits a query in the frontend search bar.
2. Frontend calls `frontend/src/app/api/search/route.ts`, which proxies to backend `POST /search`.
3. Backend queries Brave Search, normalizes results, dedupes by URL, reranks for quality, and returns results + paging metadata.
4. Frontend renders results, then calls `frontend/src/app/api/summarize/route.ts` with top results.
5. Backend `POST /summarize`:
   - ranks and filters candidate sources,
   - calls OpenAI Responses API (`gpt-5-mini`) with web search grounding,
   - parses grounded source metadata (`web_search_call.action.sources`, `file_search_call.results` when present),
   - applies a summary confidence gate (suppresses summary when evidence confidence is low),
   - returns summary + claims + evidence sources.
6. Frontend renders:
   - compact AI Summary by default,
   - optional `Show evidence` toggle when claims exist,
   - claim-grouped evidence rows when expanded,
   - bottom Sources list only while evidence is collapsed.
7. For definition-style queries, frontend calls `GET /api/define`:
   - provider chain: Dictionary API first, Datamuse fallback.
8. Pronunciation requests call `GET /api/tts` and stream OpenAI-generated audio.

## Auth and billing flow

1. User signs up or signs in through the Next.js app.
2. Auth.js resolves the authenticated session in frontend API routes.
3. `frontend/src/app/api/account/route.ts` resolves effective account state from Prisma:
   - plan
   - deep-search availability
   - deep-search preference
   - free-plan usage remaining
4. Search requests remain client-initiated, but plan enforcement is server-authoritative.
5. Stripe checkout starts from `frontend/src/app/api/billing/checkout/route.ts`.
6. Stripe webhook updates:
   - `Subscription`
   - `Entitlement`
7. Billing portal access is served by `frontend/src/app/api/billing/portal/route.ts`.

## Search quality and safe mode

- Search retrieval is provider-backed but not provider-only.
- The backend applies a second ranking layer after retrieval:
  - low-trust domain demotion
  - spammy/listicle-style result demotion
  - safe-mode-sensitive demotion for explicit or graphic result text when `safeMode` is on
- Educational, medical, academic, historical, and news contexts receive lighter sensitive demotion than clearly explicit results.
- `safeMode: false` broadens provider retrieval but does not disable source-quality reranking.

## Trace and audit surface

- The frontend `System trace` panel is the only place where compact ranking audit details are exposed.
- The audit data is aggregate-only:
  - safe search level
  - whether reranking was applied
  - counts for low-trust, spam, and sensitive demotions
  - top demotion reasons
- Raw scores, prompts, secrets, and per-result internal details are intentionally not exposed in the main UI.

## Caching strategy (current)

- Backend summarization cache: in-memory TTL cache keyed by normalized query + top result fingerprint.
- Frontend summarize route cache: in-memory TTL cache for repeated summarize requests from the UI.
- Backend TTS cache: in-memory cache keyed by voice/model/format/text.

These caches are process-local and are intended for single-instance deployments.

## Error handling model

- Search failure: explicit user-facing retry message.
- No results: results page still renders with empty-state messaging.
- Summary failure: results remain visible; summary section shows fallback error copy and any available sources.
- Low-confidence evidence: summary is suppressed and a reliability-focused fallback message is returned.
- Definition lookup failure: definition card is omitted without blocking search results.

## Quality evaluation

- Offline eval dataset: `eval/queries.json`.
- Scoring harness: `scripts/eval-summaries.mjs`.
- Command: `pnpm eval:summaries`.
- CI includes this eval step in CL checks to catch quality regressions.

## Intentional constraints

- Keep search retrieval and summarization as separate backend paths.
- Keep AI as a non-blocking enhancement over core results.
- Keep provider-specific code isolated from route/controller layers.
- Keep UI minimal and interview-defensible with explicit data flow.
- Keep plan gating and deep-search enforcement server-authoritative.
- Keep sources visible by default and evidence optional.
