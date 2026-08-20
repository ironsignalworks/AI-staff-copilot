from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from graph import run_langgraph
from models import AnswerReceipt, AssistantQueryResponse, PipelineStep, RetrievedDocument
from pii import mask_pii
from tracing import emit_langsmith_run, tracing_mode


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_assistant_pipeline(query: str) -> AssistantQueryResponse:
    request_id = str(uuid4())
    started_at = _utc_now()

    masked_query, redaction_count = mask_pii(query)
    pii_step = PipelineStep(
        label="PII MASKING",
        detail=(
            f"{redaction_count} identifier(s) redacted"
            if redaction_count
            else "No personal identifiers detected"
        ),
        status="ok",
    )

    state = run_langgraph(masked_query, [pii_step])
    pipeline = [PipelineStep.model_validate(step) for step in state["pipeline"]]
    retrieved = [RetrievedDocument.model_validate(item) for item in state["retrieved_documents"]]
    finished_at = _utc_now()

    response = AssistantQueryResponse(
        title=state["title"],
        response=state["answer"],
        source=state["source"],
        context_doc=state["context_doc"],
        context_sections=state["context_sections"],
        request_id=request_id,
        timestamp=finished_at,
        receipt=AnswerReceipt(
            request_id=request_id,
            timestamp=finished_at,
            policy_found=state["policy_found"],
            source=state["source"],
            retrieved_documents=retrieved,
            tracing=tracing_mode(),
        ),
        pipeline=pipeline,
    )
    emit_langsmith_run(
        run_id=request_id,
        name="assistant_query",
        start_time=started_at,
        end_time=finished_at,
        inputs={"query": masked_query},
        outputs={"title": response.title, "source": response.source},
        extra={"metadata": {"request_id": request_id, "policy_found": response.receipt.policy_found}},
    )
    return response
