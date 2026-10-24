"""Score the versioned synthetic retrieval set with lexical and hybrid ranking."""

import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.main import Passage, create_embeddings, rank


ROOT = Path(__file__).resolve().parents[2]


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


def score(rows: list[dict], rankings: dict[str, list[str]], k: int = 5) -> tuple[float, float]:
    recalls, reciprocal_ranks = [], []
    for row in rows:
        expected = set(row["expected_passage_ids"])
        ranked_ids = rankings[row["id"]]
        recalls.append(len(expected.intersection(ranked_ids[:k])) / len(expected) if expected else 0.0)
        reciprocal_ranks.append(next((1 / index for index, item in enumerate(ranked_ids, 1) if item in expected), 0.0))
    return sum(recalls) / max(1, len(recalls)), sum(reciprocal_ranks) / max(1, len(reciprocal_ranks))


def main() -> None:
    corpus = read_jsonl(ROOT / "evals" / "corpus.jsonl")
    questions = read_jsonl(ROOT / "evals" / "questions.jsonl")
    passages = [Passage(chunkId=row["passage_id"], documentId=row["document_id"], filename=row["filename"], content=row["content"]) for row in corpus]
    lexical_rankings: dict[str, list[str]] = {}
    for question in questions:
        lexical_rankings[question["id"]] = [item.chunkId for item in rank(question["question"], passages)]
    recall, mrr = score(questions, lexical_rankings)
    print(f"Lexical baseline  Recall@5={recall:.3f}  MRR={mrr:.3f}")

    vectors = create_embeddings([row["content"] for row in corpus] + [row["question"] for row in questions])
    if not vectors:
        print("Hybrid score     skipped (set OPENAI_API_KEY to evaluate semantic retrieval)")
        return
    corpus_vectors = vectors[:len(corpus)]
    hybrid_rankings: dict[str, list[str]] = {}
    for offset, question in enumerate(questions, start=len(corpus)):
        semantic_order = sorted(range(len(corpus)), key=lambda index: cosine(vectors[offset], corpus_vectors[index]), reverse=True)
        semantic_ranks = {index: rank_index for rank_index, index in enumerate(semantic_order, 1)}
        lexical_order = lexical_rankings[question["id"]]
        lexical_ranks = {passage_id: index for index, passage_id in enumerate(lexical_order, 1)}
        rrf = []
        for index, row in enumerate(corpus):
            passage_id = row["passage_id"]
            combined = 1 / (60 + semantic_ranks[index]) + (1 / (60 + lexical_ranks[passage_id]) if passage_id in lexical_ranks else 0)
            rrf.append((combined, passage_id))
        hybrid_rankings[question["id"]] = [passage_id for _, passage_id in sorted(rrf, reverse=True)]
    recall, mrr = score(questions, hybrid_rankings)
    print(f"Hybrid RRF       Recall@5={recall:.3f}  MRR={mrr:.3f}")
    print("Synthetic corpus only; this offline score does not measure authorization or answer faithfulness.")


if __name__ == "__main__":
    main()
