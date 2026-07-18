from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
TMP_DIR = ROOT / "tmp" / "pdfs"
DOCS_DIR = ROOT / "data" / "docs"

DOCUMENTS = [
    {
        "id": "nd80_2021",
        "title": "Nghị định 80/2021/NĐ-CP",
        "source_url": "https://vanban.chinhphu.vn/default.aspx?docid=203941&pageid=27160",
        "legal_status_note": "Còn hiệu lực.",
    },
    {
        "id": "law_sme_2017",
        "title": "Luật Hỗ trợ doanh nghiệp nhỏ và vừa 2017 (04/2017/QH14)",
        "source_url": "https://vanban.chinhphu.vn/default.aspx?docid=190283&pageid=27160",
        "legal_status_note": "Hết hiệu lực một phần - đã được sửa đổi, bổ sung bởi Luật Đầu tư 61/2020/QH14 và Luật Đấu thầu 22/2023/QH15.",
    },
    {
        "id": "tt06_2022",
        "title": "Thông tư 06/2022/TT-BKHĐT",
        "source_url": "https://vanban.chinhphu.vn/?docid=205807&pageid=27160",
        "legal_status_note": "Còn hiệu lực.",
    },
    {
        "id": "tt45_2019",
        "title": "Thông tư 45/2019/TT-BTC",
        "source_url": "https://chinhphu.vn/default.aspx?docid=197478&pageid=27160",
        "legal_status_note": "Còn hiệu lực.",
    },
    {
        "id": "law_investment_2020",
        "title": "Luật Đầu tư 2020 (61/2020/QH14)",
        "source_url": "https://vanban.chinhphu.vn/default.aspx?docid=200449&pageid=27160",
        "legal_status_note": "Hết hiệu lực từ 01/03/2026 - thay thế bởi Luật Đầu tư 143/2025/QH15 (GCN đầu tư đã cấp theo luật cũ vẫn có hiệu lực theo quy định chuyển tiếp).",
    },
    {
        "id": "nd31_2021",
        "title": "Nghị định 31/2021/NĐ-CP",
        "source_url": "https://vanban.chinhphu.vn/?docid=202988&pageid=27160",
        "legal_status_note": "Đã được sửa đổi/bổ sung - cần rà soát theo Luật Đầu tư 2025.",
    },
    {
        "id": "qd188_2021",
        "title": "Quyết định 188/QĐ-TTg",
        "source_url": "https://vanban.chinhphu.vn/default.aspx?docid=202651&pageid=27160",
        "legal_status_note": "Còn hiệu lực. Sửa đổi, bổ sung Quyết định 844/QĐ-TTg.",
    },
    {
        "id": "nd39_2019",
        "title": "Nghị định 39/2019/NĐ-CP",
        "source_url": "https://vanban.chinhphu.vn/default.aspx?docid=196965&pageid=27160",
        "legal_status_note": "Còn hiệu lực - đã được sửa đổi, bổ sung bởi Nghị định 45/2024/NĐ-CP.",
        "dpi": 130,
    },
    {
        "id": "nd45_2024",
        "title": "Nghị định 45/2024/NĐ-CP",
        "source_url": "https://vanban.chinhphu.vn/?docid=210143&pageid=27160",
        "legal_status_note": "Còn hiệu lực (hiệu lực từ 10/06/2024).",
    },
]


def fetch_html(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "GrantPilotAI/0.2 source verifier",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        return response.read().decode("utf-8", errors="ignore")


def find_attachment_pdf_url(html: str) -> str | None:
    match = re.search(r'href="(https://datafiles\.chinhphu\.vn/[^"]+\.pdf)"', html)
    return match.group(1) if match else None


def download_pdf(url: str, dest: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "GrantPilotAI/0.2 source verifier"})
    with urllib.request.urlopen(request, timeout=60) as response, open(dest, "wb") as fh:
        shutil.copyfileobj(response, fh)


def render_pdf(pdf_path: Path, work_dir: Path, dpi: int = 220) -> list[Path]:
    work_dir.mkdir(parents=True, exist_ok=True)
    prefix = work_dir / "page"
    subprocess.run(["pdftoppm", "-png", "-r", str(dpi), str(pdf_path), str(prefix)], check=True, cwd=ROOT)
    return sorted(work_dir.glob("page-*.png"), key=lambda path: int(path.stem.split("-")[-1]))


