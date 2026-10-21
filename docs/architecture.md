# Architecture

The local demo is a modular monolith API plus a separate AI service. Spring Boot owns workspace membership, file metadata, storage keys, and the authorization-filtered chunk query. RabbitMQ carries only an opaque document UUID. The ingestion listener extracts text and writes chunks to PostgreSQL. The AI service ranks only the passages supplied by the API and optionally calls the configured generation provider.

## Trust boundary

The browser is untrusted. Every workspace API resolves the development identity and checks membership on the server. The `/ask` path queries `document_chunks` joined to documents by the requested workspace and READY status before sending passage text to the AI service. The AI endpoint also checks a shared service token; keep it secret and restrict network access in deployment.

## Prototype limitations

The API narrows candidates with PostgreSQL full-text search, then the AI service reranks the candidates with BM25. PDF passages retain page numbers; chunks overlap to reduce boundary loss. Failed jobs have a three-attempt bound, and a scheduled recovery pass reclaims queued or stale work. This schema stores text chunks but not embeddings. The plan's pgvector semantic retrieval, model reranking, evaluation, robust OIDC, dead-letter handling, and production observability remain follow-on work. Avoid presenting this prototype as a fully realized production RAG system.
