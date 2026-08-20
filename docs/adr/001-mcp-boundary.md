# ADR-001 — Expose hotel SOPs through MCP

## Status

Accepted

## Context

The hospitality assistant needs grounded policy context. Direct filesystem reads from the agent would couple reasoning to local paths and make retrieval harder to replace, test, or observe.

## Decision

Expose the SOP corpus through MCP resources (`sop://...`) and a `search_sop_manuals` tool. The LangGraph-oriented agent consumes that contract instead of reading Markdown files itself.

## Consequences

- Retrieval internals can change without rewriting the agent.
- The protocol boundary is independently testable.
- The current FastAPI backend may call the same retrieval functions locally for the prototype while preserving the MCP contract for the agent path.