def ocr_images(ocr_engine, images: list[Path]) -> list[dict]:
    pages = []
    for index, image in enumerate(images, start=1):
        result, elapsed = ocr_engine(str(image))
        rows = []
        for item in result or []:
            box, text, confidence = item
            y = min(point[1] for point in box)
            x = min(point[0] for point in box)
            rows.append({"x": round(float(x), 2), "y": round(float(y), 2), "text": text.strip(), "confidence": round(float(confidence), 4)})
        rows.sort(key=lambda row: (row["y"], row["x"]))
        pages.append({"page": index, "image": str(image.relative_to(ROOT)).replace("\\", "/"), "elapsed": elapsed, "rows": rows})
    return pages


def rows_to_markdown(page: dict) -> str:
    lines = []
    for row in page["rows"]:
        text = row["text"].strip()
        if not text:
            continue
        if row["confidence"] < 0.68:
            lines.append(f"<!-- low_confidence={row['confidence']} --> {text}")
        else:
            lines.append(text)
    return "\n\n".join(lines)


def write_outputs(doc: dict, pdf_path: Path, pdf_download_url: str, pages: list[dict]) -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(pdf_path))
    text_layer_chars = sum(len(page.extract_text() or "") for page in reader.pages)

    payload = {
        "document_id": doc["id"],
        "source_url": doc["source_url"],
        "pdf_download_url": pdf_download_url,
        "page_count": len(reader.pages),
        "text_layer_chars": text_layer_chars,
        "ocr_engine": "rapidocr-onnxruntime",
        "ocr_quality": "draft_unaccented_needs_human_review",
        "pages": pages,
    }
    (DOCS_DIR / f"{doc['id']}_ocr.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    markdown = [
        "---",
        f'title: "{doc["title"]}"',
        f'document_id: "{doc["id"]}"',
        f"source_url: {doc['source_url']}",
        f"pdf_download_url: {pdf_download_url}",
        f"page_count: {len(reader.pages)}",
        "extraction_method: ocr",
        "ocr_engine: rapidocr-onnxruntime",
        "ocr_quality: draft_unaccented_needs_human_review",
        f"legal_status_note: {doc['legal_status_note']}",
        "---",
        "",
        f"# {doc['title']}",
        "",
        "> Bản markdown này được OCR từ PDF scan/signed tải trực tiếp từ chinhphu.vn. OCR hiện mất dấu tiếng Việt ở nhiều dòng và có thể sai ký tự, vì vậy chỉ dùng làm bản nháp để chunk/search hoặc đối chiếu provenance. Khi dùng làm căn cứ pháp lý hiển thị cho người dùng, dùng bản tóm tắt đã review trong data/corpus.json hoặc đối chiếu lại với nguồn Cổng Thông tin điện tử Chính phủ.",
        "",
        "## Metadata",
        "",
        f"- Source page: {doc['source_url']}",
        f"- PDF download URL: {pdf_download_url}",
        f"- PDF pages: {len(reader.pages)}",
        f"- Embedded text layer characters: {text_layer_chars}",
        "- OCR engine: rapidocr-onnxruntime",
        "",
    ]
    for page in pages:
        markdown.extend([f"## Page {page['page']}", "", f"Image: `{page['image']}`", "", rows_to_markdown(page), ""])

    (DOCS_DIR / f"{doc['id']}.md").write_text("\n".join(markdown), encoding="utf-8")


def process_document(ocr_engine, doc: dict, skip_existing: bool = True) -> str:
    print(f"--- {doc['id']} ---", flush=True)
    if skip_existing and (DOCS_DIR / f"{doc['id']}.md").exists():
        print(f"SKIP {doc['id']}: output already exists", flush=True)
        return "already_done"

    html = fetch_html(doc["source_url"])
    pdf_url = find_attachment_pdf_url(html)
    if not pdf_url:
        print(f"SKIP {doc['id']}: no PDF attachment link found on page")
        return "no_attachment"

    work_dir = TMP_DIR / doc["id"]
    work_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = work_dir / f"{doc['id']}.pdf"
    download_pdf(pdf_url, pdf_path)

    images = render_pdf(pdf_path, work_dir, dpi=doc.get("dpi", 220))
    pages = ocr_images(ocr_engine, images)
    write_outputs(doc, pdf_path, pdf_url, pages)
    print(f"OK {doc['id']}: {len(images)} pages OCR'd -> data/docs/{doc['id']}.md")
    return "ok"


def main() -> None:
    from rapidocr_onnxruntime import RapidOCR

    ocr_engine = RapidOCR()
    results = {}
    for doc in DOCUMENTS:
        try:
            results[doc["id"]] = process_document(ocr_engine, doc)
        except Exception as exc:  # noqa: BLE001
            print(f"FAIL {doc['id']}: {exc}")
            results[doc["id"]] = f"error: {exc}"

    print("\nSummary:")
    for doc_id, status in results.items():
        print(f"  {doc_id}: {status}")
    if any(status != "ok" for status in results.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
