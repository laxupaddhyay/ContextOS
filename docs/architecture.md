# Architecture

The local demo is a modular monolith API plus a separate AI service. Spring Boot owns workspace membership, file metadata, storage keys, and the authorization-filtered chunk query. RabbitMQ carries only an opaque document UUID. The ingestion listener extracts text and writes chunks to PostgreSQL. The AI service ranks only the passages supplied by the API and optionally calls the configured generation provider.

## Trust boundary

The browser is untrusted. Every workspace API resolves the development identity and checks membership on the server. The `/ask` path queries `document_chunks` joined to documents by the requested workspace and READY status before sending passage text to the AI service. The AI endpoint is intended for the internal Compose network and should not be published independently in a deployment.

## Prototype limitations

The current retrieval helper uses lexical overlap, and this schema stores text chunks but not embeddings. The plan's pgvector, hybrid retrieval, reranking, evaluation, robust OIDC, bounded retries/DLQ, and production observability remain follow-on work. Avoid presenting this prototype as a fully realized production RAG system.
