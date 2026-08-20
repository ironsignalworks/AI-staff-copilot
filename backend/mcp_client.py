from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


BACKEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BACKEND_DIR.parent
# Prefer the in-sandbox copy Render's build command places next to main.py;
# fall back to the repo-root package for local development.
_LOCAL_MCP = BACKEND_DIR / "mcp_server" / "server.py"
_REPO_MCP = REPO_ROOT / "mcp_server" / "server.py"
MCP_SERVER_SCRIPT = _LOCAL_MCP if _LOCAL_MCP.is_file() else _REPO_MCP

_gateway: McpGateway | None = None
_gateway_lock = threading.Lock()


class McpGateway:
    """stdio MCP client for the hotel SOP server.

    Lives in a dedicated asyncio loop so FastAPI sync routes and LangGraph
    nodes can call tools/resources without importing FastMCP into uvicorn.
    """

    def __init__(self) -> None:
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, name="mcp-stdio", daemon=True)
        self._session: ClientSession | None = None
        self._started = False
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._connect_error: BaseException | None = None

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._session_lifetime())

    async def _session_lifetime(self) -> None:
        params = StdioServerParameters(
            command=sys.executable,
            args=["-u", str(MCP_SERVER_SCRIPT)],
            cwd=str(MCP_SERVER_SCRIPT.parent),
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )
        try:
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    self._session = session
                    self._ready.set()
                    while not self._stop.is_set():
                        await asyncio.sleep(0.05)
        except BaseException as exc:
            self._connect_error = exc
            self._ready.set()
            raise
        finally:
            self._session = None

    def start(self, timeout: float = 20) -> None:
        if self._started:
            return
        if not self._thread.is_alive():
            self._thread.start()
        if not self._ready.wait(timeout=timeout):
            raise TimeoutError("MCP gateway did not become ready.")
        if self._connect_error is not None:
            raise RuntimeError("MCP gateway failed to connect.") from self._connect_error
        self._started = True

    def stop(self) -> None:
        self._stop.set()
        if self._thread.is_alive():
            self._thread.join(timeout=10)
        self._started = False

    @property
    def ready(self) -> bool:
        return self._started and self._session is not None

    def _call(self, coro: Any, timeout: float = 15) -> Any:
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)

    def _require_session(self) -> ClientSession:
        if self._session is None:
            raise RuntimeError("MCP gateway is not connected.")
        return self._session

    def ping(self) -> bool:
        try:
            tools = self.list_tools()
            return "search_sop_manuals" in tools
        except Exception:
            return False

    def list_tools(self) -> list[str]:
        result = self._call(self._require_session().list_tools())
        return [tool.name for tool in result.tools]

    def list_resource_uris(self) -> list[str]:
        result = self._call(self._require_session().list_resources())
        return [str(resource.uri) for resource in result.resources]

    def search_sop_manuals(self, query: str) -> list[dict[str, Any]]:
        result = self._call(
            self._require_session().call_tool("search_sop_manuals", {"query": query})
        )
        return _parse_search_payload(result)

    def read_sop_document(self, document_name: str) -> str:
        uri = f"sop://{Path(document_name).stem}"
        result = self._call(self._require_session().read_resource(uri))
        chunks = [getattr(item, "text", "") for item in result.contents]
        text = "\n".join(chunk for chunk in chunks if chunk).strip()
        if not text:
            raise FileNotFoundError(document_name)
        return text


def _parse_search_payload(result: Any) -> list[dict[str, Any]]:
    structured = getattr(result, "structuredContent", None)
    parsed = _coerce_match_list(structured)
    if parsed is not None:
        return parsed

    for block in getattr(result, "content", []) or []:
        text = getattr(block, "text", None)
        if not text:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            continue
        parsed = _coerce_match_list(payload)
        if parsed is not None:
            return parsed
    return []


def _coerce_match_list(payload: Any) -> list[dict[str, Any]] | None:
    if isinstance(payload, list) and all(isinstance(item, dict) for item in payload):
        return payload
    if isinstance(payload, dict):
        for key in ("result", "content", "matches"):
            nested = payload.get(key)
            if isinstance(nested, list) and all(isinstance(item, dict) for item in nested):
                return nested
    return None


def set_gateway(gateway: McpGateway | None) -> None:
    global _gateway
    with _gateway_lock:
        _gateway = gateway


def peek_gateway() -> McpGateway | None:
    """Return the live gateway without starting a new MCP subprocess."""
    return _gateway


def get_gateway() -> McpGateway:
    global _gateway
    with _gateway_lock:
        if _gateway is not None and _gateway.ready:
            return _gateway
        gateway = _gateway if _gateway is not None else McpGateway()
        _gateway = gateway
    gateway.start()
    return gateway
