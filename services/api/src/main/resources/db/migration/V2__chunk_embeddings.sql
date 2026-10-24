ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding vector(1536);
CREATE INDEX IF NOT EXISTS chunks_embedding_cosine_idx
    ON document_chunks USING hnsw (embedding vector_cosine_ops);
