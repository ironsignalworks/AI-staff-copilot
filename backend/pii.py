from __future__ import annotations

import re


EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b")


def mask_pii(text: str) -> tuple[str, int]:
    redactions = 0

    def _email(_match: re.Match[str]) -> str:
        nonlocal redactions
        redactions += 1
        return "[EMAIL]"

    def _phone(_match: re.Match[str]) -> str:
        nonlocal redactions
        redactions += 1
        return "[PHONE]"

    masked = EMAIL_RE.sub(_email, text)
    masked = PHONE_RE.sub(_phone, masked)
    return masked, redactions
