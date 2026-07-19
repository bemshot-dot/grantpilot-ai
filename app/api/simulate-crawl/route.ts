import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    const { action } = (await request.json()) as { action: "crawl" | "reset" };
    const corpusPath = path.join(process.cwd(), "data", "corpus.json");
    
    if (!fs.existsSync(corpusPath)) {
      return NextResponse.json({ error: "Không tìm thấy file dữ liệu corpus." }, { status: 404 });
    }
    
    const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
    const simulatedIds = ["tt12-btttt", "qd88-ttg", "nq05-hcm"];
    
    if (action === "crawl") {
      // Kiểm tra xem đã cào chưa
      if (corpus.some((c: any) => simulatedIds.includes(c.id))) {
        return NextResponse.json({ message: "Các chính sách mới đã nằm trong cơ sở dữ liệu.", status: "exists" });
      }
      
      const newChunks = [
        {
          id: "tt12-btttt",
          title: "Thông tư 12/2026/TT-BTTTT của Bộ Thông tin và Truyền thông",
          clause: "Khoản 1 Điều 3 - Hỗ trợ an toàn thông tin AI",
          status: "Còn hiệu lực (từ 01/12/2026)",
          source: "https://mic.gov.vn",
          tags: ["AI", "an_toan_thong_tin", "bo_tttt", "simulated"],
          text: "Thông tư 12/2026/TT-BTTTT quy định hỗ trợ 100% chi phí đánh giá, kiểm thử bảo mật và cấp chứng nhận tiêu chuẩn an toàn thông tin cho các sản phẩm, giải pháp Trí tuệ nhân tạo (AI) của các doanh nghiệp khởi nghiệp đổi mới sáng tạo, mức hỗ trợ tối đa không quá 80 triệu đồng trên mỗi sản phẩm ứng dụng."
        },
        {
          id: "qd88-ttg",
          title: "Quyết định 88/QĐ-TTg của Thủ tướng Chính phủ",
          clause: "Mục II Điều 2 - Gói đào tạo nguồn nhân lực",
          status: "Còn hiệu lực (từ 10/10/2026)",
          source: "https://chinhphu.vn",
          tags: ["ban_dan", "vi_mach", "nhan_luc", "tai_tro", "simulated"],
          text: "Quyết định 88/QĐ-TTg phê duyệt chương trình hỗ trợ phát triển nguồn nhân lực chất lượng cao, tài trợ 70% kinh phí đào tạo chuyên sâu và thực hành thiết kế vi mạch, bán dẫn cho nhân sự của các startup công nghệ và doanh nghiệp khoa học công nghệ mới thành lập, mức hỗ trợ tối đa 200 triệu đồng trên mỗi doanh nghiệp."
        },
        {
          id: "nq05-hcm",
          title: "Nghị quyết 05/NQ-HĐND của HĐND TP. Hồ Chí Minh",
          clause: "Điều 5 - Ưu đãi lãi suất R&D",
          status: "Còn hiệu lực (từ 01/11/2026)",
          source: "https://tphcm.gov.vn",
          tags: ["hcm", "lai_suat", "R_D", "cong_nghe_cao", "simulated"],
          text: "Nghị quyết 05/NQ-HĐND TP.HCM quy định chính sách hỗ trợ 100% lãi suất vay vốn ngân hàng trong thời gian tối đa 3 năm đầu cho các dự án đầu tư nghiên cứu phát triển (R&D) công nghệ và sản xuất sản phẩm công nghệ cao trên địa bàn Thành phố, hạn mức dư nợ vay được hỗ trợ tối đa không quá 10 tỷ đồng."
        }
      ];
      
      corpus.push(...newChunks);
      fs.writeFileSync(corpusPath, JSON.stringify(corpus, null, 2), "utf8");
      return NextResponse.json({ message: "Đã cập nhật 3 chính sách mới vào RAG database!", status: "success" });
    } else {
      // Reset về trạng thái cũ
      const filtered = corpus.filter((c: any) => !simulatedIds.includes(c.id));
      fs.writeFileSync(corpusPath, JSON.stringify(filtered, null, 2), "utf8");
      return NextResponse.json({ message: "Đã dọn dẹp cơ sở dữ liệu về mặc định.", status: "success" });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
