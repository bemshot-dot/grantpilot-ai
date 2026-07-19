import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const provider = req.headers.get("x-ai-provider") || "Google Gemini";
    const customApiKey = req.headers.get("x-ai-api-key");
    const customModel = req.headers.get("x-ai-model");

    let apiKey: string | null | undefined = customApiKey;
    if (!apiKey) {
      if (provider === "Google Gemini") {
        apiKey = process.env.GEMINI_API_KEY;
      } else if (provider === "OpenAI") {
        apiKey = process.env.OPENAI_API_KEY;
      } else if (provider === "Anthropic") {
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (provider === "xAI Grok") {
        apiKey = process.env.GROK_API_KEY || process.env.OPENAI_API_KEY;
      } else if (provider === "FPT AI") {
        apiKey = process.env.FPT_API_KEY;
      }
    }

    if (!apiKey || apiKey.includes("YOUR_GEMINI_API_KEY_HERE")) {
      return NextResponse.json(
        { error: `Vui lòng cấu hình API Key cho ${provider} trong Cài đặt AI hoặc file môi trường để chạy Phân tích sâu!` },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { policy, profile, score, reasons = [], gaps = [] } = body;

    if (!policy || !profile) {
      return NextResponse.json({ error: "Thiếu dữ liệu chính sách hoặc hồ sơ doanh nghiệp." }, { status: 400 });
    }

    const systemInstruction = "Bạn là chuyên gia tư vấn chính sách hỗ trợ doanh nghiệp Việt Nam. Hãy đọc kết quả phân tích mức độ phù hợp và giải thích ngắn gọn, súc tích (khoảng 3-4 câu, dưới 120 từ) bằng tiếng Việt lý do doanh nghiệp này phù hợp hoặc chưa phù hợp với chính sách được yêu cầu. Dựa trên các dữ kiện được cung cấp: lý do đạt, và khoảng thiếu hụt. Tuyệt đối không tự bịa thêm các điều kiện mới không có trong dữ kiện.";

    const userPrompt = `Chính sách đang xét: "${policy.title}"
Hồ sơ doanh nghiệp: "${profile.name}" (Lao động: ${profile.employees} người, Doanh thu: ${profile.revenue_bil} tỷ, Vốn: ${profile.capital_bil} tỷ, Tỉnh: ${profile.province}, Lĩnh vực: ${profile.industry})
Điểm đối chiếu: ${score}/100
Lý do phù hợp đã phát hiện: ${reasons.length ? reasons.join(" · ") : "Không có"}
Khoảng thiếu hụt cần bổ sung: ${gaps.length ? gaps.join(" · ") : "Không có"}`;

    // 1. Google Gemini
    if (provider === "Google Gemini") {
      const model = customModel || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.2 }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Gemini API");
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      return NextResponse.json({ explanation: replyText || "Không thể khởi tạo phân tích." });
    }

    // 2. OpenAI & FPT AI (recommendation)
    if (provider === "OpenAI" || provider === "FPT AI") {
      const model = customModel || (provider === "FPT AI" ? "DeepSeek-V4-Flash" : "gpt-4o-mini");
      const endpoint = provider === "FPT AI" 
        ? "https://mkp-api.fptcloud.com/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
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
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Lỗi gọi ${provider} API`);
      return NextResponse.json({ explanation: data.choices[0].message.content.trim() });
    }

    // 3. Anthropic Claude
    if (provider === "Anthropic") {
      const model = customModel || "claude-sonnet-4-5";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemInstruction,
          messages: [{ role: "user", content: userPrompt }],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Anthropic API");
      return NextResponse.json({ explanation: data.content[0].text.trim() });
    }

    // 4. xAI Grok
    if (provider === "xAI Grok") {
      const model = customModel || "grok-4-fast";
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi xAI API");
      return NextResponse.json({ explanation: data.choices[0].message.content.trim() });
    }

    throw new Error("Không hỗ trợ nhà cung cấp AI này.");

  } catch (error: any) {
    console.error("Lỗi phân tích sâu AI:", error);
    return NextResponse.json({ error: error.message || "Lỗi xử lý hệ thống" }, { status: 500 });
  }
}
