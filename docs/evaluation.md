# Evaluation plan

The repository does not yet contain measured quality or latency claims. Before publishing metrics, create a non-sensitive labeled set with expected source chunks and record the model, dataset revision, configuration, hardware, and concurrency.

Report Recall@5, Recall@10, MRR, citation correctness, faithfulness, relevance, abstention quality, and unauthorized retrieval rate. Include representative failures and human review; model-graded scores are not ground truth. Measure API and ingestion paths separately and report p50/p95 latency and token usage where available.
