# AI Search Engine
[![CL Checks](https://github.com/xeo-ma/ai-search-engine/actions/workflows/cl-checks.yml/badge.svg)](https://github.com/xeo-ma/ai-search-engine/actions/workflows/cl-checks.yml)

## Project Overview
This project is a minimal web search application with an AI summary layer. Users submit a query from a simple web page, receive web search results, and view an AI-generated summary grounded in retrieved sources. The codebase is intentionally simple and explicit so the architecture and data flow are easy to review.

## Architecture Overview
- Frontend (`frontend/`): Next.js app that renders the search UI, results page, summary card, and load-more flow.
- Backend (`backend/`): Fastify + TypeScript API exposing `/search`, `/summarize`, and `/tts`.
- Search provider integration: backend calls Brave Web Search and normalizes returned results.
- AI summarization + evidence layer: backend uses OpenAI Responses API (`gpt-5-mini`) to return a concise summary, structured claims, and grounded evidence sources.
- Definition + pronunciation layer: frontend resolves definition intent via `/api/define` (Dictionary API, then Datamuse fallback) and plays pronunciation via `/api/tts` backed by OpenAI TTS.

## Design Principles
- Search-first user experience: the primary flow centers on query input and result retrieval before any secondary processing.
- AI summary as a non-blocking enhancement: summary generation runs after results load so search remains usable even if summarization fails.
- Server-side AI integration: external API keys and model calls stay in backend services, not in browser clients.
- Separation of retrieval and summarization: `/search` and `/summarize` are distinct backend paths with separate responsibilities.
- Minimal UI surface area: the frontend keeps a small, focused interface (search, results, summary, load more) without unrelated product layers.
- Explicit and readable architecture: modules and routes favor straightforward logic and clear data flow over heavy abstraction.

## Key Features
- Web page with a search bar
- Results page with web result cards
- AI-generated summary with source links
- Optional `Show evidence` toggle for claim + evidence expansion
- Definition card for definition-style queries
- Pronunciation playback (OpenAI TTS)
- Safe-mode-first search behavior
- Incremental result loading via "Load more results"
- URL query persistence (`/?q=...`) with auto-run on page load
- Minimal error states (search failure, no results, summary failure)

## Tech Stack
- TypeScript
- Next.js 14 + React 18
- Fastify
- Zod
- OpenAI Responses API (`gpt-5-mini`)
- Brave Search API
- pnpm

## Project Structure
- `frontend/`: Next.js client and API route proxies
- `backend/`: Fastify API, provider integrations, summarization orchestration
- `shared/`: shared contracts/types across packages
- `docs/`: architecture notes and supporting docs

## Request Flow
1. User submits a query in the frontend.
2. Frontend calls its server route (`/api/search`), which forwards to backend `/search`.
3. Backend fetches and normalizes results from Brave Search, then returns results to the frontend.
4. Frontend sends top results to `/api/summarize`, which forwards to backend `/summarize`.
5. Backend generates summary text plus claim/evidence metadata with OpenAI Responses API; backend applies filtering/ranking heuristics and limits display sources to top 3.
6. Frontend renders compact AI Summary by default. If claims exist, users can expand `Show evidence` to view claim-grouped evidence rows; when expanded, the bottom Sources list is hidden.
7. For definition-style queries, frontend also calls `/api/define` and renders a Definition card when data is available.
8. Pronunciation icon calls `/api/tts`, which forwards to backend `/tts` for OpenAI speech synthesis.

## Running the Project
1. Install dependencies:
```bash
pnpm install
pnpm --dir frontend install
pnpm --dir backend install
```
2. Configure environment variables (see below).
3. Start the backend:
```bash
pnpm --dir backend dev
```
4. In a separate terminal, start the frontend:
```bash
pnpm --dir frontend dev
```
5. Open `http://localhost:3000`.

## Environment Variables
Create a `.env` file at the repository root.

Required for backend:
- `BRAVE_SEARCH_API_KEY`: Brave Search API key
- `OPENAI_API_KEY`: OpenAI API key (used for AI summaries and TTS)

Optional:
- `HOST`: backend host (default `0.0.0.0`)
- `PORT`: backend port (default `3001`)
- `OPENAI_TTS_MODEL`: TTS model (default `gpt-4o-mini-tts`)
- `OPENAI_TTS_VOICE`: TTS voice (default `alloy`)
- `OPENAI_TTS_RESPONSE_FORMAT`: TTS output format (default `wav`)
- `DICTIONARY_API_BASE_URL`: definition provider base URL override
- `DATAMUSE_API_BASE_URL`: fallback definition provider base URL override
- `BACKEND_BASE_URL`: frontend server-side proxy target (default `http://localhost:3001`)
- `NEXT_PUBLIC_API_BASE_URL`: fallback frontend proxy target

## Future Improvements
- Better provider-level error mapping for user-facing failures
- End-to-end tests for search + summary flows
- Redis-backed cache for multi-instance deployments
- Additional ranking and source-quality tuning

## Known Limitations
- Current caches are in-memory and process-local (not shared across instances).
- Evidence-to-claim mapping uses deterministic heuristics, not perfect sentence-level citation mapping.
- Sources list is intentionally hidden while evidence is expanded to reduce duplicate verification UI.

## License
This project is licensed under the MIT License — see the LICENSE file for details.
