# Evaluation dataset

Add versioned, synthetic or explicitly approved non-sensitive question records to `questions.jsonl`. Each row should include a stable ID, question, expected document IDs, and expected passage IDs. Never commit private documents, credentials, or user questions from production.

The current file is a schema/example starter, not a scored dataset. There are no published Recall@K, MRR, faithfulness, or latency results yet. For service-level unit checks, run `cd services/ai && pip install -r requirements-dev.txt && pytest`; those checks do not replace a labeled retrieval evaluation.
