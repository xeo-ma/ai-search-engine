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
- Summary confidence gate to suppress low-confidence summaries
- Optional `Show evidence` toggle for claim + evidence expansion
- Sources visible by default, even when evidence stays collapsed
- Definition card for definition-style queries
- Pronunciation playback (OpenAI TTS)
- Safe-mode-first search behavior
- `Safe search` setting with real retrieval impact:
  - Brave provider `safesearch` integration
  - backend reranking for low-trust, spammy, and sensitive result demotion
- Incremental result loading via "Load more results"
- URL query persistence (`/?q=...`) with auto-run on page load
- Minimal error states (search failure, no results, summary failure)
- Optional `System trace` panel for compact technical trace details
- Auth system with:
  - email/password sign up and sign in
  - email magic-link sign in when SMTP is configured
  - forgot/reset password flows
- Billing system with:
  - Stripe Checkout upgrade flow
  - Stripe Billing Portal access
  - server-authoritative `free` / `pro` entitlement gating
  - `Deep search` availability tied to account entitlement

## Tech Stack
- TypeScript
- Next.js 14 + React 18
- Fastify
- Zod
- OpenAI Responses API (`gpt-5-mini`)
- Brave Search API
- Auth.js
- Prisma
- Stripe
- pnpm

## Project Structure
- `frontend/`: Next.js client and API route proxies
- `backend/`: Fastify API, provider integrations, summarization orchestration
- `shared/`: shared contracts/types across packages
- `docs/`: architecture notes and supporting docs

## Request Flow
1. User submits a query in the frontend.
2. Frontend calls its server route (`/api/search`), which forwards to backend `/search`.
3. Backend fetches and normalizes results from Brave Search, applies safe-search and quality reranking, then returns results to the frontend.
4. Frontend sends top results to `/api/summarize`, which forwards to backend `/summarize`.
5. Backend generates summary text plus claim/evidence metadata with OpenAI Responses API; backend applies filtering/ranking heuristics and limits display sources to top 3.
6. Frontend renders compact AI Summary by default. If claims exist, users can expand `Show evidence` to view claim-grouped evidence rows; when expanded, the bottom Sources list is hidden.
7. For definition-style queries, frontend also calls `/api/define` and renders a Definition card when data is available.
8. Pronunciation icon calls `/api/tts`, which forwards to backend `/tts` for OpenAI speech synthesis.

## Auth and Billing
- Auth is handled in the Next.js app with Auth.js + Prisma.
- Supported auth paths:
  - email/password sign up and sign in
  - magic-link sign in when SMTP is configured
  - forgot-password and reset-password via emailed reset links
- Billing is handled in the Next.js app with Stripe:
  - `/api/billing/checkout`
  - `/api/billing/portal`
  - `/api/billing/webhook`
- Plan enforcement is server-authoritative:
  - the client may request `Deep search`
  - the server decides whether it is allowed and applied based on the authenticated user's entitlement

## Database
- Prisma now targets PostgreSQL for production use.
- Neon is the intended hosted database for auth, subscription, entitlement, preference, usage, and password-reset state.
- Production requires applying the Prisma schema to Neon before auth or billing will work correctly.

## Safe Search
- `Safe search` defaults to `On` and is exposed as an advanced setting in the app.
- `On` combines two layers:
  - Brave Search `safesearch=strict`
  - backend reranking that demotes low-trust, spammy, and sensitive-result patterns
- `Off` broadens provider retrieval (`safesearch=off`) but still keeps backend quality reranking in place.
- The goal is broader retrieval without letting obvious low-quality sources dominate top results.

## System Trace
- The `System trace` panel is an optional technical details view, not a raw debug dump.
- It shows compact retrieval and answer metadata such as:
  - query and detected intent
  - expanded queries
  - retrieval and summary counts
  - selected sources
  - latency and claim count
  - compact ranking audit details for safe-mode/reranking effects

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
6. Run offline summary quality evaluation:
```bash
pnpm eval:summaries
```

## Quality Checks
- Offline summary/evidence eval dataset and scoring harness:
  - fixtures: `eval/queries.json`
  - runner: `scripts/eval-summaries.mjs`
  - command: `pnpm eval:summaries`
- CI runs this eval in CL checks to catch summary-quality regressions.

## Environment Variables
Create a `.env` file at the repository root.

Required for backend (Render or equivalent):
- `BRAVE_SEARCH_API_KEY`: Brave Search API key
- `OPENAI_API_KEY`: OpenAI API key (used for AI summaries and TTS)

Required for frontend app (Vercel or equivalent):
- `DATABASE_URL`: PostgreSQL connection string (Neon recommended)
- `AUTH_SECRET`: Auth.js secret
- `NEXTAUTH_URL`: public app URL used by Auth.js
- `NEXT_PUBLIC_APP_URL`: public app URL used for billing redirects and reset links
- `BACKEND_BASE_URL`: backend API base URL
- `STRIPE_SECRET_KEY`: Stripe secret key
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret
- `STRIPE_PRO_PRICE_ID`: Stripe recurring price ID for the Pro plan

Required for email auth/reset flows:
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_FROM`

Optional:
- `HOST`: backend host (default `0.0.0.0`)
- `PORT`: backend port (default `3001`)
- `OPENAI_TTS_MODEL`: TTS model (default `gpt-4o-mini-tts`)
- `OPENAI_TTS_VOICE`: TTS voice (default `alloy`)
- `OPENAI_TTS_RESPONSE_FORMAT`: TTS output format (default `wav`)
- `DICTIONARY_API_BASE_URL`: definition provider base URL override
- `DATAMUSE_API_BASE_URL`: fallback definition provider base URL override
- `NEXT_PUBLIC_API_BASE_URL`: fallback frontend proxy target

## Deployment Notes
- Recommended production split:
  - frontend/auth/billing on Vercel
  - search/summarization backend on Render
  - PostgreSQL on Neon
  - transactional email via SMTP provider (for example Postmark)
- Required production step:
  - run Prisma schema deployment against the Neon `DATABASE_URL`
- Required Stripe webhook endpoint:
  - `https://your-domain.com/api/billing/webhook`
- Recommended Stripe events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## Future Improvements
- Better provider-level error mapping for user-facing failures
- Live production smoke automation for hosted auth/billing flows
- Redis-backed cache for multi-instance deployments
- Additional ranking and source-quality tuning
- Forgot-password rate limiting and token cleanup

## Known Limitations
- Current caches are in-memory and process-local (not shared across instances).
- Evidence-to-claim mapping uses deterministic heuristics, not perfect sentence-level citation mapping.
- Sources list is intentionally hidden while evidence is expanded to reduce duplicate verification UI.
- `Safe search` policy is heuristic and provider-assisted, not a full custom moderation system.
- Auth and billing are production-capable, but still depend on correct SMTP, Stripe webhook, and deployed env configuration.

## License
All rights reserved — see the [LICENSE](/Users/xeo/code/projects/ai-search-engine/LICENSE) file for details.
