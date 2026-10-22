from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import main


def passage(chunk_id: str, content: str) -> main.Passage:
    return main.Passage(
        chunkId=chunk_id,
        documentId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        filename="handbook.md",
        content=content,
    )


def test_rank_prefers_passage_with_matching_terms():
    target = passage("11111111-1111-1111-1111-111111111111", "The onboarding checklist has five steps.")
    distractor = passage("22222222-2222-2222-2222-222222222222", "The finance team reviews quarterly budgets.")

    ranked = main.rank("What is the onboarding checklist?", [distractor, target])

    assert ranked[0].chunkId == target.chunkId


def test_answer_requires_internal_service_token():
    request = main.AnswerRequest(question="policy", passages=[])

    with pytest.raises(HTTPException) as error:
        main.answer(request, service_token=None)

    assert error.value.status_code == 401


def test_answer_abstains_when_model_uses_unknown_citation(monkeypatch):
    chunk_id = "11111111-1111-1111-1111-111111111111"
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Use this rule [99999999-9999-9999-9999-999999999999]."))],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=8),
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_: response)))
    monkeypatch.setitem(__import__("sys").modules, "openai", SimpleNamespace(OpenAI=lambda **_: client))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")

    result = main.answer(main.AnswerRequest(question="policy", passages=[passage(chunk_id, "This is the policy rule.")]), "test-token")

    assert result["answer"] == "The available workspace sources do not contain enough evidence to answer that question."
    assert result["citations"] == []
    assert "usage" not in result


def test_answer_returns_only_validated_citations_and_usage(monkeypatch):
    chunk_id = "11111111-1111-1111-1111-111111111111"
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=f"The handbook requires approval [{chunk_id}]."))],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=8),
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=lambda **_: response)))
    monkeypatch.setitem(__import__("sys").modules, "openai", SimpleNamespace(OpenAI=lambda **_: client))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")

    result = main.answer(main.AnswerRequest(question="policy", passages=[passage(chunk_id, "This is the policy rule.")]), "test-token")

    assert result["citations"][0]["chunkId"] == chunk_id
    assert result["usage"] == {"inputTokens": 10, "outputTokens": 8}
