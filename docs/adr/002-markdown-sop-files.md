# ADR-002 — Store SOP manuals as Markdown files

## Status

Accepted

## Context

This repository is a miniature hospitality operations demonstration. Introducing PostgreSQL, a CMS, or a vector store would obscure the MCP and provenance story.

## Decision

Keep hotel SOPs as version-controlled Markdown files under `mcp_server/sop_manuals/`.

## Consequences

- Policies remain human-readable in pull requests.
- No database is required to run the demo.
- Versioning and effective dating are left as future work.
