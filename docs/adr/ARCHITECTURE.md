# Architecture

AI Staff Copilot answers front-desk policy questions from a closed SOP corpus. The LLM-facing contract is: **reason over retrieved hotel policy; do not invent hotel policy.**

This document describes the running system. Setup and commands live in the [README](../../README.md). Decision records are in this folder: [`docs/adr/`](./).

## System overview

```text
User
  │
  ▼
React frontend
  │  POST /assistant/query
  ▼
FastAPI
  │
  ▼
PII masking
  │
  ▼
LangGraph
  ├── Intent router
  ├── MCP retrieval
  └── Validation / grounded answer
        │
        ▼
      MCP (stdio)
        │
        ▼
    SOP manuals
```

The agent never reads `mcp_server/sop_manuals/` directly. FastAPI talks to a stdio MCP client (`McpGateway`). That client starts `mcp_server/server.py` and calls MCP tools/resources.

## Request path

Each `POST /assistant/query` run:

```text
User question
  │
  ▼
PII masking          emails → [EMAIL], phones → [PHONE]
  │
  ▼
Intent router        policy_question | empty
  │
  ▼
MCP retrieval        search_sop_manuals(masked_query)
  │                  keep matches with score ≥ 6
  ▼
Answer generation    extractive draft from SOP sections
  │
  ▼
Guardrails           refuse if retrieval is weak or missing
  │
  ▼
Structured response  Pydantic AssistantQueryResponse
```

Pipeline labels recorded on every response:

1. `PII MASKING`
2. `INTENT ROUTER`
3. `MCP RETRIEVAL` (skipped when the query is empty)
4. `POLICY CONTEXT`
5. `ANSWER GENERATION`
6. `GUARDRAILS`

## Backend

### FastAPI (`backend/main.py`)

| Endpoint | Role |
| --- | --- |
| `GET /health` | Reports `api`, `mcp`, `sop_index`, and `tracing`. Overall status is `ok` only when MCP is up and at least one SOP resource is listed. |
| `GET /sop/{document_name}` | Reads `sop://{stem}` through MCP and returns `{ document, content }`. |
| `POST /assistant/query` | Runs the pipeline. Sets `X-Request-ID` from the generated UUID. |

CORS currently allows all origins. The app lifespan starts and stops the MCP gateway so uvicorn sync routes can call tools without embedding FastMCP.

### Pipeline (`backend/pipeline.py`)

`run_assistant_pipeline` assigns a request ID, masks PII, invokes LangGraph, then builds:

- `AssistantQueryResponse` — title, answer, source, context sections, pipeline steps
- `AnswerReceipt` — request ID, UTC timestamp, `policy_found`, retrieved documents, tracing mode

LangSmith emission happens after the answer is assembled and must not fail the guest-facing path.

### LangGraph (`backend/graph.py`)

Three nodes, compiled once as `assistant_graph`:

| Node | Behavior |
| --- | --- |
| `intent_router` | Non-empty masked text → `policy_question`; otherwise `empty`. |
| `retrieve` | Calls `search_sop_manuals`. Drops hits below `MIN_RELEVANCE_SCORE` (6). MCP failures become an empty match list and a `warn` step. |
| `validate` | On a hit: extractive answer from the top document’s sections, plus retrieved-document metadata. On a miss: `POLICY NOT FOUND` and an explicit refusal. |

Conditional edge: empty intent skips retrieval and goes straight to `validate`.

Answers are **extractive**, not model-generated. The validator takes the top matching sections, strips headings, and joins the first three unique lines. `OPENAI_API_KEY` is reserved in the env template and is not used on this path.

### MCP client (`backend/mcp_client.py`)

`McpGateway` owns a background asyncio loop and a FastMCP stdio session (`python -u mcp_server/server.py`). Sync callers (`ping`, `search_sop_manuals`, `read_sop_document`, `list_resource_uris`) submit coroutines onto that loop.

Tool results accept either structured MCP content or JSON text blocks, so the graph stays independent of FastMCP payload wrapping.

## MCP retrieval

Server: FastMCP app `hotel-sop-manuals` (`mcp_server/server.py`), transport **stdio**.

### Resources

| URI | File |
| --- | --- |
| `sop://late_checkout_policy` | `late_checkout_policy.md` |
| `sop://vip_guest_protocols` | `vip_guest_protocols.md` |
| `sop://lost_and_found` | `lost_and_found.md` |
| `sop://room_upgrade_policy` | `room_upgrade_policy.md` |

