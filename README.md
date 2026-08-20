# Hotel Operations AI Assistant

A portfolio-focused AI hospitality assistant with a **React frontend**, **FastAPI backend**, **LangGraph orchestration**, and an **MCP retrieval server** over hotel SOP manuals.

This repository currently contains the MCP retrieval layer and demo frontend for grounded policy answers. The architecture keeps SOP access behind MCP so the agent can reason over policy without direct filesystem access.

### README Guide

1. Overview
2. Why I Built This
3. Architecture
4. Tech Stack
5. Demo
6. MCP Architecture
7. LangGraph Workflow
8. PII Protection
9. Guardrails
10. Observability
11. Frontend
12. Testing
13. Security Considerations
14. Local Development
15. Environment Variables
16. Project Structure
17. Engineering Decisions
18. Limitations
19. Future Improvements
20. Screenshots
21. License

---

## 1. Overview

The server connects to a local directory containing Markdown hotel SOP manuals.

It exposes the manuals through two MCP primitives:

* **Resources** — individual SOP documents available through `sop://` URIs.
* **Tool** — `search_sop_manuals(query: str)` for finding relevant SOP content.

The implementation intentionally uses a lightweight keyword-based search rather than introducing a vector database or embedding service.

This keeps the prototype small while preserving a clean retrieval contract that can later be upgraded to semantic/vector search without changing the interface consumed by the agent.

---

## 2. Why I Built This

I built this project to demonstrate a practical AI architecture for hospitality operations where:

* Retrieval is grounded in explicit SOP documents.
* Agent reasoning is separated from data access through MCP.
* Frontend behavior communicates operational state instead of hiding it.

The core goal is to show how to reduce policy hallucinations by making source provenance and validation first-class parts of the stack.

---

## 3. Architecture

```text
User
  │
  ▼
React Frontend
  │
  ▼
FastAPI Backend
  │
  ▼
PII Masking
  │
  ▼
LangGraph
  ├── Intent Router
  ├── MCP Retrieval
  └── Validation
        │
        ▼
      MCP
        │
        ▼
    SOP Manuals
```

The broader project architecture uses a Python/FastAPI backend, LangGraph for orchestration, MCP for SOP retrieval, and a validation/guardrail stage after retrieval.

---

## 4. Tech Stack

* **Frontend:** React + TypeScript + Vite
* **Backend API:** FastAPI
* **Agent Orchestration:** LangGraph
* **Retrieval Interface:** Model Context Protocol (MCP)
* **Knowledge Base:** Markdown SOP manuals
* **Validation Layer:** Pydantic structured response
* **Testing:** `pytest` for retrieval and pipeline; Vitest for the frontend

---

## 5. Demo

Current demo flow:

1. Front desk enters a policy question in the frontend.
2. FastAPI masks PII, then runs a LangGraph graph.
3. The retrieval node calls the MCP `search_sop_manuals` tool.
4. The validation node returns a grounded structured response (or a refusal).

---

## 6. MCP Architecture

The MCP server exposes:

* **Resources** for SOP documents (`sop://...`)
* **Tool** for retrieval (`search_sop_manuals(query)`)

This protocol boundary allows retrieval internals to evolve without changing the interface consumed by the agent layer.

---

## 7. LangGraph Workflow

The intended workflow is:

```text
User Question
  │
  ▼
PII Masking
  │
  ▼
Intent Router
  │
  ▼
MCP Retrieval
  │
  ▼
Answer Generation
  │
  ▼
Validation / Guardrails
  │
  ▼
Structured Response
```

---

## 8. PII Protection

The architecture includes a pre-retrieval masking step to reduce risk from direct personal identifiers in user prompts. The focus is on preventing unnecessary PII propagation into downstream AI processing.

---

## 9. Guardrails

Guardrails are designed around observable guarantees:

* Response should map to retrieved SOP context.
* Source document should be present in output metadata.
* Structured response shape should remain valid.

---

## 10. Observability

Each assistant answer includes a request ID, UTC timestamp, retrieved-document receipt, and per-request pipeline steps. The System Monitor and the answer receipt drawer show that execution path.

