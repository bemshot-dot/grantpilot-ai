import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from "docx";
import { NextResponse } from "next/server";

import { classifySme } from "@/lib/grantpilot";
import type { MatchResult, Profile } from "@/lib/grantpilot";

export async function POST(request: Request) {
  try {
    const { profile, policy } = (await request.json()) as { profile: Profile; policy: MatchResult };
    
    // Tính toán quy mô doanh nghiệp theo Nghị định 80/2021/NĐ-CP
    const sme = classifySme(profile);

    const rows = [
      ["Tên doanh nghiệp", profile.name],
      ["Mã số thuế", profile.tax_code],
      ["Trụ sở chính (Tỉnh/Thành phố)", profile.province],
      ["Lĩnh vực hoạt động", profile.industry],
      ["Quy mô doanh nghiệp (NĐ 80/2021/NĐ-CP)", sme.size],
      ["Cơ sở xác định quy mô", sme.basis],
      ["Khởi nghiệp đổi mới sáng tạo", profile.startup_innovation ? "Có" : "Không"],
      ["Số lượng người lao động", `${profile.employees} nhân sự`],
      ["Doanh thu năm gần nhất", `${profile.revenue_bil} tỷ đồng`],
      ["Vốn điều lệ", `${profile.capital_bil} tỷ đồng`],
      ["Ngành nghề / Mô tả kinh doanh", profile.business_line ?? ""]
    ];

    const document = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Header lớn
            new Paragraph({
              spacing: { before: 200, after: 100 },
              children: [
                new TextRun({
                  text: "GRANTPILOT AI - BÁO CÁO SÀNG LỌC & ĐỀ XUẤT CHÍNH SÁCH",
                  bold: true,
                  size: 24,
                  color: "1A365D"
                })
              ]
            }),
            new Paragraph({
              spacing: { after: 300 },
              children: [
                new TextRun({
                  text: "Đơn đề xuất tham gia chương trình hỗ trợ doanh nghiệp - " + policy.program,
                  italics: true,
                  color: "4A5568",
                  size: 20
                })
              ]
            }),

            // Mục 1: Thông tin doanh nghiệp
            new Paragraph({
              text: "I. THÔNG TIN DOANH NGHIỆP",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 150 }
            }),
            
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: rows.map(
                ([label, value]) =>
                  new TableRow({
                    children: [
                      new TableCell({
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        margins: { top: 120, bottom: 120, left: 150, right: 150 },
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: label,
                                bold: true,
                                color: "2D3748"
                              })
                            ]
                          })
                        ]
                      }),
                      new TableCell({
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        margins: { top: 120, bottom: 120, left: 150, right: 150 },
                        children: [
                          new Paragraph({
                            children: [
                              new TextRun({
                                text: value,
                                color: "4A5568"
                              })
                            ]
                          })
                        ]
                      })
                    ]
                  })
              )
            }),

            // Mục 2: Lộ trình và chính sách đề xuất
            new Paragraph({
              text: "II. NỘI DUNG ĐỀ XUẤT HỖ TRỢ & ĐỐI CHIẾU CHÍNH SÁCH",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 150 }
            }),
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({ text: "Chương trình áp dụng: ", bold: true }),
                new TextRun({ text: policy.title, color: "1A365D", bold: true })
              ]
            }),
            new Paragraph({
              spacing: { after: 150 },
              children: [
                new TextRun({ text: "Mức độ tương thích: ", bold: true }),
                new TextRun({ text: `${policy.match_level} (Điểm số đối chiếu: ${policy.score}/100)`, color: "2F855A", bold: true })
              ]
            }),
            new Paragraph({
              spacing: { after: 200 },
              children: [
                new TextRun({ text: "Tóm tắt chương trình hỗ trợ: ", bold: true }),
                new TextRun({ text: policy.summary })
              ]
            }),

            // Danh sách tài liệu nộp kèm
            new Paragraph({
              text: "III. CHECKLIST TÀI LIỆU HỒ SƠ YÊU CẦU",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 150 }
            }),
            ...policy.checklist.map(
              (item) =>
                new Paragraph({
                  spacing: { after: 100 },
                  children: [
                    new TextRun({ text: "□  ", bold: true, color: "4A5568" }),
                    new TextRun({ text: item })
                  ]
                })
            ),

            // Căn cứ pháp lý
            new Paragraph({
              text: "IV. CĂN CỨ PHÁP LÝ CHI TIẾT",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 300, after: 150 }
            }),
            ...policy.citations.map(
              (citation) =>
                new Paragraph({
                  spacing: { after: 120 },
                  children: [
                    new TextRun({ text: "§  ", bold: true, color: "1A365D" }),
                    new TextRun({ text: `${citation.document} `, bold: true }),
                    new TextRun({ text: `(${citation.clause}) - Trạng thái hiệu lực: ` }),
                    new TextRun({ text: citation.status, bold: true, color: citation.status.includes("hết") ? "C53030" : "2F855A" })
                  ]
                })
            ),

            // Disclaimer
            new Paragraph({
              spacing: { before: 400 },
              children: [
                new TextRun({
                  text: "Khuyến cáo pháp lý: ",
                  bold: true,
                  color: "C53030"
                }),
                new TextRun({
                  text: "Văn bản này được tạo tự động bởi hệ thống GrantPilot AI phục vụ mục đích sàng lọc sơ bộ. Doanh nghiệp cần đối chiếu trực tiếp với các văn bản quy phạm pháp luật gốc hoặc tham vấn ý kiến luật sư chuyên nghiệp trước khi nộp hồ sơ chính thức.",
                  italics: true,
                  color: "718096"
                })
              ]
            })
          ]
        }
      ]
    });

    const buffer = await Packer.toBuffer(document);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="grantpilot-${policy.id}.docx"`
      }
    });
  } catch (error: any) {
    console.error("Lỗi xuất file DOCX:", error);
    return NextResponse.json({ error: error.message || "Lỗi xử lý xuất file Word" }, { status: 500 });
  }
}
