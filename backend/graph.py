from __future__ import annotations

from typing import Any, Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from mcp_client import get_gateway
from models import PipelineStep, RetrievedDocument
from tracing import langgraph_config


MIN_RELEVANCE_SCORE = 6


class GraphState(TypedDict):
    masked_query: str
    intent: str
    matches: list[dict[str, Any]]
    title: str
    answer: str
    source: str
    context_doc: str
    context_sections: list[str]
    policy_found: bool
    retrieved_documents: list[dict[str, Any]]
    pipeline: list[dict[str, str]]


def _step(label: str, detail: str, status: str = "ok") -> dict[str, str]:
    return {"label": label, "detail": detail, "status": status}


def intent_router(state: GraphState) -> dict[str, Any]:
    intent: Literal["policy_question", "empty"] = (
        "policy_question" if state["masked_query"].strip() else "empty"
    )
    pipeline = list(state["pipeline"])
    pipeline.append(
        _step(
            "INTENT ROUTER",
            "Policy question detected" if intent == "policy_question" else "Empty query rejected",
            "ok" if intent == "policy_question" else "warn",
        )
    )
    return {"intent": intent, "pipeline": pipeline}


def retrieve(state: GraphState) -> dict[str, Any]:
    pipeline = list(state["pipeline"])
    try:
        matches = get_gateway().search_sop_manuals(state["masked_query"])
        matches = [item for item in matches if int(item.get("score", 0)) >= MIN_RELEVANCE_SCORE]
        pipeline.append(
            _step(
                "MCP RETRIEVAL",
                f"{len(matches)} document(s) found",
                "ok" if matches else "warn",
            )
        )
    except Exception as exc:
        pipeline.append(_step("MCP RETRIEVAL", f"MCP tool call failed: {exc}", "warn"))
        matches = []
    return {"matches": matches, "pipeline": pipeline}


def validate(state: GraphState) -> dict[str, Any]:
    pipeline = list(state["pipeline"])
    matches = state.get("matches") or []

    if state.get("intent") != "policy_question" or not matches:
        pipeline.extend(
            [
                _step("POLICY CONTEXT", "No matching SOP sections", "warn"),
                _step("ANSWER GENERATION", "Grounded refusal drafted"),
                _step("GUARDRAILS", "Weak or missing retrieval rejected; no invented policy"),
            ]
        )
        return {
            "title": "POLICY NOT FOUND",
            "answer": (
                "No relevant hotel SOP was found. "
                "The assistant cannot determine whether this is permitted "
                "from the available policy corpus."
            ),
            "source": "none",
            "context_doc": "No matching SOP",
            "context_sections": [
                "If the hotel policy cannot be found, the assistant should say that it cannot find the policy rather than inventing one.",
                "A missing answer is preferable to a fabricated hotel rule.",
            ],
            "policy_found": False,
            "retrieved_documents": [],
            "pipeline": pipeline,
        }

    top = matches[0]
    source = str(top.get("document", "unknown"))
    raw_sections = top.get("sections", [])
    sections = [str(section) for section in raw_sections] or [
        "Policy matched, but no sections were extracted."
    ]
    retrieved = [
        RetrievedDocument(
            document=str(item.get("document", "unknown")),
            resource=str(item.get("resource", "")),
            score=int(item.get("score", 0)),
        ).model_dump()
        for item in matches
    ]
    pipeline.extend(
        [
            _step(
                "POLICY CONTEXT",
                f"{len(sections)} relevant section(s) extracted from {source}",
            ),
            _step("ANSWER GENERATION", "Grounded response drafted from retrieved SOP text"),
            _step("GUARDRAILS", "Source document present; output schema valid"),
        ]
    )
    return {
        "title": "POLICY FOUND",
        "answer": _extract_grounded_answer(sections, source),
        "source": source,
        "context_doc": source,
        "context_sections": sections,
        "policy_found": True,
        "retrieved_documents": retrieved,
        "pipeline": pipeline,
    }


def _extract_grounded_answer(sections: list[str], source: str) -> str:
    cleaned_lines: list[str] = []
    for section in sections:
        for raw_line in section.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("-"):
                line = line.lstrip("-").strip()
            cleaned_lines.append(line)

    if not cleaned_lines:
        return f"The request is covered by {source}, but no detailed SOP lines were extracted."

    unique_lines: list[str] = []
    seen: set[str] = set()
    for line in cleaned_lines:
        lowered = line.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        unique_lines.append(line)
    return " ".join(unique_lines[:3])


def _route_after_intent(state: GraphState) -> Literal["retrieve", "validate"]:
    if state.get("intent") == "policy_question":
        return "retrieve"
    return "validate"


def build_assistant_graph():
    graph = StateGraph(GraphState)
    graph.add_node("intent_router", intent_router)
    graph.add_node("retrieve", retrieve)
    graph.add_node("validate", validate)
    graph.add_edge(START, "intent_router")
    graph.add_conditional_edges("intent_router", _route_after_intent)
    graph.add_edge("retrieve", "validate")
    graph.add_edge("validate", END)
    return graph.compile()


assistant_graph = build_assistant_graph()


def run_langgraph(masked_query: str, pipeline: list[PipelineStep]) -> GraphState:
    initial: GraphState = {
        "masked_query": masked_query,
        "intent": "",
        "matches": [],
        "title": "",
        "answer": "",
        "source": "",
        "context_doc": "",
        "context_sections": [],
        "policy_found": False,
        "retrieved_documents": [],
        "pipeline": [step.model_dump() for step in pipeline],
    }
    # Native LangSmith tracer must be passed explicitly on invoke.
    config = langgraph_config()
    return assistant_graph.invoke(initial, config=config)