LangSmith tracing is opt-in. When `LANGCHAIN_TRACING_V2` or `LANGSMITH_TRACING` is true and an API key is present, the backend emits a chain run for `/assistant/query` using the masked prompt. Without those credentials, tracing stays local and still appears in the UI receipt.

---

## 11. Frontend

The frontend provides an operations-terminal style interface with:

* Assistant query panel
* SOP context panel
* Source-aware answer display with a structured provenance receipt
* Per-request architecture execution drawer
* System monitor view for the latest pipeline run

---

## 16. Project Structure

```text
mcp_server/
├── server.py
├── retrieval.py
├── requirements.txt
├── test_search.py
└── sop_manuals/
    ├── late_checkout_policy.md
    ├── vip_guest_protocols.md
    ├── lost_and_found.md
    └── room_upgrade_policy.md

backend/
├── main.py
├── pii.py
├── graph.py
├── mcp_client.py
├── pipeline.py
├── models.py
├── tracing.py
└── test_pipeline.py

frontend/
├── public/
│   ├── favicon.svg
│   ├── og-image.png
│   ├── apple-touch-icon.png
│   └── site.webmanifest
└── src/

docs/adr/
├── 001-mcp-boundary.md
├── 002-markdown-sop-files.md
└── 003-keyword-retrieval-first.md
```

---

## 14. Local Development

Start each component in separate terminals:

1. **Backend API**
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

2. **Frontend**
```bash
cd frontend
npm install
npm run dev
```

3. **MCP Server (optional standalone run)**
```bash
cd mcp_server
python server.py
```

---

## 15. Environment Variables

Create a local environment file from the template:

```bash
cp .env.example .env
```

If you are on Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

The template includes:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=hotel-ai-assistant
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=hotel-ai-assistant
OPENAI_API_KEY=
MCP_SERVER_URL=
API_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000
VITE_SITE_URL=http://localhost:5173
```

Frontend configuration:

* `VITE_API_URL` — Base URL for backend API (defaults to `http://localhost:8000`).
* `VITE_SITE_URL` — Public origin used for Open Graph, canonical, and JSON-LD URLs.

Copy `frontend/.env.example` to `frontend/.env` when running the Vite app:

```bash
VITE_API_URL=http://localhost:8000
VITE_SITE_URL=http://localhost:5173
```

Never commit `.env` files or production credentials.

---

### Requirements

* Python 3.11+
* `mcp`
* `pytest` for tests

Install dependencies:

```bash
python -m venv .venv
```

### Windows

```bash
.venv\Scripts\activate
```

### macOS / Linux

```bash
source .venv/bin/activate
```

Then:

```bash
pip install -r requirements.txt
```

---

### MCP Resources

The server exposes four hotel SOP manuals as MCP Resources:

| Resource                     | Document             |
| ---------------------------- | -------------------- |
| `sop://late_checkout_policy` | Late Checkout Policy |
| `sop://vip_guest_protocols`  | VIP Guest Protocols  |
| `sop://lost_and_found`       | Lost and Found       |
| `sop://room_upgrade_policy`  | Room Upgrade Policy  |

Resources provide direct access to the underlying SOP documents.

For example:

```text
sop://late_checkout_policy
```

returns the contents of:

```text
sop_manuals/late_checkout_policy.md
```

This establishes a clear boundary between the AI agent and the local filesystem.

---

### MCP Tool

### `search_sop_manuals`

The primary retrieval interface is:

```python
search_sop_manuals(query: str)
```

Example:

```text
search_sop_manuals(
    "Can a VIP guest get late checkout until 3pm?"
)
```

The tool:

1. Reads the available Markdown SOPs.
2. Tokenizes the query.
3. Scores documents according to keyword matches.
4. Gives additional weight to filename matches.
5. Extracts relevant Markdown sections.
6. Returns the highest-ranking results.

Example response:

```json
[
  {
    "document": "late_checkout_policy.md",
    "resource": "sop://late_checkout_policy",
    "score": 14,
    "sections": [
      "## VIP Guests\n\nVIP guests should receive priority consideration..."
    ]
  }
]
```

---

### Search Strategy

The prototype deliberately uses **basic keyword retrieval**.

The scoring model is approximately:

