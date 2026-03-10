# Architecture

## System shape

- `frontend/` (Next.js 14, React 18): UI rendering, URL query state (`?q=`), and server-side API proxy routes.
- `backend/` (Fastify + TypeScript): search retrieval, summarization orchestration, source ranking/filtering, and TTS.
- `shared/` contracts: request/response types shared across app boundaries where needed.

## Core backend modules

- `backend/src/modules/search`: Brave provider integration, result normalization, safe-mode filtering, and page-based paging (`offset: 0,1,2...`).
- `backend/src/modules/summarization`: summary generation, claim extraction, evidence mapping, source selection, and fallback behavior.
- `backend/src/modules/tts`: OpenAI TTS integration with in-memory audio cache.
- `backend/src/modules/cache`: lightweight in-memory cache utility used by search.

## Request flow

1. User submits a query in the frontend search bar.
2. Frontend calls `frontend/src/app/api/search/route.ts`, which proxies to backend `POST /search`.
3. Backend queries Brave Search, normalizes results, dedupes by URL, and returns results + paging metadata.
4. Frontend renders results, then calls `frontend/src/app/api/summarize/route.ts` with top results.
5. Backend `POST /summarize`:
   - ranks and filters candidate sources,
   - calls OpenAI Responses API (`gpt-5-mini`) with web search grounding,
   - parses grounded source metadata (`web_search_call.action.sources`, `file_search_call.results` when present),
   - returns summary + claims + evidence sources.
6. Frontend renders:
   - compact AI Summary by default,
   - optional `Show evidence` toggle when claims exist,
   - claim-grouped evidence rows when expanded,
   - bottom Sources list only while evidence is collapsed.
7. For definition-style queries, frontend calls `GET /api/define`:
   - provider chain: Dictionary API first, Datamuse fallback.
8. Pronunciation requests call `GET /api/tts` and stream OpenAI-generated audio.

## Caching strategy (current)

- Backend summarization cache: in-memory TTL cache keyed by normalized query + top result fingerprint.
- Frontend summarize route cache: in-memory TTL cache for repeated summarize requests from the UI.
- Backend TTS cache: in-memory cache keyed by voice/model/format/text.

These caches are process-local and are intended for single-instance deployments.

## Error handling model

- Search failure: explicit user-facing retry message.
- No results: results page still renders with empty-state messaging.
- Summary failure: results remain visible; summary section shows fallback error copy and any available sources.
- Definition lookup failure: definition card is omitted without blocking search results.

## Intentional constraints

- Keep search retrieval and summarization as separate backend paths.
- Keep AI as a non-blocking enhancement over core results.
- Keep provider-specific code isolated from route/controller layers.
- Keep UI minimal and interview-defensible with explicit data flow.
