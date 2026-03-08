# Architecture (Phase 1)

## 1. Proposed folder/file structure

```text
ai-search-engine/
  frontend/
    src/
      app/
        layout.tsx
        page.tsx                       # single search page (v1)
      components/
        SearchBar.tsx
        SafeModeToggle.tsx
        SummaryCard.tsx
        ResultList.tsx
        ErrorState.tsx
      lib/
        api-client.ts                  # calls backend /search endpoint
      styles/
        globals.css

  backend/
    src/
      main.ts                          # server bootstrap
      app.ts                           # app wiring
      routes/
        search.route.ts                # thin route/controller
      modules/
        search/
          dto.ts
          search.service.ts            # orchestrates the request flow
        providers/
          web-search/
            provider.interface.ts
            brave.provider.ts          # Brave-specific code only
          llm/
            provider.interface.ts
            openai.provider.ts         # OpenAI-specific code only
        normalize/
          normalize.service.ts         # provider output -> common shape
          dedupe.service.ts            # remove duplicate results
        safety/
          policy.ts
          safety.service.ts            # safe mode filter logic
        content/
          content-fetch.service.ts     # fetch top source pages
          extract.util.ts              # extract readable text/snippets
        summarization/
          prompt-builder.ts
          summarization.service.ts     # GPT summary + citations
        cache/
          cache.service.ts             # in-memory TTL cache
          cache-keys.ts
      config/
        env.ts
        logger.ts
      shared/
        errors/
          app-error.ts
          error-handler.ts
        utils/
          url.util.ts
          text.util.ts

  shared/
    contracts/
      search.ts                        # shared frontend/backend DTOs

  docs/
    architecture.md
  .env.example
  README.md
```

## 2. Responsibility of each folder

- `frontend/src/app`: page layout and route entrypoints.
- `frontend/src/components`: UI-only components, no backend logic.
- `frontend/src/lib`: API client and frontend-side request helpers.
- `backend/src/routes`: HTTP route definitions and thin handlers.
- `backend/src/modules/search`: orchestrates the end-to-end search pipeline.
- `backend/src/modules/providers`: isolated third-party integrations.
- `backend/src/modules/normalize`: common result mapping and dedupe.
- `backend/src/modules/safety`: safe-mode policy + filtering.
- `backend/src/modules/content`: source fetch/extract for stronger summaries.
- `backend/src/modules/summarization`: prompt building + GPT summary + citations.
- `backend/src/modules/cache`: simple in-memory caching.
- `backend/src/config`: env parsing and minimal logger setup.
- `backend/src/shared`: shared errors and utility helpers.
- `shared/contracts`: request/response contracts shared by web + backend.

## 3. Request flow (search query -> final response)

1. User enters a query on the single search page; `safeMode` defaults to `true`.
2. Frontend calls backend `POST /search` with query + options.
3. Route validates input and delegates to `search.service`.
4. Service checks in-memory cache by a deterministic key (`query + safeMode + paging`).
5. On cache miss, service calls Brave provider.
6. Provider returns raw results; normalize module maps to common schema.
7. Dedupe module removes duplicate URLs/content-near-duplicates.
8. Safety module filters unsafe results according to policy.
9. Content module fetches/extracts text from top safe results (bounded count/timeouts).
10. Summarization module builds grounded prompt from extracted text + metadata.
11. OpenAI provider returns summary text; summarization module attaches citations.
12. Final payload is cached and returned: summary, citations, filtered results, metadata.
13. Frontend renders summary + source links + result list.

## 4. External integrations needed

- Brave Search API: wide-web live search.
- OpenAI API: GPT summarization.
- HTTP + HTML extraction libs (`node-fetch`, `cheerio`): fetch/extract source content.
- In-memory cache (built-in process memory): v1 cache layer.

## 5. Deferred to v2

- Authentication/authorization.
- Billing/subscriptions.
- Analytics dashboards/admin panel.
- Microservices and distributed orchestration.
- Redis/distributed cache.
- Vector database/embeddings.
- Custom crawler/indexing pipeline.
- Personalization/history/profiles.
- Advanced infra (queues, workers, complex observability stack).

## Notes for v1 discipline

- Keep controllers thin and explicit.
- Keep provider-specific code isolated.
- Prefer straightforward code over abstraction-heavy patterns.
- Make smallest safe changes per subsystem.
