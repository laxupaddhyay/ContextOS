# Architecture

The local demo is a modular monolith API plus a separate AI service. Spring Boot owns workspace membership, file metadata, storage keys, conversation history, feedback, and the authorization-filtered chunk query. RabbitMQ carries only an opaque document UUID. The ingestion listener extracts text, requests optional embeddings in batches, and writes chunks to PostgreSQL. The AI service ranks only the passages supplied by the API and optionally calls the configured generation provider. Retrieval combines PostgreSQL full-text and cosine vector candidate ranks with reciprocal rank fusion, then reranks the bounded candidate set in the AI service.

## Trust boundary

The browser is untrusted. Every workspace API resolves the development identity and checks membership on the server. Both stateless `/workspaces/{id}/ask` and persistent `/conversations/{id}/messages` query `document_chunks` joined to READY documents by workspace before sending passage text to the AI service. Conversation lookup also checks the member's workspace. Message feedback is scoped the same way. The AI endpoint checks a shared service token; keep it secret and restrict network access in deployment.

## Prototype limitations

PDF passages retain page numbers; chunks overlap to reduce boundary loss. Failed jobs have a three-attempt bound, and a scheduled recovery pass reclaims queued or stale work. Missing chunk vectors are backfilled in batches for READY documents. If no embedding key is configured or an embedding call fails, ingestion preserves the text chunks and retrieval uses full-text search. Conversations persist user/assistant messages and answer metadata, while feedback is upserted once per user and assistant message. The synthetic retrieval evaluator compares lexical ranking with reciprocal rank fusion; it does not establish production answer quality, faithfulness, or authorization. Robust OIDC, dead-letter handling, and production observability remain follow-on work. Avoid presenting this prototype as a fully realized production RAG system.
