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
    const simulatedIds = ["nq12-hanoi", "qd456-btttt", "nd99-thue"];
    
    if (action === "crawl") {
      // Kiểm tra xem đã cào chưa
      if (corpus.some((c: any) => simulatedIds.includes(c.id))) {
        return NextResponse.json({ message: "Các chính sách mới đã nằm trong cơ sở dữ liệu.", status: "exists" });
      }
      
      const newChunks = [
        {
          id: "nq12-hanoi",
          title: "Nghị quyết 12/2026/NQ-HĐND Hà Nội",
          clause: "Điều 3 - Mức hỗ trợ",
          status: "Còn hiệu lực (từ 01/10/2026)",
          source: "https://vanban.hanoi.gov.vn",
          tags: ["chuyen_doi_so", "uu_dai", "ha_noi", "simulated"],
          text: "Nghị quyết 12/2026/NQ-HĐND quy định hỗ trợ 100% kinh phí thuê, mua các giải pháp chuyển đổi số, phần mềm quản trị doanh nghiệp cho các startup công nghệ và DNNVV trên địa bàn thành phố Hà Nội, mức tối đa không quá 50 triệu đồng/năm đối với doanh nghiệp siêu nhỏ, 100 triệu đồng/năm đối với doanh nghiệp nhỏ, và 150 triệu đồng/năm đối với doanh nghiệp quy mô vừa."
        },
        {
          id: "qd456-btttt",
          title: "Quyết định 456/QĐ-BTTTT của Bộ Thông tin và Truyền thông",
          clause: "Khoản 2 Điều 1 - Chương trình AI và IoT",
          status: "Còn hiệu lực (từ 15/11/2026)",
          source: "https://mic.gov.vn",
          tags: ["AI", "IoT", "thu_nghiem", "bo_tttt", "simulated"],
          text: "Quyết định 456/QĐ-BTTTT hỗ trợ 50% chi phí kiểm thử, đo lường và thử nghiệm hiệu năng phần mềm AI hoặc thiết bị IoT tại các phòng thí nghiệm trọng điểm quốc gia cho các doanh nghiệp khởi nghiệp đổi mới sáng tạo, mức tối đa không quá 150 triệu đồng trên mỗi dự án thử nghiệm."
        },
        {
          id: "nd99-thue",
          title: "Nghị định 99/2026/NĐ-CP của Chính phủ",
          clause: "Điều 8 - Miễn giảm thuế thu nhập doanh nghiệp",
          status: "Còn hiệu lực (từ 01/08/2026)",
          source: "https://chinhphu.vn",
          tags: ["thue_tndn", "mien_thue", "uu_dai_tai_chinh", "simulated"],
          text: "Nghị định 99/2026/NĐ-CP quy định miễn thuế thu nhập doanh nghiệp (TNDN) trong 2 năm đầu tiên và giảm 50% số thuế phải nộp trong 3 năm tiếp theo đối với các doanh nghiệp khởi nghiệp sáng tạo và doanh nghiệp khoa học công nghệ mới thành lập có doanh thu dưới 10 tỷ đồng/năm."
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
