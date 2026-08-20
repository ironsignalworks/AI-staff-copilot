from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com/runs")


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return

    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def tracing_api_key() -> str:
    return (os.getenv("LANGSMITH_API_KEY") or os.getenv("LANGCHAIN_API_KEY") or "").strip()


def tracing_project() -> str:
    return (
        os.getenv("LANGSMITH_PROJECT")
        or os.getenv("LANGCHAIN_PROJECT")
        or "hotel-ai-assistant"
    )


def tracing_enabled() -> bool:
    flag = os.getenv("LANGSMITH_TRACING") or os.getenv("LANGCHAIN_TRACING_V2")
    return _truthy(flag) and bool(tracing_api_key())


def tracing_mode() -> str:
    return "langsmith" if tracing_enabled() else "local"


def emit_langsmith_run(
    *,
    run_id: str,
    name: str,
    start_time: str,
    end_time: str,
    inputs: dict[str, Any],
    outputs: dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> None:
    if not tracing_enabled():
        return

    payload = {
        "id": run_id,
        "name": name,
        "run_type": "chain",
        "start_time": start_time,
        "end_time": end_time,
        "session_name": tracing_project(),
        "inputs": inputs,
        "outputs": outputs,
        "extra": extra or {},
    }
    request = urllib.request.Request(
        LANGSMITH_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": tracing_api_key(),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            response.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        # Tracing must never fail the guest-facing answer path.
        return
