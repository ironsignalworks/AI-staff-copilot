from pathlib import Path
import re
from collections import Counter


BASE_DIR = Path(__file__).resolve().parent
SOP_DIR = BASE_DIR / "sop_manuals"


def get_sop_files() -> list[Path]:
    """Return all Markdown SOP manuals."""
    return sorted(SOP_DIR.glob("*.md"))


def read_sop(path: Path) -> str:
    """Read an SOP Markdown file."""
    return path.read_text(encoding="utf-8")


def tokenize(text: str) -> set[str]:
    """
    Basic tokenizer used for keyword matching.

    This deliberately stays simple:
    no embeddings or external vector database are required
    for the miniature MCP demonstration.
    """
    stopwords = {
        "a",
        "an",
        "and",
        "are",
        "can",
        "do",
        "for",
        "how",
        "i",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "should",
        "the",
        "to",
        "what",
        "with",
    }

    terms = set(
        re.findall(
            r"\b[a-zA-Z0-9]{2,}\b",
            text.lower(),
        )
    )

    return {term for term in terms if term not in stopwords}


def score_document(
    query: str,
    content: str,
    filename: str,
    term_document_frequency: Counter[str],
) -> int:
    """
    Basic keyword relevance scoring.

    Higher score = stronger match.
    """

    query_terms = tokenize(query)
    content_lower = content.lower()
    filename_lower = filename.lower()

    score = 0

    total_documents = max(len(get_sop_files()), 1)

    for term in query_terms:
        # Rare terms are more informative than common ones.
        doc_frequency = max(term_document_frequency.get(term, 1), 1)
        rarity_weight = total_documents / doc_frequency

        # Strong signal if the term appears in the filename.
        if term in filename_lower:
            score += int(5 * rarity_weight)

        # Count occurrences in the document.
        occurrences = content_lower.count(term)
        score += int(min(occurrences, 5) * rarity_weight)

    return score


def extract_relevant_sections(
    query: str,
    content: str,
    max_sections: int = 3,
) -> list[str]:
    """
    Return Markdown sections containing query terms.
    """

    query_terms = tokenize(query)

    sections = re.split(
        r"\n(?=##?\s)",
        content,
    )

    matches = []

    for section in sections:
        section_terms = tokenize(section)

        if query_terms & section_terms:
            overlap = len(query_terms & section_terms)

            matches.append(
                (
                    overlap,
                    section.strip(),
                )
            )

    matches.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    return [
        section
        for _, section in matches[:max_sections]
    ]


def search_sop_manuals(query: str) -> list[dict]:
    """
    Search the hotel SOP manuals for information relevant
    to a front desk employee's question.
    """

    query = query.strip()

    if not query:
        return []

    results = []
    term_document_frequency: Counter[str] = Counter()
    sop_files = get_sop_files()
    document_contents: dict[Path, str] = {}

    for path in sop_files:
        content = read_sop(path)
        document_contents[path] = content
        term_document_frequency.update(tokenize(content))

    for path in sop_files:
        content = document_contents[path]

        score = score_document(
            query=query,
            content=content,
            filename=path.name,
            term_document_frequency=term_document_frequency,
        )

        if score <= 0:
            continue

        sections = extract_relevant_sections(
            query=query,
            content=content,
        )

        results.append(
            {
                "document": path.name,
                "resource": f"sop://{path.stem}",
                "score": score,
                "sections": sections,
            }
        )

    results.sort(
        key=lambda result: result["score"],
        reverse=True,
    )

    return results[:5]
