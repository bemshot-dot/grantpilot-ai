# GrantPilot AI - Progress Summary

Last updated: 2026-07-17

## 1. MVP đã dựng

Đã hoàn thiện demo MVP theo đặc tả `grantpilot-ai-spec.md`, chuyển giao diện chính sang Next.js/Node.js để dễ demo và deploy Render.

Các luồng đã có:

- Hồ sơ doanh nghiệp + matching chính sách/quỹ.
- Phân loại DNNVV theo lao động, doanh thu, vốn và lĩnh vực.
- Q&A pháp lý demo có citation và badge trạng thái hiệu lực.
- Checklist hồ sơ Đề án 844.
- API xuất đơn `.docx` cho Đề án 844.
- OCR/mock pre-fill bằng file `.txt`.
- Policy watch mock.

File chính:

- `app/page.tsx`: giao diện demo Next.js.
- `app/api/grant-docx/route.ts`: API xuất DOCX.
- `lib/grantpilot.ts`: logic matching, Q&A, parse upload.
- `data/*.json`: dữ liệu seed cho demo.
- `render.yaml`: cấu hình deploy Render Web Service.

## 2. Kiểm tra build/runtime

Đã chạy:

```powershell
npm install
npm run build
```

Kết quả:

- Next.js production build pass.
- Local Next.js trả HTTP `200` tại `http://localhost:3000`.
- API DOCX trả HTTP `200`, đúng MIME Word.

## 3. Repo GitHub

Repo đích:

```text
https://github.com/luongducthangDS/GrantPilotAI.git
```

Đã khởi tạo Git local, thêm remote và push commit MVP đầu tiên:

```text
9fe4e81 Build GrantPilot AI Next.js MVP
```

Sau đó đã tạo thêm commit kiểm chứng nguồn:

```text
fdf9330 Verify demo policy sources
```

Ghi chú: trong một lần push sau, môi trường HTTPS Git báo token không hợp lệ. Cần kiểm tra lại GitHub credential nếu local đang `ahead`.

## 4. Kiểm chứng nguồn dữ liệu hiện tại

Đã kiểm tra các URL/source trong:

- `data/corpus.json`
- `data/policies.json`
- `data/policy_watch.json`

Kết quả:

- Các link cũ dạng `vbpl.vn/TW/Pages/vbpq-toanvan.aspx?...` bị lỗi `404`, đã loại bỏ.
- Các link `dean844.most.gov.vn` và `startupcity.vn` không đủ ổn định để dùng làm citation live, đã thay bằng nguồn ổn định hơn.
- Tất cả URL hiện tại trong 3 file data đều trả HTTP `200`.
- Đã kiểm keyword nội dung cho NĐ80, TT06, QĐ844, TT45, SMEDF, Luật Đầu tư 2020, NĐ31, nguồn Hà Nội.

Nguồn đã thay/chuẩn hóa:

- Nghị định 80/2021/NĐ-CP: dùng Cổng Thông tin điện tử Chính phủ.
- Luật Hỗ trợ DNNVV 2017: dùng CSDL VBPL, trạng thái `Hết hiệu lực một phần`.
- Thông tư 06/2022/TT-BKHĐT: dùng Cổng Thông tin điện tử Chính phủ.
- Quyết định 844/QĐ-TTg: dùng Cổng Thông tin điện tử Chính phủ, trạng thái demo `Đề án đến năm 2025 - cần xác minh đợt mới`.
- Thông tư 45/2019/TT-BTC: dùng Cổng Thông tin điện tử Chính phủ.
- SMEDF: dùng trang chương trình vay vốn chính thức.
- Luật Đầu tư 2020/Nghị định 31/2021: đánh dấu cần cập nhật theo Luật Đầu tư 2025/2026.
- Hà Nội startup: dùng bài public-sector của Viện NC phát triển KT-XH Hà Nội, vẫn đánh dấu seed demo/cần xác minh khi nộp thật.

Đã thêm:

- `data/source_verification.md`: nhật ký kiểm chứng source.
- `data/verified_sources.json`: danh sách source có cấu trúc để crawler sử dụng.
- `data/crawled_sources.json`: snapshot crawl từ các nguồn đã xác thực.
- `data/grantpilot.db`: SQLite database cho MVP.
- `data/database_manifest.json`: manifest số lượng bản ghi và coverage.
- `data/coverage_report.md`: báo cáo các mảng còn thiếu.

Database hiện có:

```text
sources: 9
source_checks_ok: 9
corpus_chunks: 10
policies: 6
policy_citations: 9
sample_profiles: 2
policy_watch: 3
unchecked_citation_sources: 0
```

Lệnh refresh:

```powershell
npm run data:refresh
```

## 5. Kiểm tra `data_v2.zip`

File được yêu cầu kiểm:

```text
D:\GrantPilotAI\data_v2.zip
```

Nội dung zip:

- `data/data/corpus.json`
- `data/data/policies.json`
- `data/data/policy_watch.json`
- `data/data/sample_profiles.json`
- `data/data/synthetic_dkkd_anphat.txt`
- `data/data/synthetic_dkkd_novamind.txt`

URL phát hiện trong zip:

- `https://dean844.most.gov.vn/`
- `https://startupcity.vn/`
- `https://vbpl.vn/pages/portal.aspx?q=04/2017/QH14`
- `https://vbpl.vn/pages/portal.aspx?q=06/2022/TT-BKHĐT`
- `https://vbpl.vn/pages/portal.aspx?q=143/2025/QH15`
- `https://vbpl.vn/pages/portal.aspx?q=31/2021/NĐ-CP`
- `https://vbpl.vn/pages/portal.aspx?q=45/2019/TT-BTC`
- `https://vbpl.vn/pages/portal.aspx?q=80/2021/NĐ-CP`
- `https://www.smedf.gov.vn/`

Kết quả kiểm sơ bộ:

- `https://www.smedf.gov.vn/`: HTTP `200`.
- `https://dean844.most.gov.vn/`: lỗi kết nối/TLS trong kiểm thử.
- `https://startupcity.vn/`: lỗi TLS/trust relationship trong kiểm thử.
- Các link `vbpl.vn/pages/portal.aspx?q=...` không phải deep-link ổn định:
  - Một số trả `400 Bad request` khi query có ký tự tiếng Việt chưa encode.
  - Một số redirect `308` về trang chủ `/`, không giữ được kết quả văn bản cụ thể.

Kết luận với `data_v2.zip`:

- Không nên dùng trực tiếp các URL trong zip cho demo live.
- Nên tiếp tục dùng bộ source đã kiểm trong `data/source_verification.md`.
- Nếu muốn merge nội dung từ `data_v2.zip`, cần thay toàn bộ URL `vbpl.vn/pages/portal.aspx?q=...`, `dean844.most.gov.vn`, `startupcity.vn` bằng các link ổn định đã xác minh.
- File `data_v2.zip` đã bị xoá khỏi workspace vì không đạt yêu cầu nguồn ổn định.

## 6. Deploy Render

Repo đã có `render.yaml`.

Cấu hình:

```yaml
runtime: node
buildCommand: npm install && npm run build
startCommand: npm run start
NODE_VERSION: 22
```

Trên Render:

1. Chọn repo `GrantPilotAI`.
2. Tạo Blueprint hoặc Web Service.
3. Render sẽ build Next.js app và cấp URL dạng:

```text
https://grantpilot-ai.onrender.com
```

## 7. File chưa đưa vào commit

Các file đang để ngoài commit vì không thuộc phần demo chính hoặc do người dùng cung cấp:

- `check_api_gemini.ipynb`
- `data.zip`
- `data_v2.zip`
