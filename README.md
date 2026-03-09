# AI Search Engine

## Project Overview
This project is a minimal web search application with an AI summary layer. Users submit a query from a simple web page, receive web search results, and view an AI-generated summary grounded in retrieved sources. The codebase is intentionally simple and explicit so the architecture and data flow are easy to review.

## Architecture Overview
- Frontend (`frontend/`): Next.js app that renders the search UI, results page, summary card, and load-more flow.
- Backend (`backend/`): Fastify + TypeScript API exposing `/search`, `/summarize`, and `/tts`.
- Search provider integration: backend calls Brave Web Search and normalizes returned results.
- AI summarization layer: backend uses OpenAI Responses API to generate summaries from top retrieved sources.
- Definition + pronunciation layer: frontend resolves definition intent via `/api/define` and plays pronunciation via `/api/tts` backed by OpenAI TTS.

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
- Definition card for definition-style queries
- Pronunciation playback (OpenAI TTS)
- Safe-mode-first search behavior
- Incremental result loading via "Load more results"

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
5. Backend generates a summary with OpenAI and returns it with sources for rendering.
6. For definition-style queries, frontend also calls `/api/define` and renders a Definition card when data is available.
7. Pronunciation button calls `/api/tts`, which forwards to backend `/tts` for OpenAI speech synthesis.

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
- `BACKEND_BASE_URL`: frontend server-side proxy target (default `http://localhost:3001`)
- `NEXT_PUBLIC_API_BASE_URL`: fallback frontend proxy target

## Future Improvements
- Better provider-level error mapping for user-facing failures
- End-to-end tests for search + summary flows
- Request-level caching strategy for repeated queries
- Optional ranking and result quality tuning
