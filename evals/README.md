# Evaluation dataset

`corpus.jsonl` and `questions.jsonl` contain a small synthetic labeled set with stable document and passage IDs. Keep additions synthetic or explicitly approved and non-sensitive. Never commit private documents, credentials, or user questions from production.

Run `cd services/ai && pip install -r requirements-dev.txt && python evaluate_retrieval.py` to compare BM25 lexical ranking with a local reciprocal-rank-fusion proxy. The hybrid score uses the configured embedding provider and requires `OPENAI_API_KEY`; lexical metrics run without it. The script reports Recall@5 and MRR on this synthetic corpus only. It does not exercise PostgreSQL authorization filters, production data, answer faithfulness, or end-to-end latency, so its values are development signals rather than product claims.
