import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

import { answerQuestion, classifySme, type Answer, type CorpusChunk, type Profile } from "@/lib/grantpilot";
import { hybridRetrieve } from "@/lib/retrieval";

const SYSTEM_INSTRUCTION = `Bạn là trợ lý pháp lý AI của GrantPilot, giúp doanh nghiệp nhỏ và vừa/startup Việt Nam tra cứu chính sách hỗ trợ.

Quy tắc bắt buộc:
- CHỈ trả lời dựa trên các đoạn trích dẫn corpus và thông tin hồ sơ doanh nghiệp được cung cấp. Không được bịa, không dùng kiến thức ngoài các dữ liệu này.
- Được phép sử dụng kết quả phân loại quy mô DNNVV ghi trong phần "Hồ sơ doanh nghiệp đang xét" (nếu có) để kết luận trực tiếp quy mô của doanh nghiệp.
- Nếu các dữ liệu được cung cấp không đủ căn cứ hoặc câu hỏi hoàn toàn ngoài phạm vi của dữ liệu hiện có (ví dụ như hỏi về địa lý, lịch sử, nghệ thuật, thủ đô nước ngoài như Paris, v.v.), bạn phải trả lời chính xác theo định dạng và cấu trúc sau (bao gồm cả dòng tiêu đề đầu tiên):
  Ngoài phạm vi dữ liệu
  Không đủ thông tin trong dữ liệu hiện có để trả lời chắc chắn câu hỏi về [tên chủ đề câu hỏi]. Các đoạn trích pháp lý được cung cấp chỉ liên quan đến quy định hỗ trợ doanh nghiệp nhỏ và vừa, quỹ đầu tư khởi nghiệp sáng tạo và thủ tục vay vốn tại Việt Nam. Để có thông tin chính xác về nội dung này, quý khách cần tham khảo các nguồn tài liệu [địa lý / lịch sử / khoa học...] phù hợp.
- Trả lời ngắn gọn (3-6 câu), rõ ràng, bằng tiếng Việt, có thể nhắc số hiệu văn bản/điều khoản khi phù hợp.
- Đây là công cụ sàng lọc ban đầu, không thay thế tư vấn pháp lý hoặc xác nhận của cơ quan có thẩm quyền.
- Chỉ trả về văn bản câu trả lời thuần, không thêm tiêu đề, không lặp lại đoạn trích, không markdown.`;

function buildPrompt(question: string, profile: Profile | undefined, chunks: CorpusChunk[], history?: { role: "user" | "assistant"; text: string }[]) {
  const context = chunks
    .map(
      (chunk, index) =>
        `[Đoạn ${index + 1}] ${chunk.title} - ${chunk.clause} (${chunk.status})\n${chunk.text}`
    )
    .join("\n\n");

  const profileContext = profile
    ? (() => {
        const sme = classifySme(profile);
        return `Hồ sơ doanh nghiệp đang xét: ${profile.name || "chưa đặt tên"}, lĩnh vực ${profile.industry}, tỉnh/thành ${profile.province}, lao động ${profile.employees}, doanh thu ${profile.revenue_bil} tỷ, vốn ${profile.capital_bil} tỷ, startup đổi mới sáng tạo: ${profile.startup_innovation ? "có" : "không"}. Phân loại DNNVV theo Nghị định 80/2021: ${sme.size} (${sme.is_sme ? "thuộc DNNVV" : "không thuộc DNNVV"}).\n\n`;
      })()
    : "";

  let historyContext = "";
  if (history && history.length > 0) {
    historyContext = "Lịch sử cuộc trò chuyện gần đây:\n" + history.map(h => `${h.role === "user" ? "Người dùng" : "Trợ lý AI"}: ${h.text}`).join("\n") + "\n\n";
  }

  return `${profileContext}Các đoạn trích từ corpus pháp lý:\n\n${context}\n\n${historyContext}Câu hỏi mới nhất cần trả lời: ${question}`;
}

