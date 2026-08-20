# ADR-003 — Use keyword retrieval first

## Status

Accepted

## Context

Semantic search would require embeddings, an index, and additional operational cost. The demo needs deterministic tests and a stable retrieval interface.

## Decision

Rank SOP documents with keyword overlap, filename boosts, and term rarity. Return the top matching documents and relevant Markdown sections.

## Consequences

- Tests can assert expected source documents without an embedding model.
- Unusual queries can correctly return "policy not found" instead of a weak semantic guess.
- The MCP tool signature stays stable if retrieval later moves to embeddings or a vector database.
