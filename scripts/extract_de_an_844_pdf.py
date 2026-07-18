from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_NAME_FRAGMENT = "844"
WORK_DIR = ROOT / "tmp" / "pdfs" / "de_an_844"
DOCS_DIR = ROOT / "data" / "docs"
OUTPUT_MD = DOCS_DIR / "de_an_844.md"
OUTPUT_JSON = DOCS_DIR / "de_an_844_ocr.json"


def find_pdf() -> Path:
    candidates = sorted(ROOT.glob("*.pdf"), key=lambda path: path.stat().st_mtime, reverse=True)
    for candidate in candidates:
        if PDF_NAME_FRAGMENT in candidate.name:
            return candidate
    raise FileNotFoundError("Could not find a PDF file containing 844 in the repo root.")


def render_pdf(pdf_path: Path) -> list[Path]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    ascii_pdf = WORK_DIR / "de_an_844.pdf"
    shutil.copyfile(pdf_path, ascii_pdf)

    prefix = WORK_DIR / "page"
    subprocess.run(
        ["pdftoppm", "-png", "-r", "220", str(ascii_pdf), str(prefix)],
        check=True,
        cwd=ROOT,
    )
    return sorted(WORK_DIR.glob("page-*.png"), key=lambda path: int(path.stem.split("-")[-1]))


def ocr_images(images: list[Path]) -> list[dict]:
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as exc:
        raise SystemExit("Missing rapidocr-onnxruntime. Install it or use an external OCR service.") from exc

    ocr = RapidOCR()
    pages = []
    for index, image in enumerate(images, start=1):
        result, elapsed = ocr(str(image))
        rows = []
        for item in result or []:
            box, text, confidence = item
            y = min(point[1] for point in box)
            x = min(point[0] for point in box)
            rows.append(
                {
                    "x": round(float(x), 2),
                    "y": round(float(y), 2),
                    "text": text.strip(),
                    "confidence": round(float(confidence), 4),
                }
            )
        rows.sort(key=lambda row: (row["y"], row["x"]))
        pages.append(
            {
                "page": index,
                "image": str(image.relative_to(ROOT)).replace("\\", "/"),
                "elapsed": elapsed,
                "rows": rows,
            }
        )
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


def write_outputs(source_pdf: Path, pages: list[dict]) -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    reader = PdfReader(str(source_pdf))
    text_layer_chars = sum(len(page.extract_text() or "") for page in reader.pages)

    payload = {
        "source_pdf": source_pdf.name,
        "page_count": len(reader.pages),
        "text_layer_chars": text_layer_chars,
        "ocr_engine": "rapidocr-onnxruntime",
        "ocr_quality": "draft_unaccented_needs_human_review",
        "pages": pages,
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    markdown = [
        "---",
        'title: "Quyết định 844/QĐ-TTg - Đề án hỗ trợ hệ sinh thái khởi nghiệp đổi mới sáng tạo quốc gia đến năm 2025"',
        'document_id: "qd844"',
        f'source_pdf: "{source_pdf.name}"',
        "source_url: https://vanban.chinhphu.vn/default.aspx?docid=184702&pageid=27160",
        "page_count: 7",
        "extraction_method: ocr",
        "ocr_engine: rapidocr-onnxruntime",
        "ocr_quality: draft_unaccented_needs_human_review",
        "legal_status_note: Đề án phê duyệt đến năm 2025; cần xác minh chương trình/đợt tuyển chọn mới khi dùng cho hồ sơ năm 2026.",
        "---",
        "",
        "# Quyết định 844/QĐ-TTg",
        "",
        "> Bản markdown này được OCR từ PDF scan/signed trong workspace. OCR hiện mất dấu tiếng Việt ở nhiều dòng và có thể sai ký tự, vì vậy chỉ dùng làm bản nháp để chunk/search. Khi dùng làm căn cứ pháp lý, đối chiếu lại với PDF gốc hoặc nguồn Cổng Thông tin điện tử Chính phủ.",
        "",
        "## Metadata",
        "",
        f"- Source PDF: `{source_pdf.name}`",
        "- Verified source URL: https://vanban.chinhphu.vn/default.aspx?docid=184702&pageid=27160",
        f"- PDF pages: {len(reader.pages)}",
        f"- Embedded text layer characters: {text_layer_chars}",
        "- OCR engine: rapidocr-onnxruntime",
        "",
    ]

    for page in pages:
        markdown.extend(
            [
                f"## Page {page['page']}",
                "",
                f"Image: `{page['image']}`",
                "",
                rows_to_markdown(page),
                "",
            ]
        )

    OUTPUT_MD.write_text("\n".join(markdown), encoding="utf-8")


def main() -> None:
    pdf = find_pdf()
    images = render_pdf(pdf)
    pages = ocr_images(images)
    write_outputs(pdf, pages)
    print(f"Wrote {OUTPUT_MD}")
    print(f"Wrote {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