### Tool

```python
search_sop_manuals(query: str) -> list[dict]
```

Each hit:

```json
{
  "document": "late_checkout_policy.md",
  "resource": "sop://late_checkout_policy",
  "score": 14,
  "sections": ["## VIP Guests\n\nVIP guests should receive priority consideration..."]
}
```

Empty queries return `[]`. Ranking keeps the top five documents.

### Search strategy

Keyword retrieval by design ([ADR-003](./003-keyword-retrieval-first.md)):

```text
query
  │
  ▼
tokenize (stopwords dropped)
  │
  ▼
score each Markdown file
  ├── filename match  (stronger, rarity-weighted)
  └── content count   (capped, rarity-weighted)
  │
  ▼
rank → extract overlapping ## / # sections → top 5
```

Rare terms score higher than terms that appear in every manual. The MCP tool signature can later wrap embeddings or a vector index without changing LangGraph.

## Frontend

Vite + React operations console (`frontend/src/App.tsx`):

| Screen | Purpose |
| --- | --- |
| Assistant | Query form, grounded answer, SOP context, answer receipt, architecture execution drawer |
| SOP Manual | Lists the four policies and loads full text from `GET /sop/{name}` |
| System Monitor | Latest pipeline run, request ID, tracing label |

Health is polled about every four seconds. Sidebar and footer show MCP, LangGraph, guardrails, API, SOP index, and tracing. Unknown paths render a custom 404.

In development, Vite proxies `/health`, `/assistant`, and `/sop` to port 8000. Production on Vercel routes `/api/*` to the Python service (`vercel.json`).

## Observability

Every answer includes:

- Request ID (UUID; also `X-Request-ID`)
- UTC ISO timestamp
- Retrieved-document list (name, `sop://` URI, score)
- Pipeline steps with `ok` / `warn` / `skip`

LangSmith is opt-in. When `LANGSMITH_TRACING` or `LANGCHAIN_TRACING_V2` is true **and** an API key is set, the backend posts a chain run for `/assistant/query` using the **masked** prompt. Otherwise tracing mode is `local` and the UI receipt still shows the execution path.

## Guardrails and PII

Observable guarantees on the validate node:

- A `POLICY FOUND` answer maps to retrieved SOP sections
- Source document is present in the response and receipt
- Weak or empty retrieval produces a refusal, not a guessed policy
- Response shape is a Pydantic `AssistantQueryResponse`

PII masking (`backend/pii.py`) runs **before** the graph. Emails become `[EMAIL]`; phone-like tokens become `[PHONE]`. That reduces identifier leakage into traces and retrieval, not a full privacy program.

## Security

In place:

- PII redaction before graph + tracing inputs
- SOP corpus only reachable through MCP
- Structured validation; missing policy is an explicit refusal
- Secrets via environment variables, not the repo

Not in place:

- Authentication / authorization
- Secret manager or key rotation
- Rate limiting
- Formal threat model

## Engineering decisions

| Choice | Why |
| --- | --- |
| MCP boundary | Agent depends on a tool/resource contract, not filesystem paths ([ADR-001](./001-mcp-boundary.md)). |
| Markdown SOP files | Human-readable, version-controlled, no database required ([ADR-002](./002-markdown-sop-files.md)). |
| Keyword search first | Deterministic tests and a stable tool API before embeddings ([ADR-003](./003-keyword-retrieval-first.md)). |
| Extractive answers | Output is taken from retrieved SOP lines so the model cannot invent policy on the current path. |
| stdio MCP from FastAPI | Same process tree as the API; no extra HTTP MCP service in local or Vercel runs. |

```text
Today                         Later (same tool name)

search_sop_manuals()          search_sop_manuals()
        │                             │
        ▼                             ▼
keyword + rarity              embeddings / vector index
```

## Limitations

- Retrieval is lexical, not semantic.
- Answers are extractive snippets, not a generative rewrite.
- No PMS, reservation, or guest-profile integration.
- No production identity model.
- LangSmith is skipped when tracing flags or keys are absent.

## Possible extensions

- Semantic embeddings and vector retrieval behind the same MCP tool
- Chunk-level indexing and metadata filters
- SOP versioning and effective dates
- Department-scoped permissions
- Confidence scoring on retrieved hits
- Authn/authz, rate limits, and a secret manager
- Generative drafting **only after** retrieval, still validated against source sections
