from __future__ import annotations

from pydantic import BaseModel, Field


class PipelineStep(BaseModel):
    label: str
    detail: str
    status: str = Field(pattern="^(ok|warn|skip)$")


class RetrievedDocument(BaseModel):
    document: str
    resource: str
    score: int


class AnswerReceipt(BaseModel):
    request_id: str
    timestamp: str
    policy_found: bool
    source: str
    retrieved_documents: list[RetrievedDocument]
    tracing: str


class AssistantQueryResponse(BaseModel):
    title: str
    response: str
    source: str
    context_doc: str
    context_sections: list[str]
    request_id: str
    timestamp: str
    receipt: AnswerReceipt
    pipeline: list[PipelineStep]
