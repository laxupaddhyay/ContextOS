# Architecture

The local demo is a modular monolith API plus a separate AI service. Spring Boot owns workspace membership, file metadata, storage keys, conversation history, feedback, and the authorization-filtered chunk query. RabbitMQ carries only an opaque document UUID. The ingestion listener extracts text and writes chunks to PostgreSQL. The AI service ranks only the passages supplied by the API and optionally calls the configured generation provider.

## Trust boundary

The browser is untrusted. Every workspace API resolves the development identity and checks membership on the server. Both stateless `/workspaces/{id}/ask` and persistent `/conversations/{id}/messages` query `document_chunks` joined to READY documents by workspace before sending passage text to the AI service. Conversation lookup also checks the member's workspace. Message feedback is scoped the same way. The AI endpoint checks a shared service token; keep it secret and restrict network access in deployment.

## Prototype limitations

The API narrows candidates with PostgreSQL full-text search, then the AI service reranks candidates with BM25. PDF passages retain page numbers; chunks overlap to reduce boundary loss. Failed jobs have a three-attempt bound, and a scheduled recovery pass reclaims queued or stale work. Conversations persist user/assistant messages and answer metadata, while feedback is upserted once per user and assistant message. This schema stores text chunks but not embeddings. The plan's pgvector semantic retrieval, model reranking, full retrieval evaluation, robust OIDC, dead-letter handling, and production observability remain follow-on work. Avoid presenting this prototype as a fully realized production RAG system.
