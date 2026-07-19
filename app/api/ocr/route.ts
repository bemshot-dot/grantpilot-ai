import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const provider = req.headers.get("x-ai-provider") || "Google Gemini";
    const customApiKey = req.headers.get("x-ai-api-key");
    const customModel = req.headers.get("x-ai-model");

    // Lấy API key tương ứng với từng nhà cung cấp
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
        { error: `Vui lòng cấu hình API Key cho ${provider} trong phần Cài đặt AI hoặc file môi trường (.env.local) để tiếp tục!` },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "Không tìm thấy file tải lên." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileType = file.type || "application/pdf";
    const isPdf = fileType === "application/pdf";

    const isDocx = file.name.endsWith(".docx") || fileType.includes("officedocument.wordprocessingml");
    if (isDocx) {
      const mammoth = require("mammoth");
      const mammothResult = await mammoth.extractRawText({ buffer });
      const docxText = mammothResult.value;
      console.log(`[OCR API] Đọc file Word (.docx) thành công, độ dài: ${docxText.length} ký tự.`);

      // 1. Google Gemini
      if (provider === "Google Gemini") {
        const modelName = customModel || "gemini-2.5-flash";
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `Đây là văn bản trích xuất từ file Word (.docx):\n\n${docxText}\n\nHãy đọc văn bản trên và trích xuất thông tin doanh nghiệp.` }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" }, tax_code: { type: "STRING" }, province: { type: "STRING" },
                  industry: { type: "STRING" }, employees: { type: "INTEGER" }, revenue_bil: { type: "NUMBER" },
                  capital_bil: { type: "NUMBER" }, startup_innovation: { type: "BOOLEAN" }
                },
                required: ["name", "tax_code", "province", "industry", "employees", "revenue_bil", "capital_bil", "startup_innovation"]
              }
            }
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Gemini API");
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        if (!text) throw new Error("Phản hồi rỗng từ Gemini API.");
        return NextResponse.json(JSON.parse(text));
      }

      // 2. OpenAI & FPT AI (docx)
      if (provider === "OpenAI" || provider === "FPT AI") {
        const model = customModel || (provider === "FPT AI" ? "DeepSeek-V4-Flash" : "gpt-4o-mini");
        const endpoint = provider === "FPT AI" 
          ? "https://mkp-api.fptcloud.com/v1/chat/completions" 
          : "https://api.openai.com/v1/chat/completions";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Bạn là AI trích xuất thông tin doanh nghiệp sang JSON. Hãy đọc văn bản đính kèm và trả về JSON có dạng: { name: string, tax_code: string, province: string, industry: string, employees: number, revenue_bil: number, capital_bil: number, startup_innovation: boolean }. Chú ý: Lĩnh vực chỉ chọn một trong các giá trị: Phần mềm / AI, Sản xuất, Nông nghiệp, Dịch vụ đổi mới sáng tạo, Khác." },
              { role: "user", content: `Đọc văn bản sau và trích xuất JSON:\n\n${docxText}` }
            ],
            response_format: { type: "json_object" }
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || `Lỗi gọi ${provider} API`);
        return NextResponse.json(JSON.parse(data.choices[0].message.content));
      }

      // 3. Anthropic
      if (provider === "Anthropic") {
        const model = customModel || "claude-3-5-haiku-20241022";
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
            messages: [
              {
                role: "user",
                content: `Hãy đọc văn bản bóc tách từ file Word (.docx) này và trích xuất thông tin doanh nghiệp. Trả về DUY NHẤT một chuỗi JSON có định dạng như sau, không kèm giải thích, không Markdown: { "name": "string", "tax_code": "string", "province": "string", "industry": "string", "employees": number, "revenue_bil": number, "capital_bil": number, "startup_innovation": boolean }\n\nVăn bản:\n${docxText}`
              }
            ]
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Lỗi Anthropic API");
        return NextResponse.json(JSON.parse(data.content[0].text.trim()));
      }

      // 4. xAI Grok
      if (provider === "xAI Grok") {
        const model = customModel || "grok-4-fast";
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Bạn là AI trích xuất thông tin doanh nghiệp sang JSON. Hãy đọc văn bản đính kèm và trả về JSON có dạng: { name: string, tax_code: string, province: string, industry: string, employees: number, revenue_bil: number, capital_bil: number, startup_innovation: boolean }. Chú ý: Lĩnh vực chỉ chọn một trong các giá trị: Phần mềm / AI, Sản xuất, Nông nghiệp, Dịch vụ đổi mới sáng tạo, Khác." },
              { role: "user", content: `Đọc văn bản sau và trích xuất JSON:\n\n${docxText}` }
            ],
            response_format: { type: "json_object" }
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "Lỗi xAI API");
        return NextResponse.json(JSON.parse(data.choices[0].message.content));
      }
    }

    // ----------------------------------------------------
    // Xử lý bằng nhà cung cấp: GOOGLE GEMINI
    // ----------------------------------------------------
    if (provider === "Google Gemini" || (isPdf && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GROK_API_KEY)) {
      const modelName = customModel || "gemini-2.5-flash";
      console.log(`[Gemini OCR] Đang phân tích ${file.name} bằng ${modelName}...`);
      
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inlineData: {
                  mimeType: fileType,
                  data: buffer.toString("base64")
                }
              },
              {
                text: "Hãy đóng vai trò là một chuyên gia pháp lý. Hãy đọc tài liệu đính kèm (có thể là đăng ký kinh doanh, báo cáo tài chính hoặc hồ sơ doanh nghiệp) và trích xuất chính xác các thông tin doanh nghiệp theo đúng cấu trúc tiếng Việt được yêu cầu."
              }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING", description: "Tên đầy đủ của doanh nghiệp bằng tiếng Việt" },
                tax_code: { type: "STRING", description: "Mã số thuế doanh nghiệp (10 hoặc 13 số)" },
                province: { type: "STRING", description: "Tỉnh/Thành phố trụ sở chính" },
                industry: { type: "STRING", description: "Lĩnh vực hoạt động chính" },
                employees: { type: "INTEGER", description: "Số lượng người lao động hiện tại" },
                revenue_bil: { type: "NUMBER", description: "Doanh thu năm gần nhất tính theo tỷ đồng" },
                capital_bil: { type: "NUMBER", description: "Vốn điều lệ tính theo tỷ đồng" },
                startup_innovation: { type: "BOOLEAN", description: "Có phải là startup đổi mới sáng tạo hay không" }
              },
              required: ["name", "tax_code", "province", "industry", "employees", "revenue_bil", "capital_bil", "startup_innovation"]
            }
          }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Gemini API");
      const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      if (!resultText) throw new Error("Không nhận được phản hồi từ Gemini API");
      return NextResponse.json(JSON.parse(resultText));
    }

    // 2. OpenAI & FPT AI (image OCR)
    if (provider === "OpenAI" || provider === "FPT AI") {
      if (isPdf) {
        // Fallback sang Gemini nếu có cấu hình sẵn
        if (process.env.GEMINI_API_KEY) {
          console.log(`[${provider} Fallback] Đọc file PDF chuyển hướng sang Gemini...`);
          const geminiApiKey = process.env.GEMINI_API_KEY;
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: fileType, data: buffer.toString("base64") } },
                  { text: "Trích xuất thông tin doanh nghiệp." }
                ]
              }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" }, tax_code: { type: "STRING" }, province: { type: "STRING" },
                    industry: { type: "STRING" }, employees: { type: "INTEGER" }, revenue_bil: { type: "NUMBER" },
                    capital_bil: { type: "NUMBER" }, startup_innovation: { type: "BOOLEAN" }
                  },
                  required: ["name", "tax_code", "province", "industry", "employees", "revenue_bil", "capital_bil", "startup_innovation"]
                }
              }
            })
          });
          const data = await response.json();
          if (response.ok) {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            if (text) return NextResponse.json(JSON.parse(text));
          }
        }
        return NextResponse.json(
          { error: `${provider} không hỗ trợ đọc file PDF trực tiếp. Vui lòng chuyển sang nhà cung cấp Google Gemini hoặc tải lên file ảnh (PNG/JPG).` },
          { status: 400 }
        );
      }

      const model = customModel || (provider === "FPT AI" ? "Qwen2.5-VL-7B-Instruct" : "gpt-4o");
      const endpoint = provider === "FPT AI" 
        ? "https://mkp-api.fptcloud.com/v1/chat/completions" 
        : "https://api.openai.com/v1/chat/completions";
      console.log(`[${provider} Vision OCR] Đang phân tích ảnh ${file.name} bằng ${model}...`);
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Bạn là một AI trích xuất thông tin từ tài liệu đăng ký kinh doanh. Hãy đọc ảnh đính kèm và trả về thông tin dạng JSON theo cấu trúc sau: { name: string, tax_code: string, province: string, industry: string, employees: number, revenue_bil: number, capital_bil: number, startup_innovation: boolean }. Chú ý: Lĩnh vực chỉ chọn một trong các giá trị: Phần mềm / AI, Sản xuất, Nông nghiệp, Dịch vụ đổi mới sáng tạo, Khác."
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Trích xuất thông tin từ ảnh này." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${fileType};base64,${buffer.toString("base64")}`
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Lỗi gọi ${provider} API`);
      return NextResponse.json(JSON.parse(data.choices[0].message.content));
    }

    // ----------------------------------------------------
    // Xử lý bằng nhà cung cấp: ANTHROPIC (Claude)
    // ----------------------------------------------------
    if (provider === "Anthropic") {
      if (isPdf) {
        if (process.env.GEMINI_API_KEY) {
          console.log("[Anthropic Fallback] Đọc file PDF chuyển hướng sang Gemini...");
          const geminiApiKey = process.env.GEMINI_API_KEY;
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType: fileType, data: buffer.toString("base64") } },
                  { text: "Trích xuất thông tin doanh nghiệp." }
                ]
              }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING" }, tax_code: { type: "STRING" }, province: { type: "STRING" },
                    industry: { type: "STRING" }, employees: { type: "INTEGER" }, revenue_bil: { type: "NUMBER" },
                    capital_bil: { type: "NUMBER" }, startup_innovation: { type: "BOOLEAN" }
                  },
                  required: ["name", "tax_code", "province", "industry", "employees", "revenue_bil", "capital_bil", "startup_innovation"]
                }
              }
            })
          });
          const data = await response.json();
          if (response.ok) {
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
            if (text) return NextResponse.json(JSON.parse(text));
          }
        }
        return NextResponse.json(
          { error: "Anthropic không hỗ trợ đọc file PDF trực tiếp. Vui lòng chuyển sang nhà cung cấp Google Gemini hoặc tải lên file ảnh (PNG/JPG)." },
          { status: 400 }
        );
      }

      const model = customModel || "claude-3-5-sonnet-20241022";
      console.log(`[Anthropic Vision OCR] Đang phân tích ảnh ${file.name} bằng ${model}...`);
      
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
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: fileType,
                    data: buffer.toString("base64")
                  }
                },
                {
                  type: "text",
                  text: "Hãy đọc ảnh đính kèm và trích xuất thông tin doanh nghiệp. Trả về DUY NHẤT một chuỗi JSON có định dạng như sau, không được kèm giải thích, không Markdown: { \"name\": \"string\", \"tax_code\": \"string\", \"province\": \"string\", \"industry\": \"string\", \"employees\": number, \"revenue_bil\": number, \"capital_bil\": number, \"startup_innovation\": boolean }"
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi Anthropic API");
      return NextResponse.json(JSON.parse(data.content[0].text.trim()));
    }

    // ----------------------------------------------------
    // Xử lý bằng nhà cung cấp: xAI Grok (Chỉ hỗ trợ Ảnh, PDF tự động fallback sang Gemini)
    // ----------------------------------------------------
    if (provider === "xAI Grok") {
      if (isPdf) {
        if (process.env.GEMINI_API_KEY) {
          console.log("[xAI Fallback] Đọc file PDF chuyển hướng sang Gemini...");
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: [{ inlineData: { mimeType: fileType, data: buffer.toString("base64") } }, "Trích xuất thông tin doanh nghiệp."],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" }, tax_code: { type: "STRING" }, province: { type: "STRING" },
                  industry: { type: "STRING" }, employees: { type: "INTEGER" }, revenue_bil: { type: "NUMBER" },
                  capital_bil: { type: "NUMBER" }, startup_innovation: { type: "BOOLEAN" }
                },
                required: ["name", "tax_code", "province", "industry", "employees", "revenue_bil", "capital_bil", "startup_innovation"]
              }
            }
          });
          const text = response.text;
          if (text) return NextResponse.json(JSON.parse(text));
        }
        return NextResponse.json(
          { error: "xAI Grok không hỗ trợ đọc file PDF trực tiếp. Vui lòng chuyển sang nhà cung cấp Google Gemini hoặc tải lên file ảnh (PNG/JPG)." },
          { status: 400 }
        );
      }

      const model = customModel || "grok-4-fast";
      console.log(`[xAI Vision OCR] Đang phân tích ảnh ${file.name} bằng ${model}...`);
      
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Bạn là một AI trích xuất thông tin từ tài liệu đăng ký kinh doanh. Hãy đọc ảnh đính kèm và trả về thông tin dạng JSON theo cấu trúc sau: { name: string, tax_code: string, province: string, industry: string, employees: number, revenue_bil: number, capital_bil: number, startup_innovation: boolean }. Chú ý: Lĩnh vực chỉ chọn một trong các giá trị: Phần mềm / AI, Sản xuất, Nông nghiệp, Dịch vụ đổi mới sáng tạo, Khác."
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Trích xuất thông tin từ ảnh này." },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${fileType};base64,${buffer.toString("base64")}`
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Lỗi gọi xAI API");
      return NextResponse.json(JSON.parse(data.choices[0].message.content));
    }

    throw new Error("Không hỗ trợ nhà cung cấp này.");

  } catch (error: any) {
    console.error("Lỗi luồng OCR tổng hợp:", error);
    return NextResponse.json({ error: error.message || "Lỗi xử lý hệ thống" }, { status: 500 });
  }
}