```text
query
  │
  ▼
tokenize
  │
  ▼
compare against documents
  │
  ├── filename match → stronger score
  │
  └── content match  → relevance score
  │
  ▼
rank documents
  │
  ▼
extract relevant sections
  │
  ▼
return top results
```

This is sufficient for the miniature MCP demonstration and avoids unnecessary infrastructure.

### Future Semantic Search

The MCP contract does not need to change if the retrieval implementation is upgraded.

The internal implementation could later become:

```text
query
  │
  ▼
embedding model
  │
  ▼
vector similarity
  │
  ▼
top-k chunks
  │
  ▼
MCP response
```

The LangGraph agent would continue calling:

```python
search_sop_manuals(query)
```

This keeps the retrieval implementation decoupled from the agent.

---

### Running the Server

Start the MCP server with:

```bash
python server.py
```

The server uses the **stdio transport**, making it suitable for connection to an MCP-compatible client or agent runtime.

The server itself does not contain the LangGraph agent.

Its responsibility is intentionally limited to:

```text
Hotel SOP files
      ↓
MCP Resources
      +
MCP Search Tool
```

---

## 12. Testing

TEST COVERAGE

```text
MCP Resources          ✓
SOP Search             ✓
Empty Queries          ✓
Ranking                ✓
Request IDs            ✓
Answer receipts        ✓
PII Masking            ✓
Agent Routing          ○ (planned)
Output Schema          ✓
Guardrails             ○ (planned)
API Errors             ○ (planned)
Frontend Vitest        ✓
```

Current automated tests cover MCP retrieval in `mcp_server/test_search.py`, request provenance in `backend/test_pipeline.py`, and frontend query/receipt behavior with Vitest.

Run backend tests with verbose output from the repository root:

```bash
pytest -v
```

Run frontend tests:

```bash
cd frontend
npm test
```

Test framework map:

```text
Backend        pytest
Frontend       Vitest
E2E            Playwright (not present)
```

---

### Example Queries

The server is designed around realistic hotel front-desk questions.

### Late Checkout

```text
Can a guest check out at 2pm?
```

Expected source:

```text
late_checkout_policy.md
```

### VIP Guest

```text
What should I do when a VIP arrives?
```

Expected source:

```text
vip_guest_protocols.md
```

### Lost Property

```text
What should I do if I find a passport?
```

Expected source:

```text
lost_and_found.md
```

### Room Upgrade

```text
Can I give a VIP guest a complimentary room upgrade?
```

Expected source:

```text
room_upgrade_policy.md
```

---

### Why MCP?

The important architectural decision is that the LangGraph agent does **not** directly read the SOP directory.

Instead:

```text
LangGraph
    │
    ▼
MCP Tool
    │
    ▼
SOP Retrieval
```

This creates a protocol boundary around external context.

The agent therefore interacts with a defined interface rather than depending on filesystem implementation details.

This makes the retrieval layer:

* Replaceable
* Testable
* Independently deployable
* Easier to observe
* Easier to extend
* Decoupled from the agent's reasoning logic

---

### Integration with LangGraph

The intended next stage is to connect this MCP server to a LangGraph Retrieval Node.

The overall flow becomes:

```text
User Question
      │
      ▼
PII Masking
      │
      ▼
LangGraph
      │
      ▼
Intent Router
      │
      ▼
Retrieval Node
      │
      ▼
MCP search_sop_manuals()
      │
      ▼
Relevant SOP Context
      │
      ▼
Answer Generation
      │
      ▼
Validation / Guardrails
      │
      ▼
Structured Response
```

The wider architecture specifies three LangGraph nodes:

1. **Intent Routing**
2. **SOP Context Retrieval**
3. **Guardrails & Structural Validation**

The MCP server therefore represents the boundary between the agent's retrieval logic and the hotel's policy corpus.

---

### Structured Output

The eventual agent response is intended to follow a structured schema similar to:

```json
{
  "policy_found": true,
  "answer": "Late checkout until 13:00 may be granted free of charge when availability permits.",
  "source_document": "late_checkout_policy.md"
}
```

This allows the downstream validation layer to verify that the answer is grounded in an actual SOP document rather than an invented hotel policy.

The broader project blueprint specifically calls for structured validation using a Pydantic model.

---

## 17. Engineering Decisions

### No Database

