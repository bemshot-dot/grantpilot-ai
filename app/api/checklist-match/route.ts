import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const provider = req.headers.get("x-ai-provider") || "Google Gemini";
    const customApiKey = req.headers.get("x-ai-api-key");
    const customModel = req.headers.get("x-ai-model");

    let apiKey = customApiKey;
    if (!apiKey) {
      if (provider === "Google Gemini") {
        apiKey = process.env.GEMINI_API_KEY;
      } else if (provider === "OpenAI") {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === "Anthropic") {
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (provider === "xAI Grok") {
        apiKey = process.env.GROK_API_KEY || process.env.OPENAI_API_KEY;
      }
    }

    if (!apiKey || apiKey.includes("YOUR_GEMINI_API_KEY_HERE")) {
      return NextResponse.json(
        { error: `Vui lòng cấu hình API Key cho ${provider} trong Cài đặt AI hoặc file môi trường để chạy Đối chiếu checklist!` },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const checklistRaw = formData.get("checklist") as string;
    if (!checklistRaw) {
      return NextResponse.json({ error: "Không tìm thấy danh sách checklist đối chiếu." }, { status: 400 });
    }

    const checklist: string[] = JSON.parse(checklistRaw);
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Vui lòng chọn ít nhất một tài liệu để đối chiếu." }, { status: 400 });
    }

    // Đọc tất cả file tài liệu tải lên
    const documentsData = await Promise.all(
      files.map(async (file) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ext = file.name.split(".").pop()?.toLowerCase();
        let mimeType = file.type || "application/octet-stream";
        if (ext === "pdf") mimeType = "application/pdf";
        if (ext === "txt") mimeType = "text/plain";
        
        const isTxt = ext === "txt" || mimeType === "text/plain";
        const textContent = isTxt ? buffer.toString("utf8") : "";

        return {
          base64: buffer.toString("base64"),
          type: mimeType,
          name: file.name,
          isTxt,
          textContent
        };
      })
    );

    const hasPdf = documentsData.some(doc => doc.type === "application/pdf");
    if (hasPdf && provider !== "Google Gemini") {
      return NextResponse.json(
        { error: "Đối chiếu file PDF trực tiếp hiện tại chỉ hỗ trợ với nhà cung cấp Google Gemini. Vui lòng chuyển đổi sang Gemini hoặc sử dụng tệp ảnh (PNG/JPG) / file văn bản (TXT) để đối chiếu." },
        { status: 400 }
      );
    }

    // Trích xuất nội dung văn bản đối với các file TXT
    let textDocumentsContext = "";
    documentsData.forEach(doc => {
      if (doc.isTxt) {
        textDocumentsContext += `\n\n--- NỘI DUNG TÀI LIỆU ĐÍNH KÈM [${doc.name}] ---\n${doc.textContent}\n`;
      }
    });

    const systemInstruction = "Bạn là chuyên gia thẩm định hồ sơ pháp lý. Nhiệm vụ của bạn là đọc các tài liệu đính kèm được tải lên (có thể là ảnh chụp, file PDF hoặc nội dung văn bản) và so khớp với từng mục trong danh sách checklist yêu cầu. Xác định trạng thái của từng mục checklist: '✓ đã có' (nếu tài liệu chứng minh được mục đó), '✗ thiếu' (nếu không thấy tài liệu nào khớp), hoặc '? chưa rõ' (nếu tài liệu mờ hoặc không đủ thông tin xác minh). Cho mỗi mục, cung cấp một bình luận giải thích ngắn gọn bằng tiếng Việt (dưới 30 từ).";

    const userPrompt = `Danh sách checklist cần chuẩn bị:
${checklist.map((item, idx) => `${idx + 1}. ${item}`).join("\n")}

Hãy đối chiếu các tài liệu được tải lên với danh sách checklist ở trên (chú ý đọc kỹ cả tài liệu hình ảnh/PDF đính kèm và phần văn bản đính kèm dưới đây nếu có) và trả về kết quả dưới định dạng JSON có cấu trúc như sau:
{
  "matches": [
    {
      "checklist_item": "tên chính xác của mục checklist",
      "status": "✓ đã có" | "✗ thiếu" | "? chưa rõ",
      "comment": "giải thích ngắn gọn lý do đánh giá"
    }
  ]
}
${textDocumentsContext}`;

    // 1. Google Gemini
    if (provider === "Google Gemini") {
      const model = customModel || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const parts = [
        ...documentsData.filter(doc => !doc.isTxt).map(doc => ({
          inlineData: {
            mimeType: doc.type,
            data: doc.base64
          }
        })),
        { text: userPrompt }
      ];

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                matches: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      checklist_item: { type: "STRING" },
                      status: { type: "STRING" },
                      comment: { type: "STRING" }
                    },
                    required: ["checklist_item", "status", "comment"]
                  }
                }
              },
              required: ["matches"]
            }
          }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Gemini API");
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!text) throw new Error("Không nhận được phản hồi từ Gemini API");
      return NextResponse.json(JSON.parse(text));
    }

    // 2. OpenAI & xAI Grok (Tương thích)
    if (provider === "OpenAI" || provider === "xAI Grok") {
      const isGrok = provider === "xAI Grok";
      const endpoint = isGrok ? "https://api.x.ai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
      const model = customModel || (isGrok ? "grok-4-fast" : "gpt-4o-mini");

      const imageContentBlocks = documentsData.filter(doc => !doc.isTxt).map(doc => ({
        type: "image_url",
        image_url: {
          url: `data:${doc.type};base64,${doc.base64}`
        }
      }));

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            {
              role: "user",
              content: [
                { type: "text", text: userPrompt },
                ...imageContentBlocks
              ]
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Lỗi gọi API của ${provider}`);
      return NextResponse.json(JSON.parse(data.choices[0].message.content));
    }

    // 3. Anthropic Claude
    if (provider === "Anthropic") {
      const model = customModel || "claude-sonnet-4-5";
      
      const anthropicContent = [
        ...documentsData.filter(doc => !doc.isTxt).map(doc => ({
          type: "image",
          source: {
            type: "base64",
            media_type: doc.type,
            data: doc.base64
          }
        })),
        {
          type: "text",
          text: userPrompt
        }
      ];

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system: systemInstruction + " Trả về DUY NHẤT một chuỗi JSON thuần chứa kết quả khớp.",
          messages: [{ role: "user", content: anthropicContent }]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Anthropic API");
      
      const text = data.content[0].text.trim();
      return NextResponse.json(JSON.parse(text));
    }

    throw new Error("Không hỗ trợ nhà cung cấp AI này.");

  } catch (error: any) {
    console.error("Lỗi đối chiếu checklist bằng AI:", error);
    return NextResponse.json({ error: error.message || "Lỗi xử lý hệ thống" }, { status: 500 });
  }
}
