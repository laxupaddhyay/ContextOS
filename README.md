# ContextOS

ContextOS is a secure, workspace-scoped knowledge assistant prototype. This repository is the first runnable MVP foundation: a Spring Boot API, FastAPI AI service, React UI, PostgreSQL with pgvector, and RabbitMQ in Docker Compose.

## Start locally

1. Install Docker Desktop with Compose.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` if you want generated embeddings and answers. Without a key, the AI service uses a local deterministic fallback suitable for smoke demos; results are not benchmark quality.
3. Run `docker compose -f infra/compose.yaml up --build`.
4. Open http://localhost:5173. API health: http://localhost:8080/actuator/health; AI health: http://localhost:8000/health.

The demo API uses a development identity header (`X-User-Id`) and creates a default workspace for that user. Replace this with OIDC before deployment. Workspace and document authorization are enforced server-side. Never expose this development setup to the public internet.

## Current MVP slice

- Workspace-scoped document upload and metadata listing.
- Async RabbitMQ ingestion messages (opaque document IDs only), text extraction for Markdown, PDF, and DOCX, chunk storage, and safe processing status.
- Question endpoint filters chunks by workspace and membership before context is sent to the AI service. Citation IDs are checked against retrieved chunks.
- Minimal browser UI for upload, status, and asking questions.
- PostgreSQL migrations, health endpoints, environment example, architecture/security notes, and a versioned evaluation set starter.

Generation and embeddings are provider-adaptable. Configure `OPENAI_API_KEY` and model names in `.env` for hosted model access. Do not claim evaluation quality or production readiness until the evaluation and security work is completed.

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

API: `cd services/api && ./mvnw spring-boot:run` (or use Maven). AI: `cd services/ai && pip install -r requirements.txt && uvicorn app.main:app --reload`. Web: `cd apps/web && npm install && npm run dev`.

Uploads are limited to 20 MiB. File content is stored in the local `uploads` volume. This prototype has no malware scanning, OIDC, Redis rate limiting, or production object storage. Use synthetic, non-sensitive data.