The prototype uses local Markdown files rather than PostgreSQL, Redis, Elasticsearch, or a vector database.

The purpose is to demonstrate the MCP architecture, not infrastructure complexity.

### No Direct Filesystem Access from the Agent

The agent accesses hotel policy through MCP rather than importing the SOP files directly.

### Keyword Search First

The retrieval implementation is intentionally simple.

This provides a deterministic baseline before introducing embeddings or vector search.

### MCP Interface Stays Stable

The internal retrieval implementation can evolve independently.

```text
Current:

search_sop_manuals()
        ↓
keyword search


Future:

search_sop_manuals()
        ↓
embeddings
        ↓
vector database
```

The consuming agent does not need to change.

---

### Architecture Decision Records (ADRs)

Standalone records live in [`docs/adr/`](docs/adr/):

* [ADR-001 — Why MCP?](docs/adr/001-mcp-boundary.md)
* [ADR-002 — Why Markdown SOP Files?](docs/adr/002-markdown-sop-files.md)
* [ADR-003 — Why Keyword Retrieval First?](docs/adr/003-keyword-retrieval-first.md)

---

## 19. Future Improvements

Potential extensions include:

* [ ] Semantic embeddings
* [ ] Vector database retrieval
* [ ] Chunk-level document indexing
* [ ] Metadata filtering
* [ ] SOP versioning
* [ ] Policy effective dates
* [ ] Department-based permissions
* [ ] Confidence scoring
* [x] Source citations in responses
* [ ] MCP resource discovery
* [x] Integration with LangGraph
* [x] Pydantic output validation
* [x] PII masking before model inference
* [x] LangSmith tracing
* [x] FastAPI backend integration
* [x] React front-end

The broader project plan also calls for PII masking, LangGraph orchestration, structured validation, LangSmith observability, and a TypeScript frontend.

---

## 18. Limitations

* Retrieval is keyword-based, not semantic/vector-based.
* No production identity/authentication model is implemented.
* No live PMS, reservation, or guest-profile integration.
* LangSmith tracing is opt-in and skipped when no API key is configured.

---

### Demo Scope

This is a portfolio demonstration, not a production hotel PMS.

**Implemented**

* MCP server
* SOP resources
* SOP retrieval (`search_sop_manuals`)
* LangGraph-oriented orchestration contract
* Structured validation model target
* PII masking stage in architecture
* Frontend operations terminal UI

**Simulated**

* Hotel reservation system
* Guest database
* Live room availability
* Production authentication and authorization

---

## 20. Screenshots

Screenshots are intentionally omitted in-repo. UI styling follows an external visual identity reference and is implemented directly in the frontend theme and component system.

---

## 13. Security

* PII is masked before model processing.
* Hotel SOPs are treated as controlled context behind MCP.
* The model is not permitted to invent policy.
* Responses are validated against a structured schema.
* API secrets are stored in environment variables.
* Production credentials are never committed.

Prototype gaps (not fully protected yet):

* No production-grade authentication/authorization.
* No secret manager integration or key rotation.
* No rate limiting or advanced abuse protection.
* No formal red-team or threat-model coverage yet.

---

### Portfolio Demonstration

This MCP server is intentionally small, but it demonstrates several production-oriented concepts:

```text
                    ┌───────────────────┐
                    │   Local Knowledge │
                    │       Base        │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    MCP Server     │
                    ├───────────────────┤
                    │ Resources         │
                    │ Tools             │
                    │ Retrieval         │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │    LangGraph      │
                    │      Agent        │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │ Validated Hotel   │
                    │     Response      │
                    └───────────────────┘
```

The key architectural principle is:

> **The LLM reasons over hotel policy; it does not invent hotel policy.**

The MCP server provides the controlled context boundary required to make that distinction explicit.

---

### Status

**Current implementation:** Miniature MCP SOP retrieval server

**Implemented:**

* MCP server
* Four local Markdown SOP resources
* `search_sop_manuals(query: str)` tool
* Keyword-based ranking
* Relevant section extraction
* Basic automated tests
* stdio MCP transport

**Next integration target:**

```text
MCP Server
    ↓
LangGraph Retrieval Node
    ↓
Validated Hospitality Assistant
```

---

## 21. License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for the full text.
