from __future__ import annotations

import datetime as dt
import html
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
SOURCES_PATH = DATA_DIR / "verified_sources.json"
OUTPUT_PATH = DATA_DIR / "crawled_sources.json"


def normalize(value: str) -> str:
    import unicodedata

    value = unicodedata.normalize("NFD", value.lower())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("đ", "d")
    return re.sub(r"\s+", " ", value).strip()


def html_to_text(markup: str) -> tuple[str, str]:
    title_match = re.search(r"<title[^>]*>(.*?)</title>", markup, flags=re.IGNORECASE | re.DOTALL)
    title = html.unescape(re.sub(r"\s+", " ", title_match.group(1)).strip()) if title_match else ""

    cleaned = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", markup, flags=re.IGNORECASE | re.DOTALL)
    cleaned = re.sub(r"<!--.*?-->", " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = html.unescape(cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return title, cleaned


def fetch_url(url: str, timeout: int = 35) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GrantPilotAI/0.2 source verifier",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        raw = response.read()
        content_type = response.headers.get("content-type", "")
        charset_match = re.search(r"charset=([^;\s]+)", content_type, flags=re.IGNORECASE)
        charset = charset_match.group(1) if charset_match else "utf-8"
        text = raw.decode(charset, errors="ignore")
        title, clean_text = html_to_text(text)
        return {
            "http_status": response.status,
            "final_url": response.geturl(),
            "content_type": content_type,
            "bytes": len(raw),
            "title": title,
            "text": clean_text,
        }


def crawl() -> list[dict[str, Any]]:
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    rows: list[dict[str, Any]] = []

    for source in sources:
        row = dict(source)
        row["fetched_at"] = now
        try:
            fetched = fetch_url(source["url"])
            text_norm = normalize(fetched["text"])
            hits = [keyword for keyword in source["expected_keywords"] if normalize(keyword) in text_norm]
            row.update(fetched)
            row["ok"] = fetched["http_status"] == 200 and len(hits) == len(source["expected_keywords"])
            row["keyword_hits"] = hits
            row["keyword_misses"] = [keyword for keyword in source["expected_keywords"] if keyword not in hits]
            row["text_excerpt"] = fetched["text"][:1200]
        except (urllib.error.URLError, TimeoutError, ssl.SSLError, OSError) as exc:
            row.update(
                {
                    "ok": False,
                    "http_status": None,
                    "final_url": source["url"],
                    "content_type": "",
                    "bytes": 0,
                    "title": "",
                    "text": "",
                    "text_excerpt": "",
                    "keyword_hits": [],
                    "keyword_misses": source["expected_keywords"],
                    "error": str(exc),
                }
            )
        rows.append(row)

    OUTPUT_PATH.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    return rows


if __name__ == "__main__":
    results = crawl()
    ok = sum(1 for row in results if row["ok"])
    print(f"Crawled {len(results)} sources; ok={ok}; failed={len(results) - ok}")
    for row in results:
        status = "OK" if row["ok"] else "FAIL"
        print(f"{status} {row['id']} status={row.get('http_status')} hits={len(row.get('keyword_hits', []))}/{len(row['expected_keywords'])}")
    sys.exit(0 if ok == len(results) else 1)
