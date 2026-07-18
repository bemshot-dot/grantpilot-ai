from __future__ import annotations

import datetime as dt
import json
import sqlite3
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "grantpilot.db"
MANIFEST_PATH = DATA_DIR / "database_manifest.json"
COVERAGE_PATH = DATA_DIR / "coverage_report.md"


def load_json(name: str) -> Any:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


def reset_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA foreign_keys = OFF;
        DROP TABLE IF EXISTS source_checks;
        DROP TABLE IF EXISTS corpus_chunks;
        DROP TABLE IF EXISTS policies;
        DROP TABLE IF EXISTS policy_benefits;
        DROP TABLE IF EXISTS policy_checklist;
        DROP TABLE IF EXISTS policy_citations;
        DROP TABLE IF EXISTS sample_profiles;
        DROP TABLE IF EXISTS policy_watch;
        DROP TABLE IF EXISTS corpus_fts;

        CREATE TABLE source_checks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          category TEXT NOT NULL,
          url TEXT NOT NULL,
          demo_status TEXT NOT NULL,
          ok INTEGER NOT NULL,
          http_status INTEGER,
          final_url TEXT,
          bytes INTEGER NOT NULL DEFAULT 0,
          keyword_hits TEXT NOT NULL,
          keyword_misses TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          text_excerpt TEXT NOT NULL
        );

        CREATE TABLE corpus_chunks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          clause TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          tags TEXT NOT NULL,
          text TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE corpus_fts USING fts5(
          id UNINDEXED,
          title,
          clause,
          tags,
          text,
          content=''
        );

        CREATE TABLE policies (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          program TEXT NOT NULL,
          scope TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          summary TEXT NOT NULL,
          eligibility TEXT NOT NULL
        );

        CREATE TABLE policy_benefits (
          policy_id TEXT NOT NULL,
          benefit TEXT NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY(policy_id) REFERENCES policies(id)
        );

        CREATE TABLE policy_checklist (
          policy_id TEXT NOT NULL,
          item TEXT NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY(policy_id) REFERENCES policies(id)
        );

        CREATE TABLE policy_citations (
          policy_id TEXT NOT NULL,
          document TEXT NOT NULL,
          clause TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL,
          position INTEGER NOT NULL,
          FOREIGN KEY(policy_id) REFERENCES policies(id)
        );

        CREATE TABLE sample_profiles (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );

        CREATE TABLE policy_watch (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          title TEXT NOT NULL,
          impact TEXT NOT NULL,
          status TEXT NOT NULL,
          source TEXT NOT NULL
        );

        CREATE INDEX idx_corpus_source ON corpus_chunks(source);
        CREATE INDEX idx_policy_source ON policies(source);
        CREATE INDEX idx_policy_citation_source ON policy_citations(source);
        PRAGMA foreign_keys = ON;
        """
    )


def insert_data(conn: sqlite3.Connection) -> dict[str, int]:
    sources = load_json("crawled_sources.json")
    corpus = load_json("corpus.json")
    policies = load_json("policies.json")
    profiles = load_json("sample_profiles.json")
    watch = load_json("policy_watch.json")

    for source in sources:
        conn.execute(
            """
            INSERT INTO source_checks
            (id, title, category, url, demo_status, ok, http_status, final_url, bytes, keyword_hits, keyword_misses, fetched_at, text_excerpt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source["id"],
                source["title"],
                source["category"],
                source["url"],
                source["demo_status"],
                1 if source["ok"] else 0,
                source.get("http_status"),
                source.get("final_url", source["url"]),
                source.get("bytes", 0),
                json.dumps(source.get("keyword_hits", []), ensure_ascii=False),
                json.dumps(source.get("keyword_misses", []), ensure_ascii=False),
                source["fetched_at"],
                source.get("text_excerpt", ""),
            ),
        )

    for chunk in corpus:
        tags = json.dumps(chunk["tags"], ensure_ascii=False)
        conn.execute(
            "INSERT INTO corpus_chunks (id, title, clause, status, source, tags, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (chunk["id"], chunk["title"], chunk["clause"], chunk["status"], chunk["source"], tags, chunk["text"]),
        )
        conn.execute(
            "INSERT INTO corpus_fts (id, title, clause, tags, text) VALUES (?, ?, ?, ?, ?)",
            (chunk["id"], chunk["title"], chunk["clause"], " ".join(chunk["tags"]), chunk["text"]),
        )

    for policy in policies:
        conn.execute(
            """
            INSERT INTO policies (id, title, program, scope, status, source, summary, eligibility)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                policy["id"],
                policy["title"],
                policy["program"],
                policy["scope"],
                policy["status"],
                policy["source"],
                policy["summary"],
                json.dumps(policy["eligibility"], ensure_ascii=False),
            ),
        )
        for index, benefit in enumerate(policy.get("benefits", [])):
            conn.execute("INSERT INTO policy_benefits (policy_id, benefit, position) VALUES (?, ?, ?)", (policy["id"], benefit, index))
        for index, item in enumerate(policy.get("checklist", [])):
            conn.execute("INSERT INTO policy_checklist (policy_id, item, position) VALUES (?, ?, ?)", (policy["id"], item, index))
        for index, citation in enumerate(policy.get("citations", [])):
            conn.execute(
                """
                INSERT INTO policy_citations (policy_id, document, clause, status, source, position)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (policy["id"], citation["document"], citation["clause"], citation["status"], citation["source"], index),
            )

    for profile in profiles:
        conn.execute("INSERT INTO sample_profiles (id, payload) VALUES (?, ?)", (profile["id"], json.dumps(profile, ensure_ascii=False)))

    for item in watch:
        conn.execute(
            "INSERT INTO policy_watch (date, title, impact, status, source) VALUES (?, ?, ?, ?, ?)",
            (item["date"], item["title"], item["impact"], item["status"], item["source"]),
        )

    return {
        "sources": len(sources),
        "source_checks_ok": sum(1 for source in sources if source["ok"]),
        "corpus_chunks": len(corpus),
        "policies": len(policies),
        "policy_citations": sum(len(policy.get("citations", [])) for policy in policies),
        "sample_profiles": len(profiles),
        "policy_watch": len(watch),
    }


