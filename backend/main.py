from contextlib import asynccontextmanager
from pathlib import Path
import threading

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mcp_client import McpGateway, get_gateway, peek_gateway, set_gateway
from models import AssistantQueryResponse
from pipeline import run_assistant_pipeline
from tracing import load_dotenv, tracing_enabled, tracing_mode


REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")


class AssistantQueryRequest(BaseModel):
    query: str = Field(min_length=1, description="Front-desk question")


class SopDocumentResponse(BaseModel):
    document: str
    content: str


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Boot MCP in the background so uvicorn can bind and pass Render health checks."""
    gateway = McpGateway()
    # Publish immediately so callers share one instance; ready stays false until start().
    set_gateway(gateway)

    def _boot_mcp() -> None:
        try:
            gateway.start()
        except Exception:
            set_gateway(None)

    boot = threading.Thread(target=_boot_mcp, name="mcp-boot", daemon=True)
    boot.start()
    try:
        yield
    finally:
        gateway.stop()
        set_gateway(None)


app = FastAPI(title="AI Staff Copilot API", version="1.0.0", lifespan=lifespan)

# Enforce secure origins while allowing local developer loops.
# Step 1 keeps a wildcard so Render ↔ Vercel traffic can be validated;
# switch allow_origins to `origins` once the new hosts are stable.
origins = [
    "https://ai-staff-copilot.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


@app.get("/health")
def health() -> dict[str, object]:
    # Never call get_gateway() here — starting MCP is slow and must not block
    # Render's liveness probe (that pattern produces deploy-time 502s).
    mcp_status = "starting"
    sop_index_status = "unavailable"

    gateway = peek_gateway()
    if gateway is None:
        mcp_status = "degraded"
    elif not gateway.ready:
        mcp_status = "starting"
    else:
        try:
            if gateway.ping():
                mcp_status = "ok"
                uris = gateway.list_resource_uris()
                sop_index_status = "ready" if uris else "unavailable"
            else:
                mcp_status = "degraded"
        except Exception:
            mcp_status = "degraded"
            sop_index_status = "unavailable"

    return {
        "status": "ok" if mcp_status == "ok" and sop_index_status == "ready" else "degraded",
        "services": {
            "api": "ok",
            "mcp": mcp_status,
            "sop_index": sop_index_status,
            "tracing": "ready" if tracing_enabled() else "local",
        },
        "tracing": tracing_mode(),
    }


@app.get("/sop/{document_name}", response_model=SopDocumentResponse)
def get_sop_document(document_name: str) -> SopDocumentResponse:
    try:
        content = get_gateway().read_sop_document(document_name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="SOP document not found.") from None
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"MCP resource read failed: {exc}") from exc

    return SopDocumentResponse(document=document_name, content=content)


@app.post("/assistant/query", response_model=AssistantQueryResponse)
def assistant_query(payload: AssistantQueryRequest, response: Response) -> AssistantQueryResponse:
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")

    result = run_assistant_pipeline(query)
    response.headers["X-Request-ID"] = result.request_id
    return result
