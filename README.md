# 🚀 GrantPilot AI - Trợ Lý Pháp Lý và Đối Chiếu Chính Sách Hỗ Trợ Doanh Nghiệp (DNNVV)

**GrantPilot AI** là nền tảng số hóa thông minh giúp các Doanh nghiệp nhỏ và vừa (DNNVV/SMEs) và Startup Việt Nam dễ dàng tiếp cận, đối chiếu và tối ưu hóa các chính sách hỗ trợ tài chính, quỹ phát triển và ưu đãi thuế từ Chính phủ.

---

## ✨ Tính Năng Nổi Bật

### 📋 1. Sàng Lọc & Khớp Chính Sách Cá Nhân Hóa (Policy Matching)
- Tự động đối chiếu thông tin doanh nghiệp (quy mô lao động, doanh thu, lĩnh vực, vốn điều lệ) theo tiêu chuẩn phân loại DNNVV của **Nghị định 80/2021/NĐ-CP**.
- Đề xuất chính xác các gói vay vốn (Quỹ phát triển DNNVV - SMEDF), tài trợ khởi nghiệp (Đề án 844), và ưu đãi thuế mới nhất (Hướng dẫn số 145/2026/HD-BKHCN).

### 🔍 2. Trích Xuất Hồ Sơ Thông Minh (AI OCR & Document Parsing)
- Hỗ trợ tải lên đa định dạng: **PDF**, ảnh chụp đăng ký kinh doanh (**PNG/JPG**), và tệp Word (**DOCX**).
- AI tự động đọc hiểu báo cáo tài chính, đăng ký doanh nghiệp để điền Form thông tin trong 3 giây.

### ✦ 3. Checklist Hồ Sơ Tự Động & Đối Chiếu Một Chạm (Smart Checklist)
- Tự động tạo danh mục tài liệu cần chuẩn bị cho từng chính sách.
- **Đối chiếu nhanh một chạm:** Tận dụng file hồ sơ đã tải ở Bước 1 để quét và kiểm tra độ khớp của các tài liệu trong Checklist (đánh dấu xanh/vàng/đỏ trực quan kèm bình luận chi tiết).

### 💬 4. Hỏi Đáp Pháp Lý Đa Lượt (Multi-turn RAG Q&A)
- Sử dụng mô hình **Google Gemini (REST API)** kết hợp cơ chế tìm kiếm lai (Hybrid Retrieval: BM25 + Dense Semantic Search).
- Trích dẫn (Citation) nguồn luật, điều khoản rõ ràng, trực quan.
- Tối ưu hóa truy vấn hội thoại tiếp diễn để giữ nguyên ngữ cảnh câu hỏi trước.

### 🛡️ 5. Cam Kết Bảo Mật (Data Privacy)
- Dữ liệu tệp văn bản thô được xử lý trực tiếp tại trình duyệt.
- Các bước phân tích AI được mã hóa và gửi an toàn tới các máy chủ đầu cuối.

---

## 🛠️ Công Nghệ Sử Dụng

- **Frontend/Backend:** Next.js 14 (React), Vanilla CSS (Tối ưu hóa UI/UX mượt mà, responsive tốt).
- **Trí tuệ nhân tạo:** REST API gọi trực tiếp Google Gemini (Hỗ trợ tốt các API key định dạng mới `AQ.` và `AIzaSy`).
- **Xử lý tài liệu:** Mammoth (.docx parsing), Google Gemini Document Understanding Engine.
- **Quản lý mã nguồn:** Git (Branch `main` chuẩn hóa).

---

## 🚀 Hướng Dẫn Cài Đặt và Chạy Local

### 1. Cài đặt các gói phụ thuộc:
```powershell
npm install
```

### 2. Cấu hình biến môi trường:
Tạo file `.env.local` ở thư mục gốc của dự án:
```env
GEMINI_API_KEY=Mã_API_Key_Gemini_Của_Bạn
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Khởi chạy máy chủ phát triển (Dev server):
```powershell
npm run dev
```
Mở [http://localhost:3000](http://localhost:3000) trên trình duyệt để trải nghiệm.

### 4. Cập nhật cơ sở dữ liệu nhúng (Embedding):
Nếu bạn thay đổi nội dung các chính sách trong `data/corpus.json`, hãy chạy lại lệnh sau để cập nhật dữ liệu vector nhúng:
```powershell
npm run data:embed
```

---

## 🌐 Hướng Dẫn Deploy Online Lên Vercel / Render

Dự án đã được tối ưu hóa cấu hình sẵn sàng cho việc đưa lên các đám mây lưu trữ online:

### Deploy lên Vercel (Khuyên dùng - Nhanh nhất)
1. Đăng nhập vào [Vercel.com](https://vercel.com/) bằng tài khoản GitHub của bạn.
2. Nhập (Import) kho chứa GitHub chứa dự án này.
3. Trong mục **Environment Variables**, cấu hình biến `GEMINI_API_KEY`.
4. Nhấn **`Deploy`** để nhận URL trang web chạy online miễn phí.

### Deploy lên Render
Dự án đã đính kèm file cấu hình [**`render.yaml`**](file:///d:/HACKATHON/GrantPilotAI-main/render.yaml) dành cho Render:
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm run start`
- Cấu hình thêm biến môi trường `GEMINI_API_KEY` trong bảng quản trị dịch vụ Render của bạn.

---

## 📂 Danh Mục Thư Mục Chính

- `/app`: Các route API trung gian và trang giao diện chính (`page.tsx`, `globals.css`).
- `/data`: Cơ sở dữ liệu chính sách (`policies.json`), cơ sở dữ liệu hỏi đáp (`corpus.json`), vector nhúng (`corpus_embeddings.json`).
- `/lib`: Công cụ logic so khớp (`grantpilot.ts`) và bộ máy truy vấn hỗn hợp (`retrieval.ts`).
- `README.md`: Hướng dẫn giới thiệu dự án này.