def write_manifest(conn: sqlite3.Connection, counts: dict[str, int]) -> None:
    citation_sources = {row[0] for row in conn.execute("SELECT DISTINCT source FROM policy_citations")}
    checked_sources = {row[0] for row in conn.execute("SELECT url FROM source_checks WHERE ok = 1")}
    unchecked_citation_sources = sorted(source for source in citation_sources if source not in checked_sources)

    coverage_notes = [
        {
            "area": "FDI / doanh nghiệp công nghệ cao",
            "status": "roadmap",
            "note": "Có schema mở rộng nhưng chưa có corpus thật trong MVP.",
        },
        {
            "area": "Thuế TNDN cho startup",
            "status": "missing",
            "note": "Chưa đưa vào matching vì chưa xác minh văn bản chuyên ngành còn hiệu lực rõ ràng.",
        },
        {
            "area": "Biểu mẫu nộp Đề án 844 năm 2026",
            "status": "needs_verification",
            "note": "QĐ 844 phê duyệt đến năm 2025; cần kiểm tra chương trình/đợt tuyển chọn kế tiếp.",
        },
        {
            "area": "Chương trình Hà Nội",
            "status": "seed_only",
            "note": "Nguồn hiện là bối cảnh hệ sinh thái, chưa phải thông báo nhận hồ sơ.",
        },
        {
            "area": "Luật Đầu tư",
            "status": "needs_update",
            "note": "Policy ưu đãi đầu tư được giữ để demo/roadmap, cần cập nhật theo Luật Đầu tư 2025/2026.",
        },
    ]

    manifest = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "database": str(DB_PATH.relative_to(ROOT)).replace("\\", "/"),
        "counts": counts,
        "unchecked_citation_sources": unchecked_citation_sources,
        "coverage_notes": coverage_notes,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# Data Coverage Report",
        "",
        f"Generated at: {manifest['generated_at']}",
        "",
        "## Counts",
        "",
    ]
    for key, value in counts.items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Remaining Gaps", ""])
    for note in coverage_notes:
        lines.append(f"- **{note['area']}** (`{note['status']}`): {note['note']}")
    lines.extend(["", "## Citation Sources Not In Successful Crawl", ""])
    if unchecked_citation_sources:
        for source in unchecked_citation_sources:
            lines.append(f"- {source}")
    else:
        lines.append("- None")
    COVERAGE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    if not (DATA_DIR / "crawled_sources.json").exists():
        raise SystemExit("Missing data/crawled_sources.json. Run scripts/crawl_verified_sources.py first.")

    conn = sqlite3.connect(DB_PATH)
    try:
        reset_db(conn)
        counts = insert_data(conn)
        conn.commit()
        write_manifest(conn, counts)
    finally:
        conn.close()

    print(f"Built {DB_PATH}")
    print(json.dumps(counts, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
