"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState, useRef } from "react";

import {
  Answer,
  MatchResult,
  Profile,
  classifySme,
  goldenQuestions,
  matchPolicies,
  parseUploadedText,
  policies,
  policyWatch,
  sampleProfiles
} from "@/lib/grantpilot";

type View = "overview" | "search" | "qa" | "updates";

const provinces = ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Bắc Ninh", "Khác"];
const industries = ["Phần mềm / AI", "Sản xuất", "Công nghệ cao", "Dịch vụ đổi mới sáng tạo", "Thương mại", "Khác"];

const navItems: { id: View; label: string; hint: string }[] = [
  { id: "overview", label: "Tổng quan", hint: "01" },
  { id: "search", label: "Tìm chính sách", hint: "02" },
  { id: "qa", label: "Hỏi đáp pháp lý", hint: "03" },
  { id: "updates", label: "Theo dõi cập nhật", hint: "04" }
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value.includes("cần xác minh") || value.includes("chưa ban hành") || value.includes("đang soạn thảo") || value.includes("chờ đồng bộ")) return "warning";
  if (value.includes("seed") || value.includes("nháp")) return "neutral";
  return "success";
}

function matchTone(matchLevel: MatchResult["match_level"]) {
  const lower = (matchLevel || "").toLowerCase();
  if (lower.includes("rất phù hợp") || lower.includes("có căn cứ")) return "success";
  if (lower.includes("cần rà soát") || lower.includes("cần xác minh") || lower.includes("cảnh báo")) return "warning";
  if (lower.includes("ngoài phạm vi") || lower.includes("không phù hợp") || lower.includes("loại bỏ")) return "error";
  return "neutral";
}