export async function POST(request: Request) {
  const { question, profile, history } = (await request.json()) as { 
    question?: string; 
    profile?: Profile;
    history?: { role: "user" | "assistant"; text: string }[]
  };

  if (!question || !question.trim()) {
    return NextResponse.json({ error: "Thiếu câu hỏi." }, { status: 400 });
  }

  // Tránh việc hội thoại nhiều lượt bị mất bối cảnh RAG (vượt lượt sau hỏi không chứa từ khóa của lượt trước)
  let searchQuery = question;
  if (history && history.length > 0) {
    const lastUserMsg = [...history].reverse().find(h => h.role === "user");
    if (lastUserMsg) {
      searchQuery = `${lastUserMsg.text} ${question}`;
    }
  }

  let { chunks, mode } = await hybridRetrieve(searchQuery, 5);
  console.log(`[/api/qa] retrieval mode=${mode} chunks=${chunks.length} searchQuery="${searchQuery}"`);

  // Tự động chèn bối cảnh phân loại doanh nghiệp (Nghị định 80 Điều 5) nếu hỏi về quy mô của mình
  const lowerQ = question.toLowerCase();
  const isPersonalQuery = lowerQ.includes("tôi") || lowerQ.includes("mình") || lowerQ.includes("công ty");
  const isSmeQuery = lowerQ.includes("nhỏ") || lowerQ.includes("vừa") || lowerQ.includes("siêu nhỏ") || lowerQ.includes("sme") || lowerQ.includes("quy mô") || lowerQ.includes("phân loại");
  
  if (isPersonalQuery && isSmeQuery) {
    if (!chunks.some(c => c.id === "nd80-dieu5")) {
      try {
        const fs = require("fs");
        const path = require("path");
        const corpusPath = path.join(process.cwd(), "data", "corpus.json");
        if (fs.existsSync(corpusPath)) {
          const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
          const d5 = corpus.find((c: any) => c.id === "nd80-dieu5");
          if (d5) {
            chunks = [d5, ...chunks];
            console.log("[/api/qa] Tự động bổ sung bối cảnh nd80-dieu5 cho câu hỏi cá nhân về quy mô.");
          }
        }
      } catch (e) {
        console.error("Lỗi tự động chèn bối cảnh Nghị định 80:", e);
      }
    }
  }

  // Cho phép câu hỏi ngoài phạm vi đi thẳng vào LLM để nhận được câu trả lời từ chối được cá nhân hóa theo chủ đề của người dùng

  const citations = chunks.map((chunk) => ({
    document: chunk.title,
    clause: chunk.clause,
    status: chunk.status,
    source: chunk.source
  }));

  const provider = request.headers.get("x-ai-provider") || "Google Gemini";
  const customApiKey = request.headers.get("x-ai-api-key");
  const customModel = request.headers.get("x-ai-model");

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
    }
  }

  if (!apiKey || apiKey.includes("YOUR_GEMINI_API_KEY_HERE")) {
    console.error(`API_KEY cho ${provider} chưa được cấu hình — dùng câu trả lời soạn sẵn (fallback).`);
    return NextResponse.json(answerQuestion(question, profile));
  }

  const promptText = buildPrompt(question, profile, chunks, history);

  try {
    let replyText = "";

    // 1. Google Gemini
    if (provider === "Google Gemini") {
      const modelName = customModel || process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          generationConfig: { temperature: 0.2 }
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Gemini API");
      replyText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    }

    // 2. OpenAI
    else if (provider === "OpenAI") {
      const modelName = customModel || "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: promptText }
          ],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi OpenAI API");
      replyText = data.choices[0].message.content.trim();
    }

    // 3. Anthropic Claude
    else if (provider === "Anthropic") {
      const modelName = customModel || "claude-sonnet-4-5";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1024,
          system: SYSTEM_INSTRUCTION,
          messages: [{ role: "user", content: promptText }],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Anthropic API");
      replyText = data.content[0].text.trim();
    }

    // 4. xAI Grok
    else if (provider === "xAI Grok") {
      const modelName = customModel || "grok-4-fast";
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: promptText }
          ],
          temperature: 0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi xAI API");
      replyText = data.choices[0].message.content.trim();
    }

    if (!replyText) throw new Error("Phản hồi rỗng từ LLM.");

    const insufficient = /không đủ thông tin/i.test(replyText);
    const result: Answer = {
      text: replyText,
      citations: insufficient ? [] : citations,
      confidence: insufficient ? "Ngoài corpus" : "Có căn cứ trong corpus"
    };
    return NextResponse.json(result);

  } catch (error: any) {
    console.error(`[${provider}] RAG Q&A thất bại, sử dụng câu trả lời soạn sẵn (fallback):`, error);
    if (customApiKey) {
      const errorMsg = error.message || "Lỗi không xác định.";
      const errorResponse: Answer = {
        text: `❌ Lỗi kết nối tới mô hình AI: "${errorMsg}". Vui lòng kiểm tra lại API Key hoặc đổi Model (ví dụ sang gemini-flash-latest) trong phần Cài đặt AI.`,
        citations: [],
        confidence: "Lỗi kết nối"
      };
      return NextResponse.json(errorResponse);
    }
    return NextResponse.json(answerQuestion(question, profile));
  }
}
