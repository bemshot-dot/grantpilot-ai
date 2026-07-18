"""
Filter the vbpl-vn Vietnamese legal corpus (Hugging Face) down to a narrow
slice relevant to investment/tax-incentive policy for GrantPilot.

Dataset: https://huggingface.co/datasets/tmquan/vbpl-vn
158,822 legal documents (laws, decrees, circulars, decisions, resolutions...)
from Vietnam's National Legal Database (vbpl.vn), CC-BY-4.0.

This machine is memory-constrained (~1-2GB free, fluctuating), and the
`datasets` library's streaming mode buffers a full HTTP response (one
parquet shard, 100MB+) in memory per request -> unpredictable MemoryError.
So instead: download each of the 32 "documents-*.parquet" shards to disk
(hf_hub_download, resumable/cached) and read each one with pyarrow's
batched reader, which never holds more than one small batch in memory.

Setup:
    pip install pyarrow huggingface_hub

Usage:
    python filter_vbpl_dataset.py
"""

import json
import re
from pathlib import Path

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download

REPO_ID = "tmquan/vbpl-vn"
NUM_SHARDS = 32
BATCH_SIZE = 500

RELEVANT_DOC_TYPES = {
    "luat", "nghi_dinh", "thong_tu", "quyet_dinh", "nghi_quyet", "thong_tu_lien_tich",
}

KEYWORDS = [
    "doanh nghiệp", "khởi nghiệp", "đầu tư", "ưu đãi", "miễn thuế",
    "giảm thuế", "khoa học công nghệ", "đổi mới sáng tạo", "công nghệ cao",
    "FDI", "khu công nghiệp", "khu công nghệ cao", "hỗ trợ vốn",
    "quỹ phát triển",
]
KEYWORD_RE = re.compile("|".join(re.escape(k) for k in KEYWORDS), re.IGNORECASE)

MIN_YEAR = 2015

OUTPUT_PATH = Path("vbpl_grantpilot_slice.jsonl")
PROGRESS_PATH = Path("vbpl_filter_progress.json")


def matches(row: dict) -> bool:
    if row["doc_type"] not in RELEVANT_DOC_TYPES:
        return False
    if row["year"] is not None and row["year"] < MIN_YEAR:
        return False
    title = row["title"] or ""
    body_snippet = (row["markdown"] or "")[:2000]
    return bool(KEYWORD_RE.search(title) or KEYWORD_RE.search(body_snippet))


def main():
    done_shards = set()
    if PROGRESS_PATH.exists():
        done_shards = set(json.loads(PROGRESS_PATH.read_text())["done_shards"])
        print(f"Resuming: {len(done_shards)}/{NUM_SHARDS} shards already processed")

    total_kept = 0
    with open(OUTPUT_PATH, "a", encoding="utf-8") as out:
        for shard_idx in range(NUM_SHARDS):
            if shard_idx in done_shards:
                continue
            filename = f"documents-{shard_idx:05d}-of-{NUM_SHARDS:05d}.parquet"
            print(f"Downloading {filename} ...", flush=True)
            local_path = hf_hub_download(repo_id=REPO_ID, filename=filename, repo_type="dataset")

            pf = pq.ParquetFile(local_path)
            shard_kept = 0
            shard_scanned = 0
            for batch in pf.iter_batches(batch_size=BATCH_SIZE):
                for row in batch.to_pylist():
                    shard_scanned += 1
                    if matches(row):
                        out.write(json.dumps({
                            "doc_name": row["doc_name"],
                            "title": row["title"],
                            "doc_type": row["doc_type"],
                            "doc_number": row["doc_number"],
                            "issue_date": row["issue_date"],
                            "issuing_authority": row["issuing_authority"],
                            "legal_area": row["legal_area"],
                            "scope": row["scope"],
                            "source_url": row["source_url"],
                            "markdown": row["markdown"],
                        }, ensure_ascii=False) + "\n")
                        shard_kept += 1
                out.flush()

            total_kept += shard_kept
            done_shards.add(shard_idx)
            PROGRESS_PATH.write_text(json.dumps({"done_shards": sorted(done_shards)}))
            print(f"  shard {shard_idx}: scanned {shard_scanned}, kept {shard_kept} (total kept so far: {total_kept})", flush=True)

    print(f"\nDone. Kept {total_kept} documents across {NUM_SHARDS} shards.")
    print(f"Saved to {OUTPUT_PATH}")
    PROGRESS_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