function ScoreRing({ score }: { score: number }) {
  return (
    <div className="score-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties} aria-label={`${score}% phù hợp`}>
      <span>{score}</span>
      <small>%</small>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [profile, setProfile] = useState<Profile>(sampleProfiles[0]);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<MatchResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [docxLoading, setDocxLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [uploadedProfileFile, setUploadedProfileFile] = useState<File | null>(null);

  interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
    citations?: { document: string; clause: string; status: string; source: string }[];
    confidence?: string;
  }

  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [answerLoading, setAnswerLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, answerLoading]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiProvider, setAiProvider] = useState("Google Gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");

  const [deepAnalysis, setDeepAnalysis] = useState("");
  const [deepAnalysisLoading, setDeepAnalysisLoading] = useState(false);
  const [crawlStatus, setCrawlStatus] = useState<"idle" | "running" | "success">("idle");
  const [crawlStep, setCrawlStep] = useState("");
  const [checklistResults, setChecklistResults] = useState<Record<string, { status: string; comment: string }> | null>(null);
  const [checklistMatching, setChecklistMatching] = useState(false);

  useEffect(() => {
    setDeepAnalysis("");
    setChecklistResults(null);
  }, [selectedPolicy]);

  const sme = useMemo(() => classifySme(profile), [profile]);
  const verifiedPolicyCount = useMemo(() => policies.filter((policy) => policy.status.includes("Còn hiệu lực")).length, []);

  useEffect(() => {
    if (!selectedPolicy) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedPolicy(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selectedPolicy]);

  useEffect(() => {
    const storedProvider = localStorage.getItem("gp_ai_provider");
    const storedKey = localStorage.getItem("gp_ai_key");
    const storedModel = localStorage.getItem("gp_ai_model");
    if (storedProvider) setAiProvider(storedProvider);
    if (storedKey) setAiApiKey(storedKey);
    if (storedModel) setAiModel(storedModel);
  }, []);

  function saveSettings() {
    localStorage.setItem("gp_ai_provider", aiProvider);
    localStorage.setItem("gp_ai_key", aiApiKey);
    localStorage.setItem("gp_ai_model", aiModel);
    setSettingsOpen(false);
    setMessage("Đã lưu cấu hình AI thành công!");
    setError("");
  }

  function updateProfile<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function chooseProfile(candidate: Profile) {
    setProfile(candidate);
    setResults([]);
    setMessage(`Đã chọn hồ sơ mẫu ${candidate.name}.`);
    setError("");
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setUploadedProfileFile(file);
    setError("");
    setMessage("");
    
    const fileNameLower = file.name.toLowerCase();
    const isTxt = fileNameLower.endsWith(".txt");
    const isPdf = fileNameLower.endsWith(".pdf");
    const isImage = fileNameLower.endsWith(".png") || fileNameLower.endsWith(".jpg") || fileNameLower.endsWith(".jpeg") || fileNameLower.endsWith(".webp");

    if (!isTxt && !isPdf && !isImage) {
      setError("Vui lòng chọn tệp TXT, PDF hoặc Ảnh (PNG, JPG, JPEG).");
      return;
    }

    if (isTxt) {
      try {
        const text = await file.text();
        const parsed = parseUploadedText(text);
        if (Object.keys(parsed).length === 0) {
          setError("Không tìm thấy thông tin doanh nghiệp nào phù hợp trong file TXT. Vui lòng kiểm tra định dạng hoặc các tiêu đề.");
          return;
        }
        setProfile((current) => ({ ...current, ...parsed }));
        setResults([]);
        setMessage("Đã đọc hồ sơ (OCR mock). Bạn có thể kiểm tra và bổ sung thông tin.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Không thể đọc tệp.");
      }
    } else {
      setAnalyzing(true);
      setMessage(`Đang tải lên và phân tích ${file.name} bằng Gemini API...`);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/ocr", {
          method: "POST",
          body: formData,
          headers: {
            "x-ai-provider": aiProvider,
            "x-ai-api-key": aiApiKey,
            "x-ai-model": aiModel
          }
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || "Không thể xử lý OCR file này.");
        }

        setProfile((current) => ({ ...current, ...result }));
        setResults([]);
        setMessage(`Đã đọc và phân tích thông tin từ file ${file.name} thành công bằng Gemini API!`);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Phân tích OCR thất bại.");
      } finally {
        setAnalyzing(false);
      }
    }
  }

  async function lookupTaxCode() {
    if (!profile.tax_code) return;
    setError("");
    setMessage("Đang tra cứu mã số thuế...");
    try {
      const response = await fetch(`/api/tax-lookup?taxCode=${encodeURIComponent(profile.tax_code)}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không tìm thấy thông tin doanh nghiệp.");
      }
      setProfile((current) => ({
        ...current,
        name: result.name,
        province: result.province,
        business_line: result.address
      }));
      setResults([]);
      setMessage(`Đã tra cứu thành công doanh nghiệp: ${result.name}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tra cứu thất bại.");
    }
  }

  async function analyze() {
    if (!profile.name || !profile.tax_code) {
      setError("Vui lòng hoàn thiện tên doanh nghiệp và mã số thuế.");
      return;
    }
    setError("");
    setMessage("");
    setAnalyzing(true);
    const recommendations = matchPolicies(profile);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setResults(recommendations);
    setMessage(`Đã đối chiếu ${policies.length} chính sách cho hồ sơ này.`);
    setAnalyzing(false);
  }

  async function triggerDeepAnalysis() {
    if (!selectedPolicy) return;
    setDeepAnalysisLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-provider": aiProvider,
          "x-ai-api-key": aiApiKey,
          "x-ai-model": aiModel
        },
        body: JSON.stringify({
          policy: selectedPolicy,
          profile,
          score: selectedPolicy.score,
          reasons: selectedPolicy.reasons,
          gaps: selectedPolicy.gaps
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể tải phân tích từ AI.");
      setDeepAnalysis(result.explanation);
    } catch (err: any) {
      setError(err.message || "Lỗi gọi AI phân tích sâu.");
    } finally {
      setDeepAnalysisLoading(false);
    }
  }

  async function runChecklistMatching(files: File[]) {
    if (!selectedPolicy || files.length === 0) return;
    
    setChecklistMatching(true);
    setError("");
    
    try {
      const formData = new FormData();
      formData.append("checklist", JSON.stringify(selectedPolicy.checklist));
      
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      
      const response = await fetch("/api/checklist-match", {
        method: "POST",
        headers: {
          "x-ai-provider": aiProvider,
          "x-ai-api-key": aiApiKey,
          "x-ai-model": aiModel
        },
        body: formData
      });
      
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Không thể đối chiếu tài liệu.");
      
      const resultMap: Record<string, { status: string; comment: string }> = {};
      if (result.matches && Array.isArray(result.matches)) {
        result.matches.forEach((item: any) => {
          resultMap[item.checklist_item] = {
            status: item.status,
            comment: item.comment
          };
        });
      }
      setChecklistResults(resultMap);
      
    } catch (err: any) {
      setError(err.message || "Lỗi đối chiếu tài liệu bằng AI.");
    } finally {
      setChecklistMatching(false);
    }
  }

  async function handleChecklistUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      await runChecklistMatching(Array.from(e.target.files));
    }
  }

  async function ask(nextQuestion: string) {
    if (!nextQuestion || !nextQuestion.trim()) return;
    
    const userMsgId = Date.now().toString();
    const newUserMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: nextQuestion
    };
    
    // Lưu lịch sử tạm thời để gửi đi
    const updatedHistory = [...chatHistory, newUserMsg];
    setChatHistory(updatedHistory);
    setQuestion(""); // Xoá sạch ô nhập liệu ngay lập tức
    setAnswerLoading(true);
    setError("");
    
    try {
      const simpleHistory = updatedHistory.map(h => ({
        role: h.role,
        text: h.text
      }));

      const response = await fetch("/api/qa", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-ai-provider": aiProvider,
          "x-ai-api-key": aiApiKey,
          "x-ai-model": aiModel
        },
        body: JSON.stringify({ 
          question: nextQuestion, 
          profile,
          history: simpleHistory 
        })
      });
      if (!response.ok) throw new Error("Không thể lấy câu trả lời.");
      const result = (await response.json()) as Answer;
      
      const assistantMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        text: result.text,
        citations: result.citations,
        confidence: result.confidence
      };
      setChatHistory(prev => [...prev, assistantMsg]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hỏi đáp thất bại.");
      setChatHistory(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: "assistant",
        text: "❌ Lỗi: Không thể kết nối tới mô hình AI để nhận phản hồi."
      }]);
    } finally {
      setAnswerLoading(false);
    }
  }

  async function startCrawl() {
    setCrawlStatus("running");
    const steps = [
      "📡 Đang kết nối tới Cổng Thông tin điện tử Chính phủ...",
      "🔍 Quét các văn bản luật ban hành tháng gần nhất (07/2026)...",
      "✨ Phát hiện 3 văn bản mới: TT 12/2026/TT-BTTTT, QĐ 88/QĐ-TTg, NQ 05/NQ-HĐND TP.HCM...",
      "⚙ Đang chạy AI Chunking & Cập nhật cơ sở dữ liệu..."
    ];
    
    for (let i = 0; i < steps.length; i++) {
      setCrawlStep(steps[i]);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      const response = await fetch("/api/simulate-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crawl" })
      });
      if (!response.ok) throw new Error("Crawl failed");
      setCrawlStatus("success");
      setMessage("Đã cào chính sách mới và cập nhật database!");
    } catch (e) {
      setCrawlStatus("idle");
      setError("Không thể cập nhật chính sách mới.");
    }
  }

  async function resetCrawl() {
    try {
      const response = await fetch("/api/simulate-crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" })
      });
      if (!response.ok) throw new Error("Reset failed");
      setCrawlStatus("idle");
      setMessage("Đã khôi phục cơ sở dữ liệu mặc định.");
    } catch (e) {
      setError("Không thể reset cơ sở dữ liệu.");
    }
  }

  async function downloadDocx(policy: MatchResult) {
    setDocxLoading(true);
    try {
      const response = await fetch("/api/grant-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, policy })
      });
      if (!response.ok) throw new Error("Không thể tạo file DOCX.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `grantpilot-${policy.id}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Xuất DOCX thất bại.");
    } finally {
      setDocxLoading(false);
    }
  }

  function navigate(next: View) {
    setView(next);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Điều hướng chính">
        <button className="brand" onClick={() => navigate("overview")}>
          <span className="brand-mark">G</span>
          <span>
            <strong>GrantPilot AI</strong>
            <small>Policy &amp; Grant Navigator</small>
          </span>
        </button>

        <div className="sidebar-label">Không gian làm việc</div>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span>{item.hint}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-card" style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-start", padding: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span className="status-dot" style={{ background: "#22c55e", width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" }} />
            <strong style={{ fontSize: "0.8rem", color: "var(--slate-800)" }}>Cam kết bảo mật</strong>
          </div>
          <p style={{ fontSize: "0.7rem", color: "var(--slate-500)", margin: 0, lineHeight: "1.4" }}>
            Thông tin của bạn được bảo mật tuyệt đối và chỉ sử dụng để đối chiếu chính sách.
          </p>
        </div>
        <div className="sidebar-footer">Vietnam AI Innovation Challenge 2026</div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <span className="eyebrow">GRANTPILOT WORKSPACE</span>
            <h1>{navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div className="data-health">
              <span /> {policies.length} chính sách đã kết nối
            </div>
            <button 
              onClick={() => setSettingsOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 12px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.8)",
                border: "1px solid #cbd5e1",
                fontSize: "0.8rem",
                fontWeight: "500",
                color: "#475569",
                cursor: "pointer",
                transition: "all 0.2s"
              }}
            >
              ⚙️ Cấu hình AI
            </button>
            <div className="avatar" aria-label="Hồ sơ người dùng">GP</div>
          </div>
        </header>

        {error && <div className="notice error-notice">{error}</div>}
        {message && <div className="notice success-notice">{message}</div>}

        {view === "overview" && (
          <section className="view-stack">
            <div className="hero-card">
              <div className="hero-copy">
                <span className="hero-kicker">POLICY INTELLIGENCE FOR BUSINESS</span>
                <h2>
                  Tìm đúng chính sách.
                  <br />
                  <em>Chuẩn bị đúng hồ sơ.</em>
                </h2>
                <p>
                  GrantPilot AI giúp doanh nghiệp đối chiếu nhu cầu với chính sách, giải thích điều kiện, trả lời câu hỏi pháp lý có căn
                  cứ và tạo checklist hành động có nguồn dẫn.
                </p>
                <div className="hero-actions">
                  <button className="primary-button" onClick={() => navigate("search")}>
                    Bắt đầu phân tích <span>→</span>
                  </button>
                  <button className="secondary-button" onClick={() => navigate("updates")}>
                    Xem cập nhật mới
                  </button>
                </div>
              </div>
              <div className="hero-visual" aria-hidden="true">
                <div className="visual-glow" />
                <div className="document-card card-back">
                  <span>POLICY</span>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="document-card card-front">
                  <div className="document-check">✓</div>
                  <strong>Hồ sơ phù hợp</strong>
                  <span>Đã đối chiếu điều kiện</span>
                  <div className="match-bar"><b /></div>
                  <small>92% tương thích</small>
                </div>
                <div className="route-line" />
              </div>
            </div>

            <div className="metrics-grid">
              <article className="metric-card">
                <span className="metric-index">01</span>
                <strong>{policies.length}</strong>
                <p>Chính sách mẫu</p>
                <small>Từ {new Set(policies.map((item) => item.source)).size} nguồn</small>
              </article>
              <article className="metric-card">
                <span className="metric-index">02</span>
                <strong>{verifiedPolicyCount}</strong>
                <p>Đang còn hiệu lực</p>
                <small>Có citation và nguồn gốc</small>
              </article>
              <article className="metric-card accent-metric">
                <span className="metric-index">03</span>
                <strong>{sampleProfiles.length}</strong>
                <p>Hồ sơ doanh nghiệp mẫu</p>
                <small>Sẵn sàng cho luồng demo</small>
              </article>
            </div>

            <div className="overview-grid">
              <section className="panel-card quick-start">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">BẮT ĐẦU NHANH</span>
                    <h3>Chọn một hồ sơ mẫu</h3>
                  </div>
                  <button className="text-button" onClick={() => navigate("search")}>Mở biểu mẫu →</button>
                </div>
                <div className="profile-list">
                  {sampleProfiles.map((candidate, index) => (
                    <button
                      key={candidate.id ?? candidate.tax_code}
                      onClick={() => {
                        chooseProfile(candidate);
                        navigate("search");
                      }}
                    >
                      <span className="company-avatar">{index === 0 ? "N" : "A"}</span>
                      <span>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.industry} · {candidate.province}</small>
                      </span>
                      <b>→</b>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel-card watch-preview">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">POLICY WATCH</span>
                    <h3>Cập nhật gần đây</h3>
                  </div>
                </div>
                {policyWatch.slice(0, 3).map((item) => (
                  <div className="watch-row" key={`${item.date}-${item.title}`}>
                    <span className={`status-marker ${statusClass(item.status)}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <small>{formatDate(item.date)} · {item.status}</small>
                    </div>
                  </div>
                ))}
              </section>
            </div>
          </section>
        )}

        {view === "search" && (
          <section className="search-layout">
            <div className="profile-column">
              <section className="panel-card upload-panel">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">BƯỚC 01</span>
                    <h3>Nhập hồ sơ doanh nghiệp</h3>
                  </div>
                  <span className="privacy-badge">Xử lý cục bộ</span>
                </div>

                <label
                  className={dragActive ? "dropzone active" : "dropzone"}
                  onDragEnter={(event: DragEvent) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragOver={(event: DragEvent) => event.preventDefault()}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(event: DragEvent) => {
                    event.preventDefault();
                    setDragActive(false);
                    handleFile(event.dataTransfer.files[0]);
                  }}
                >
                  {analyzing ? (
                    <div className="scanning-container">
                      <div className="scanning-doc">
                        <div className="scanning-doc-line" style={{ width: "100%" }} />
                        <div className="scanning-doc-line" style={{ width: "75%" }} />
                        <div className="scanning-doc-line" style={{ width: "90%" }} />
                        <div className="scanning-doc-line" style={{ width: "60%" }} />
                        <div className="scanning-laser" />
                      </div>
                      <span style={{ marginTop: "12px", fontSize: "0.85rem", fontWeight: "600", color: "var(--teal-600)" }}>
                        AI đang đọc tài liệu...
                      </span>
                    </div>
                  ) : (
                    <>
                      <input type="file" accept=".txt,.pdf,.docx,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => handleFile(event.target.files?.[0])} />
                      <span className="upload-icon">⇧</span>
                      <strong>Thả hồ sơ TXT, PDF, Word hoặc Ảnh tại đây</strong>
                      <p>hoặc bấm để chọn tệp · tối đa 10 MB</p>
                    </>
                  )}
                </label>

                <div className="sample-divider"><span>hoặc dùng hồ sơ mẫu</span></div>
                <div className="sample-buttons">
                  {sampleProfiles.map((candidate, index) => (
                    <button
                      key={candidate.id ?? candidate.tax_code}
                      className={profile.tax_code === candidate.tax_code ? "selected" : ""}
                      onClick={() => chooseProfile(candidate)}
                    >
                      <span>{index === 0 ? "N" : "A"}</span>
                      <div>
                        <strong>{candidate.name}</strong>
                        <small>{candidate.province}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel-card form-panel">
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">BƯỚC 02</span>
                    <h3>Kiểm tra thông tin</h3>
                  </div>
                  <span className="demo-badge">{sme.size}</span>
                </div>

                <div className="form-grid">
                  <label className="wide-field">
                    Tên doanh nghiệp
                    <input value={profile.name} onChange={(e) => updateProfile("name", e.target.value)} />
                  </label>
                  <label>
                    Mã số thuế
                    <div style={{ display: "flex", gap: "6px" }}>
                      <input 
                        value={profile.tax_code} 
                        onChange={(e) => updateProfile("tax_code", e.target.value)} 
                        style={{ flex: 1 }}
                      />
                      <button 
                        type="button" 
                        onClick={lookupTaxCode} 
                        className="secondary-button"
                        style={{ padding: "0 12px", fontSize: "0.85rem", height: "38px" }}
                        disabled={!profile.tax_code}
                      >
                        Tra cứu
                      </button>
                    </div>
                  </label>
                  <label>
                    Địa phương
                    <select value={profile.province} onChange={(e) => updateProfile("province", e.target.value)}>
                      {provinces.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Lĩnh vực
                    <select value={profile.industry} onChange={(e) => updateProfile("industry", e.target.value)}>
                      {industries.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="wide-field">
                    Ngành nghề / mô tả
                    <textarea value={profile.business_line ?? ""} onChange={(e) => updateProfile("business_line", e.target.value)} rows={3} />
                  </label>
                  <label>
                    Lao động
                    <input type="number" min="0" value={profile.employees} onChange={(e) => updateProfile("employees", Number(e.target.value))} />
                  </label>
                  <label>
                    Doanh thu (tỷ VNĐ)
                    <input type="number" min="0" value={profile.revenue_bil} onChange={(e) => updateProfile("revenue_bil", Number(e.target.value))} />
                  </label>
                  <label>
                    Vốn (tỷ VNĐ)
                    <input type="number" min="0" value={profile.capital_bil} onChange={(e) => updateProfile("capital_bil", Number(e.target.value))} />
                  </label>
                  <label className="toggle-field">
                    <span>
                      <strong>Startup đổi mới sáng tạo</strong>
                      <small>Dùng để đối chiếu điều kiện chương trình</small>
                    </span>
                    <input type="checkbox" checked={profile.startup_innovation} onChange={(e) => updateProfile("startup_innovation", e.target.checked)} />
                  </label>
                </div>

                <button className="analyze-button" onClick={analyze} disabled={analyzing}>
                  {analyzing ? <><span className="button-spinner" /> Đang đối chiếu chính sách...</> : <>Phân tích và tìm chính sách <span>→</span></>}
                </button>
              </section>
            </div>

            <div className="result-column">
              <section className="result-header">
                <div>
                  <span className="eyebrow">BƯỚC 03</span>
                  <h2>Kết quả đề xuất</h2>
                </div>
                {results.length > 0 && <span>{results.length} chính sách</span>}
              </section>

              {results.length === 0 ? (
                <div className="empty-results">
                  <div className="compass-shape"><span>✦</span></div>
                  <h3>Sẵn sàng tìm lộ trình phù hợp</h3>
                  <p>Hoàn thiện hồ sơ bên trái và bắt đầu phân tích. Kết quả sẽ được xếp hạng theo mức độ phù hợp.</p>
                  <div className="empty-steps">
                    <span>01 · Đối chiếu lĩnh vực</span>
                    <span>02 · Kiểm tra phạm vi</span>
                    <span>03 · Xác định điều kiện</span>
                  </div>
                </div>
              ) : (
                <div className="results-list">
                  {results.map((policy, index) => (
                    <article className="policy-card" key={policy.id}>
                      <div className="policy-rank">{String(index + 1).padStart(2, "0")}</div>
                      <ScoreRing score={policy.score} />
                      <div className="policy-body">
                        <div className="policy-meta">
                          <span>{policy.program}</span>
                          <span className={`badge ${matchTone(policy.match_level)}`}>{policy.match_level}</span>
                        </div>
                        <h3>{policy.title}</h3>
                        <p>{policy.summary}</p>
                        <div className="reason-row">
                          {policy.reasons.slice(0, 2).map((reason) => <span key={reason}>✓ {reason}</span>)}
                        </div>
                        <div className="policy-footer">
                          <span>{policy.scope}</span>
                          <span>{policy.citations.length} nguồn dẫn</span>
                          <span>{policy.checklist.length} mục hồ sơ</span>
                          <button onClick={() => setSelectedPolicy(policy)}>Xem chi tiết →</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {view === "qa" && (
          <section className="qa-layout">
            {/* Cột trái (0.62fr): Chỉ chứa Câu hỏi vàng */}
            <div className="panel-card">
              <div className="section-heading compact">
                <div>
                  <span className="eyebrow">RAG DEMO</span>
                  <h3>Câu hỏi vàng</h3>
                </div>
                <span className="privacy-badge">{goldenQuestions.length}/10</span>
              </div>
              <div className="question-bank">
                {goldenQuestions.map((item) => (
                  <button key={item} className={question === item ? "selected" : ""} onClick={() => ask(item)} disabled={answerLoading}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Cột phải (1.38fr): Chứa Chat ở trên và Crawler ở dưới */}
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Chat Panel (Trò chuyện tư vấn) */}
              <section className="panel-card" style={{ display: "flex", flexDirection: "column", height: "550px", paddingBottom: "15px" }}>
                <div className="section-heading compact" style={{ flexShrink: 0 }}>
                  <div>
                    <span className="eyebrow">BƯỚC 02 · TRÒ CHUYỆN TƯ VẤN</span>
                    <h3>Trò chuyện tư vấn</h3>
                  </div>
                </div>
                
                <div style={{
                  background: profile.name ? "#f0f9ff" : "#f1f5f9",
                  border: profile.name ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  color: profile.name ? "#0369a1" : "#475569",
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "500",
                  flexShrink: 0
                }}>
                  <span style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: profile.name ? "#0284c7" : "#64748b",
                    display: "inline-block"
                  }} />
                  {profile.name ? (
                    <span>
                      Bối cảnh tư vấn: <strong>{profile.name}</strong> ({sme.size} · {profile.province})
                    </span>
                  ) : (
                    <span>Chưa chọn hồ sơ doanh nghiệp (Tư vấn vãng lai)</span>
                  )}
                </div>

                {/* Chat Message Box */}
                <div style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "10px 4px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                  marginBottom: "16px"
                }}>
                  {chatHistory.length === 0 ? (
                    <div className="empty-hint" style={{ textAlign: "center", padding: "60px 20px" }}>
                      👋 Xin chào! Hãy đặt câu hỏi ở thanh chat bên dưới hoặc chọn một câu hỏi vàng ở cột bên trái để bắt đầu cuộc trò chuyện.
                    </div>
                  ) : (
                    chatHistory.map((msg) => (
                      <div 
                        key={msg.id} 
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: msg.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "100%"
                        }}
                      >
                        <div style={{
                          background: msg.role === "user" ? "#0f766e" : "#f8fafc",
                          color: msg.role === "user" ? "#ffffff" : "#0f172a",
                          border: msg.role === "user" ? "none" : "1px solid #e2e8f0",
                          padding: "12px 16px",
                          borderRadius: "14px",
                          borderTopRightRadius: msg.role === "user" ? "2px" : "14px",
                          borderTopLeftRadius: msg.role === "user" ? "14px" : "2px",
                          fontSize: "0.85rem",
                          lineHeight: "1.6",
                          maxWidth: "80%",
                          whiteSpace: "pre-line",
                          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)"
                        }}>
                          {msg.text}
                        </div>
                        
                        {msg.citations && msg.citations.length > 0 && (
                          <div style={{ 
                            alignSelf: "stretch", 
                            marginTop: "8px", 
                            display: "flex", 
                            flexDirection: "column", 
                            gap: "6px",
                            maxWidth: "80%",
                            paddingLeft: "8px"
                          }}>
                            <span style={{ fontSize: "0.7rem", fontWeight: "600", color: "#64748b" }}>Nguồn dẫn pháp lý:</span>
                            {msg.citations.map((c, i) => (
                              <a 
                                href={c.source} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                key={i}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  background: "#f1f5f9",
                                  padding: "6px 10px",
                                  borderRadius: "6px",
                                  fontSize: "0.75rem",
                                  color: "#0f766e",
                                  textDecoration: "none",
                                  border: "1px solid #e2e8f0"
                                }}
                              >
                                <span style={{ fontSize: "0.8rem", color: "#0d9488" }}>§</span>
                                <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.document} ({c.clause})
                                </strong>
                                <span style={{ color: "#94a3b8" }}>↗</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  
                  {answerLoading && (
                    <div style={{ display: "flex", alignItems: "flex-start", maxWidth: "80%" }}>
                      <div style={{
                        background: "#f1f5f9",
                        border: "1px solid #e2e8f0",
                        padding: "12px 16px",
                        borderRadius: "14px",
                        borderTopLeftRadius: "2px",
                        fontSize: "0.85rem",
                        color: "#64748b"
                      }}>
                        <span className="button-spinner" style={{ marginRight: "8px", display: "inline-block" }} /> 
                        AI đang phân tích corpus và trả lời...
                      </div>
                    </div>
                  )}
                  
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input Bar */}
                <div className="ask-bar" style={{ flexShrink: 0, marginTop: "auto", marginBottom: 0 }}>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && !answerLoading && ask(question)}
                    placeholder="Nhập câu hỏi của bạn tại đây..."
                    disabled={answerLoading}
                  />
                  <button onClick={() => ask(question)} disabled={answerLoading}>
                    Gửi →
                  </button>
                </div>
              </section>

              {/* Crawler Panel (Cập nhật chính sách) */}
              <div className="panel-card" style={{ padding: "18px 24px" }}>
                <div className="section-heading compact">
                  <div>
                    <span className="eyebrow">DỮ LIỆU THỜI GIAN THỰC</span>
                    <h3>Cập nhật chính sách trực tuyến (Crawler)</h3>
                  </div>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "6px 0 14px 0", lineHeight: "1.4" }}>
                  Mô phỏng robot quét công báo chính phủ để tự động cập nhật nghị quyết mới nhất vào cơ sở dữ liệu RAG.
                </p>
                
                {crawlStatus === "idle" && (
                  <button 
                    onClick={startCrawl}
                    style={{
                      width: "100%",
                      background: "#0d9488",
                      color: "white",
                      border: "none",
                      padding: "10px",
                      borderRadius: "8px",
                      fontWeight: "600",
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                  >
                    ⚡ Chạy Quét Chính Sách Mới
                  </button>
                )}

                {crawlStatus === "running" && (
                  <div style={{ fontSize: "0.75rem", color: "#0f766e", background: "#f0fdf4", padding: "10px", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="button-spinner" />
                      <strong>{crawlStep}</strong>
                    </div>
                  </div>
                )}

                {crawlStatus === "success" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ fontSize: "0.75rem", color: "#166534", background: "#f0fdf4", padding: "10px 14px", borderRadius: "8px", border: "1px solid #bbf7d0", lineHeight: "1.5" }}>
                      🎉 <strong>Đã tự động quét và cập nhật 3 chính sách mới vào RAG database:</strong>
                      <ul style={{ margin: "5px 0 0 15px", padding: 0 }}>
                        <li>Nghị quyết 12/2026/NQ-HĐND Hà Nội (Hỗ trợ 100% phí chuyển đổi số cho Startup)</li>
                        <li>Quyết định 456/QĐ-BTTTT (Hỗ trợ 50% chi phí kiểm thử, thử nghiệm AI và IoT)</li>
                        <li>Nghị định 99/2026/NĐ-CP (Miễn thuế TNDN 2 năm đầu cho Startup đổi mới sáng tạo)</li>
                      </ul>
                    </div>
                    
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <button 
                          onClick={() => ask("Nghị quyết 12/2026/NQ-HĐND Hà Nội hỗ trợ chuyển đổi số cho startup thế nào?")}
                          className="secondary-button"
                          style={{ padding: "6px 10px", fontSize: "0.7rem", height: "auto" }}
                        >
                          Hỏi về Nghị quyết 12 (CĐS) →
                        </button>
                        <button 
                          onClick={() => ask("Quyết định 456/QĐ-BTTTT hỗ trợ kiểm thử AI và IoT cho startup thế nào?")}
                          className="secondary-button"
                          style={{ padding: "6px 10px", fontSize: "0.7rem", height: "auto" }}
                        >
                          Hỏi về Quyết định 456 (AI/IoT) →
                        </button>
                        <button 
                          onClick={() => ask("Nghị định 99/2026/NĐ-CP hỗ trợ miễn thuế thu nhập doanh nghiệp cho startup ra sao?")}
                          className="secondary-button"
                          style={{ padding: "6px 10px", fontSize: "0.7rem", height: "auto" }}
                        >
                          Hỏi về Nghị định 99 (Miễn thuế) →
                        </button>
                      </div>
                      <button 
                        onClick={resetCrawl}
                        style={{
                          background: "transparent",
                          color: "#64748b",
                          border: "1px solid #cbd5e1",
                          padding: "6px 10px",
                          borderRadius: "6px",
                          fontSize: "0.7rem",
                          cursor: "pointer"
                        }}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </section>
      )}

        {view === "updates" && (
          <section className="view-stack">
            <div className="updates-hero">
              <div>
                <span className="eyebrow">POLICY WATCH</span>
                <h2>Theo dõi thay đổi,<br /><em>chủ động chuẩn bị.</em></h2>
                <p>Các tín hiệu chính sách dưới đây được tổng hợp từ nguồn chính thống nhưng vẫn cần được xác minh lại tại nguồn gốc trước khi nộp hồ sơ thật.</p>
              </div>
              <div className="update-counter">
                <strong>{policyWatch.length}</strong>
                <span>tín hiệu đang theo dõi</span>
              </div>
            </div>

            <section className="panel-card timeline-panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">DÒNG THỜI GIAN</span>
                  <h3>Cập nhật chính sách gần đây</h3>
                </div>
              </div>
              <div className="timeline">
                {policyWatch.map((item) => {
                  let status = item.status;
                  if (crawlStatus === "success" && status === "Chờ đồng bộ (Mới)") {
                    status = "Đã đồng bộ vào RAG";
                  }
                  return (
                    <article key={`${item.date}-${item.title}`}>
                      <div className="timeline-date">
                        <strong>{item.date.slice(8, 10)}</strong>
                        <span>THÁNG {item.date.slice(5, 7)}</span>
                      </div>
                      <div className={`timeline-dot ${statusClass(status)}`} />
                      <div className="timeline-content">
                        <div>
                          <span className={`badge ${statusClass(status)}`}>{status}</span>
                          <small>{formatDate(item.date)}</small>
                        </div>
                        <h3>{item.title}</h3>
                        <p>{item.impact}</p>
                        <a href={item.source} target="_blank" rel="noopener noreferrer">Kiểm tra nguồn chính thức →</a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </section>
        )}
      </main>

      {selectedPolicy && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setSelectedPolicy(null);
        }}>
          <section className="policy-modal" role="dialog" aria-modal="true" aria-labelledby="policy-title">
            <button className="modal-close" onClick={() => setSelectedPolicy(null)} aria-label="Đóng chi tiết">×</button>
            <div className="modal-topline">
              <ScoreRing score={selectedPolicy.score} />
              <div>
                <span className="eyebrow">{selectedPolicy.program}</span>
                <h2 id="policy-title">{selectedPolicy.title}</h2>
                <div className="modal-badges">
                  <span className={`badge ${matchTone(selectedPolicy.match_level)}`}>{selectedPolicy.match_level}</span>
                  <span className="badge neutral">{selectedPolicy.scope}</span>
                  <span className="badge neutral">{selectedPolicy.status}</span>
                </div>
              </div>
            </div>

            <p className="modal-summary">{selectedPolicy.summary}</p>

            <div className="modal-actions" style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginBottom: "20px" }}>
              <button 
                onClick={triggerDeepAnalysis}
                disabled={deepAnalysisLoading}
                className="modal-download-button"
                style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", borderColor: "#0284c7" }}
              >
                {deepAnalysisLoading ? "Đang phân tích..." : "✦ Phân tích sâu hơn bằng AI"}
              </button>
              <button className="modal-download-button" onClick={() => downloadDocx(selectedPolicy)} disabled={docxLoading}>
                {docxLoading ? "Đang tạo file..." : "⇩ Xuất đơn .docx"}
              </button>
            </div>

            {deepAnalysis && (
              <div style={{
                background: "#f0f9ff",
                borderLeft: "4px solid #0284c7",
                padding: "16px",
                borderRadius: "6px",
                fontSize: "0.9rem",
                color: "#0369a1",
                lineHeight: "1.5",
                marginBottom: "20px",
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)"
              }}>
                <strong>💡 Phân tích sâu của AI:</strong>
                <p style={{ margin: "6px 0 0 0" }}>{deepAnalysis}</p>
              </div>
            )}

            <div className="modal-grid">
              <div>
                <h3>Lý do phù hợp</h3>
                <ul className="check-list positive">
                  {(selectedPolicy.reasons.length ? selectedPolicy.reasons : ["Chưa có lý do nổi bật trong dữ liệu demo."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Điểm cần xác minh</h3>
                <ul className="check-list caution">
                  {(selectedPolicy.gaps.length ? selectedPolicy.gaps : ["Không có cảnh báo bổ sung trong dữ liệu demo."]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="detail-section">
              <h3>Lợi ích có thể nhận</h3>
              <div className="benefit-grid">
                {selectedPolicy.benefits.map((item, index) => (
                  <div key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></div>
                ))}
              </div>
            </div>

            <div className="detail-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
                <h3 style={{ margin: 0 }}>Checklist hồ sơ</h3>
                
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {uploadedProfileFile && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => runChecklistMatching([uploadedProfileFile])}
                        disabled={checklistMatching}
                        className="modal-download-button"
                        style={{
                          background: "linear-gradient(135deg, #0f766e, #115e59)",
                          borderColor: "#0f766e",
                          padding: "6px 12px",
                          fontSize: "0.8rem",
                          color: "#fff",
                          margin: 0
                        }}
                      >
                        {checklistMatching ? "⏳ Đang đối chiếu..." : "✦ Đối chiếu nhanh bằng hồ sơ đã tải"}
                      </button>
                      <span style={{ fontSize: "0.75rem", color: "#64748b", fontStyle: "italic" }} title={uploadedProfileFile.name}>
                        📄 {uploadedProfileFile.name.length > 25 ? uploadedProfileFile.name.slice(0, 22) + "..." : uploadedProfileFile.name}
                      </span>
                    </div>
                  )}
                  
                  <label style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "6px 12px",
                    borderRadius: "6px",
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.8rem",
                    fontWeight: "600",
                    color: "#475569",
                    cursor: checklistMatching ? "not-allowed" : "pointer",
                    margin: 0
                  }}>
                    <input 
                      type="file" 
                      multiple 
                      accept=".txt,.pdf,image/*"
                      onChange={handleChecklistUpload} 
                      disabled={checklistMatching} 
                      style={{ display: "none" }} 
                    />
                    {checklistMatching ? "⏳ Đang đối chiếu..." : "⇪ Tải tài liệu khác để đối chiếu"}
                  </label>
                </div>
              </div>

              {checklistResults && (
                <div style={{
                  background: "#fdf2f8",
                  border: "1px solid #fbcfe8",
                  color: "#be185d",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  fontSize: "0.8rem",
                  marginBottom: "16px",
                  fontWeight: "500"
                }}>
                  📢 <strong>Kết quả AI đối chiếu hồ sơ:</strong> Đã phân tích ảnh tài liệu bạn nộp đối khớp với checklist bên dưới.
                </div>
              )}

              <ol className="document-list">
                {selectedPolicy.checklist.map((item) => {
                  const match = checklistResults?.[item];
                  return (
                    <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}>
                      {match ? (
                        <>
                          <span style={{ 
                            fontWeight: "bold",
                            color: match.status === "✓ đã có" ? "#22c55e" : match.status === "✗ thiếu" ? "#ef4444" : "#eab308" 
                          }}>
                            {match.status}
                          </span>
                          <div>
                            <span style={{ fontWeight: "500" }}>{item}</span>
                            <small style={{ display: "block", color: "#64748b", marginTop: "2px", fontSize: "0.75rem" }}>
                              {match.comment}
                            </small>
                          </div>
                        </>
                      ) : (
                        <>
                          <span>□</span>
                          <span>{item}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="detail-section citation-section">
              <h3>Nguồn pháp lý</h3>
              {selectedPolicy.citations.map((citation) => (
                <a href={citation.source} target="_blank" rel="noopener noreferrer" key={`${citation.document}-${citation.clause}`}>
                  <span className="source-icon">§</span>
                  <span><strong>{citation.document}</strong><small>{citation.clause} · {citation.status}</small></span>
                  <b>↗</b>
                </a>
              ))}
            </div>

            <div className="legal-note">
              <strong>Lưu ý:</strong> Kết quả được tạo từ tập dữ liệu demo, không thay thế tư vấn pháp lý. Vui lòng kiểm tra văn bản gốc
              trước khi chuẩn bị hồ sơ thật.
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setSettingsOpen(false);
        }}>
          <section className="policy-modal" role="dialog" aria-modal="true" style={{ maxWidth: "500px" }}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)}>×</button>
            <div style={{ marginBottom: "20px" }}>
              <span className="eyebrow" style={{ color: "#0d9488", display: "block", marginBottom: "4px" }}>CÀI ĐẶT AI</span>
              <h2 style={{ fontSize: "1.5rem", fontWeight: "600", margin: 0, fontFamily: "var(--font-serif)", letterSpacing: "-0.02em", lineHeight: "1.2" }}>Chọn nhà cung cấp &amp; API key</h2>
            </div>
            
            <div style={{
              background: "#f0fdfa",
              borderLeft: "4px solid #0d9488",
              padding: "14px",
              borderRadius: "4px",
              fontSize: "0.85rem",
              color: "#0f766e",
              marginBottom: "16px",
              lineHeight: "1.4"
            }}>
              Nhập API key của bạn để Hỏi đáp pháp lý dùng nhà cung cấp bạn chọn thay vì cấu hình mặc định của máy chủ. Key chỉ lưu trên trình duyệt này (localStorage) và chỉ được gửi kèm khi bạn gọi Hỏi đáp — không lưu trên máy chủ.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", fontWeight: "600", color: "#374151" }}>
                Nhà cung cấp
                <select 
                  value={aiProvider} 
                  onChange={(e) => {
                    const provider = e.target.value;
                    setAiProvider(provider);
                    if (provider === "Google Gemini") {
                      setAiModel("gemini-2.5-flash");
                    } else if (provider === "OpenAI") {
                      setAiModel("gpt-4o-mini");
                    } else if (provider === "Anthropic") {
                      setAiModel("claude-sonnet-4-5");
                    } else if (provider === "xAI Grok") {
                      setAiModel("grok-4-fast");
                    } else if (provider === "FPT AI") {
                      setAiModel("DeepSeek-V4-Flash");
                    }
                  }}
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.9rem" }}
                >
                  <option value="Google Gemini">Google Gemini</option>
                  <option value="OpenAI">OpenAI</option>
                  <option value="Anthropic">Anthropic</option>
                  <option value="xAI Grok">xAI Grok</option>
                  <option value="FPT AI">FPT AI Marketplace</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", fontWeight: "600", color: "#374151" }}>
                API key
                <input 
                  type="password" 
                  value={aiApiKey} 
                  onChange={(e) => setAiApiKey(e.target.value)}
                  placeholder="Nhập khóa API key..."
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.9rem" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.85rem", fontWeight: "600", color: "#374151" }}>
                Model
                <input 
                  type="text" 
                  value={aiModel} 
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="gemini-flash-latest"
                  style={{ padding: "8px 12px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "0.9rem" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button 
                onClick={() => setSettingsOpen(false)}
                className="secondary-button"
                style={{ height: "36px", padding: "0 16px" }}
              >
                Hủy
              </button>
              <button 
                onClick={saveSettings}
                className="primary-button"
                style={{ height: "36px", padding: "0 16px", backgroundColor: "#0d9488" }}
              >
                Lưu cấu hình
              </button>
            </div>
            
            <div style={{
              background: "#fffbeb",
              border: "1px solid #fef3c7",
              color: "#92400e",
              fontSize: "0.75rem",
              padding: "8px 12px",
              borderRadius: "6px",
              marginTop: "16px",
              lineHeight: "1.4"
            }}>
              <strong>Lưu ý:</strong> Không chia sẻ máy này nếu bạn không muốn người khác thấy key đã lưu. Bỏ trống API key rồi lưu để quay lại dùng cấu hình mặc định của máy chủ (nếu quản trị viên đã cấu hình sẵn).
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
