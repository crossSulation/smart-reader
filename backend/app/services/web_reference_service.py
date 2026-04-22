"""Helpers to fetch concise reference knowledge from public web sources."""

from __future__ import annotations

from typing import List

import requests

from app.schemas import WebReferenceItem

_WIKI_SEARCH_API = "https://en.wikipedia.org/w/api.php"
_WIKI_SUMMARY_API = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
_TIMEOUT = 8


def _wiki_search_titles(term: str, limit: int) -> List[str]:
    resp = requests.get(
        _WIKI_SEARCH_API,
        params={
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": term,
            "srlimit": max(1, min(limit, 10)),
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    payload = resp.json()
    hits = payload.get("query", {}).get("search", [])
    return [hit.get("title", "") for hit in hits if hit.get("title")]


def _wiki_summary(title: str) -> WebReferenceItem | None:
    if not title:
        return None

    resp = requests.get(
        _WIKI_SUMMARY_API.format(title=title.replace(" ", "_")),
        timeout=_TIMEOUT,
    )

    # Missing/redirect errors are non-fatal; just skip this title.
    if resp.status_code >= 400:
        return None

    data = resp.json()
    extract = data.get("extract") or ""
    page_title = data.get("title") or title
    content_url = (
        data.get("content_urls", {})
        .get("desktop", {})
        .get("page", f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}")
    )

    if not extract.strip():
        return None

    return WebReferenceItem(
        title=page_title,
        snippet=extract.strip(),
        url=content_url,
        source="wikipedia",
    )


def fetch_web_references(term: str, limit: int = 3) -> List[WebReferenceItem]:
    """
    Fetch concise references from Wikipedia for an unfamiliar term.
    Returns an empty list on network/provider issues (non-fatal to reading flow).
    """
    clean_term = (term or "").strip()
    if not clean_term:
        return []

    try:
        titles = _wiki_search_titles(clean_term, limit)
    except Exception:
        return []

    results: List[WebReferenceItem] = []
    for title in titles:
        item = _wiki_summary(title)
        if item is not None:
            results.append(item)
        if len(results) >= limit:
            break

    return results
