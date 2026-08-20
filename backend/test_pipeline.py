import pytest

from mcp_client import McpGateway, set_gateway
from pii import mask_pii
from pipeline import run_assistant_pipeline


@pytest.fixture(scope="session", autouse=True)
def mcp_gateway():
    gateway = McpGateway()
    gateway.start()
    set_gateway(gateway)
    yield gateway
    gateway.stop()
    set_gateway(None)


def test_late_checkout_returns_request_id_and_receipt():
    result = run_assistant_pipeline("What is the latest checkout time?")

    assert result.title == "POLICY FOUND"
    assert result.request_id
    assert result.timestamp
    assert result.receipt.request_id == result.request_id
    assert result.receipt.policy_found is True
    assert result.receipt.source == "late_checkout_policy.md"
    assert result.receipt.retrieved_documents
    assert result.receipt.retrieved_documents[0].document == "late_checkout_policy.md"
    assert [step.label for step in result.pipeline] == [
        "PII MASKING",
        "INTENT ROUTER",
        "MCP RETRIEVAL",
        "POLICY CONTEXT",
        "ANSWER GENERATION",
        "GUARDRAILS",
    ]


def test_unknown_policy_returns_grounded_refusal():
    result = run_assistant_pipeline("Can guests bring llamas into the presidential suite?")

    assert result.title == "POLICY NOT FOUND"
    assert result.source == "none"
    assert result.receipt.policy_found is False
    assert result.receipt.retrieved_documents == []


def test_mask_pii_redacts_email_and_phone():
    masked, count = mask_pii("Call guest@example.com at 415-555-0199 about late checkout")

    assert "[EMAIL]" in masked
    assert "[PHONE]" in masked
    assert "guest@example.com" not in masked
    assert "415-555-0199" not in masked
    assert count == 2
