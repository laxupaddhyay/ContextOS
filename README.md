# ContextOS

ContextOS is a secure, workspace-scoped knowledge assistant prototype. This repository is the first runnable MVP foundation: a Spring Boot API, FastAPI AI service, React UI, PostgreSQL with pgvector, and RabbitMQ in Docker Compose.

## Start locally

1. Install Docker Desktop with Compose.
2. Copy `.env.example` to `.env`, replace `AI_SERVICE_TOKEN` with a long random value, and set `OPENAI_API_KEY` to enable generated answers and semantic embeddings. Without a key, the app falls back to workspace-scoped full-text retrieval; semantic search is backfilled automatically after a key is added and services are restarted.
3. Run `docker compose -f infra/compose.yaml up --build`.
4. Open http://localhost:5173. API health: http://localhost:8080/actuator/health; AI health: http://localhost:8000/health.

Docker Compose defaults to the `local` profile for the demo identity. For OIDC setup and deployment configuration, see [docs/authentication.md](docs/authentication.md). The API validates the OIDC issuer, access token time claims, and audience outside the local profile. The AI service requires the shared `AI_SERVICE_TOKEN`; the default token is for local use only. Workspace and document authorization are enforced server-side. Never expose the local demo profile to the public internet.

## Current MVP slice

- Workspace-scoped document upload and metadata listing.
- Async RabbitMQ ingestion messages (opaque document IDs only), signature checks, checksum deduplication, PDF/DOCX/Markdown extraction, page-aware PDF chunks with overlap, bounded retries, stale-job recovery, and visible status.
- Workspace-scoped hybrid PostgreSQL full-text and pgvector retrieval, AI-side reranking, bounded model calls, source-ID citation validation, and latency/token metadata when the provider supplies usage.
- Persistent conversations with message history, per-answer source metadata, and one feedback rating per user/message.
- The UI supports upload, failed-job retry, deletion, processing status, cited answers, saved chat history, and answer feedback.
- PostgreSQL migrations, health endpoints, environment example, authentication/architecture/security notes, and a versioned synthetic retrieval evaluation set.

Generation is configurable through `GENERATION_MODEL`; embeddings use `EMBEDDING_MODEL` (default `text-embedding-3-small`, 1536 dimensions). Embeddings are optional: unavailable embedding calls leave chunks searchable through PostgreSQL full-text search. Existing chunks without vectors are backfilled by the ingestion worker once embeddings are available. Run the synthetic retrieval comparison with `cd services/ai && pip install -r requirements-dev.txt && python evaluate_retrieval.py`; the hybrid score requires `OPENAI_API_KEY` and is a proxy benchmark, not a production quality claim. Do not claim evaluation quality or production readiness until evaluation and security work is completed.

## Repository layout

```text
apps/web/                 React + TypeScript UI
services/api/             Spring Boot API
services/ai/               FastAPI extraction, chunking, retrieval helpers, generation
infra/compose.yaml         Local PostgreSQL, RabbitMQ, API, AI, and web services
docs/                      Architecture, security, evaluation notes
evals/                     Versioned starter questions
```

## Development

API local demo: `cd services/api && mvn spring-boot:run -Dspring-boot.run.profiles=local` (requires Maven). Without the `local` profile, configure OIDC first. AI: `cd services/ai && pip install -r requirements.txt && uvicorn app.main:app --reload`. Web: `cd apps/web && npm install && npm run dev`.

Run the AI service checks with `cd services/ai && pip install -r requirements-dev.txt && pytest`.

Uploads are limited to 20 MiB. File content and conversation messages are stored in PostgreSQL/the local `uploads` volume. The AI endpoint requires `X-Service-Token`; requests from the API add it automatically. This prototype has no malware scanning, Redis rate limiting, or production object storage. Use synthetic, non-sensitive data.
