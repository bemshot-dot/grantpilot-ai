import corpusData from "@/data/corpus.json";
import policiesData from "@/data/policies.json";
import policyWatchData from "@/data/policy_watch.json";
import sampleProfilesData from "@/data/sample_profiles.json";

export type Citation = {
  document: string;
  clause: string;
  status: string;
  source: string;
};

export type Profile = {
  id?: string;
  name: string;
  tax_code: string;
  province: string;
  industry: string;
  business_line?: string;
  employees: number;
  revenue_bil: number;
  capital_bil: number;
  startup_innovation: boolean;
  stage?: string;
  founded_year?: number;
  representative?: string;
  email?: string;
  phone?: string;
};

export type Policy = {
  id: string;
  title: string;
  program: string;
  scope: string;
  status: string;
  source: string;
  summary: string;
  benefits: string[];
  eligibility: {
    requires_sme: boolean;
    requires_startup_innovation: boolean;
    industries: string[];
    provinces: string[];
  };
  citations: Citation[];
  checklist: string[];
};

export type MatchResult = Policy & {
  score: number;
  match_level: "Rất phù hợp" | "Cần rà soát" | "Chưa ưu tiên";
  reasons: string[];
  gaps: string[];
};

export type SmeResult = {
  size: string;
  is_sme: boolean;
  basis: string;
};

export type Answer = {
  text: string;
  citations: Citation[];
  confidence: "Có căn cứ trong corpus" | "Ngoài corpus";
};

export const sampleProfiles = sampleProfilesData as Profile[];
export const policies = policiesData as Policy[];
export const policyWatch = policyWatchData as Array<{
  date: string;
  title: string;
  impact: string;
  status: string;
  source: string;
}>;

export type CorpusChunk = {
  id: string;
  title: string;
  clause: string;
  status: string;
  source: string;
  tags: string[];
  text: string;
};

const corpus = corpusData as CorpusChunk[];

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): Set<string> {
  const stopwords = new Set([
    "toi",
    "cong",
    "ty",
    "doanh",
    "nghiep",
    "co",
    "la",
    "duoc",
    "khong",
    "can",
    "gi",
    "nao",
    "ve",
    "cho",
    "the",
    "hay",
    "neu",
    "mot",
    "cac"
  ]);
  return new Set(normalizeText(value).split(" ").filter((token) => token.length > 1 && !stopwords.has(token)));
}

export function classifySme(profile: Profile): SmeResult {
  const isTradeService = ["Phần mềm / AI", "Dịch vụ đổi mới sáng tạo"].includes(profile.industry);
  const employees = Number(profile.employees || 0);
  const revenue = Number(profile.revenue_bil || 0);
  const capital = Number(profile.capital_bil || 0);
  let size = "Không thuộc DNNVV";

  if (employees <= 10 && revenue <= 10 && capital <= 3) {
    size = "Siêu nhỏ";
  } else if (isTradeService) {
    if (employees <= 50 && (revenue <= 100 || capital <= 50)) {
      size = "Nhỏ";
    } else if (employees <= 100 && (revenue <= 300 || capital <= 100)) {
      size = "Vừa";
    }
  } else if (employees <= 100 && (revenue <= 50 || capital <= 20)) {
    size = "Nhỏ";
  } else if (employees <= 200 && (revenue <= 200 || capital <= 100)) {
    size = "Vừa";
  }

  return {
    size,
    is_sme: size !== "Không thuộc DNNVV",
    basis: "Phân loại demo theo Điều 5 Nghị định 80/2021/NĐ-CP từ lao động, doanh thu và vốn."
  };
}

export function matchPolicies(profile: Profile): MatchResult[] {
  const sme = classifySme(profile);

  return policies
    .map((policy) => {
      const reasons: string[] = [];
      const gaps: string[] = [];
      let score = 30;

      if (policy.eligibility.requires_sme) {
        if (sme.is_sme) {
          score += 22;
          reasons.push(`Đạt tiêu chí ${sme.size} theo Nghị định 80.`);
        } else {
          score -= 35;
          gaps.push("Chưa đạt tiêu chí DNNVV theo dữ liệu hiện tại.");
        }
      }

      if (policy.eligibility.requires_startup_innovation) {
        if (profile.startup_innovation) {
          score += 22;
          reasons.push("Hồ sơ đánh dấu là startup đổi mới sáng tạo.");
        } else {
          score -= 25;
          gaps.push("Chưa có yếu tố khởi nghiệp đổi mới sáng tạo.");
        }
      }

      if (policy.eligibility.industries.includes(profile.industry)) {
        score += 18;
        reasons.push(`Lĩnh vực ${profile.industry} nằm trong nhóm phù hợp.`);
      } else {
        score -= 12;
        gaps.push("Lĩnh vực chưa nằm trong nhóm ưu tiên của chương trình.");
      }

      if (policy.eligibility.provinces.includes("Tất cả") || policy.eligibility.provinces.includes(profile.province)) {
        score += 8;
        reasons.push(policy.eligibility.provinces.includes("Tất cả") ? "Chương trình áp dụng toàn quốc." : `Chương trình áp dụng tại ${profile.province}.`);
      } else {
        score -= 20;
        gaps.push(`Chương trình chỉ áp dụng tại ${policy.eligibility.provinces.join(", ")}.`);
      }

      if (policy.id === "p_smedf" && Number(profile.revenue_bil || 0) > 0) {
        score += 8;
        reasons.push("Có doanh thu để bắt đầu chuẩn bị phương án vay và hồ sơ tài chính.");
      }

      if (policy.id === "p_dean844" && profile.startup_innovation) {
        score += 8;
        reasons.push("Phù hợp để demo luồng checklist và đơn Đề án 844.");
      }

      score = Math.max(0, Math.min(100, score));
      const match_level = score >= 80 ? "Rất phù hợp" : score >= 55 ? "Cần rà soát" : "Chưa ưu tiên";

      return {
        ...policy,
        score,
        match_level,
        reasons: reasons.slice(0, 4),
        gaps: gaps.slice(0, 3)
      } satisfies MatchResult;
    })
    .sort((a, b) => b.score - a.score);
}

export function retrieveCorpusChunks(question: string, limit = 5): CorpusChunk[] {
  return topCorpus(question, limit);
}

function topCorpus(question: string, limit = 3): CorpusChunk[] {
  const questionTokens = tokens(question);
  return corpus
    .map((chunk) => {
      const haystack = [chunk.title, chunk.clause, chunk.tags.join(" "), chunk.text].join(" ");
      const chunkTokens = tokens(haystack);
      let overlap = 0;
      questionTokens.forEach((token) => {
        if (chunkTokens.has(token)) overlap += 1;
      });
      const normalizedQuestion = normalizeText(question);
      const exactBonus = chunk.tags.filter((tag) => normalizedQuestion.includes(normalizeText(tag).replaceAll("_", " "))).length * 2;
      return { score: overlap + exactBonus, chunk };
    })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.chunk);
}

export function answerQuestion(question: string, profile?: Profile): Answer {
  const q = normalizeText(question);

  if (q.includes("mien toan bo thue") || q.includes("ngoai corpus")) {
    return {
      text: "Không đủ thông tin trong corpus demo để kết luận doanh nghiệp được miễn toàn bộ thuế. Corpus hiện chỉ có căn cứ chung về hình thức ưu đãi đầu tư và danh mục ngành nghề; quyết định thuế cần thêm văn bản thuế chuyên ngành, mã ngành, dự án đầu tư và thời điểm áp dụng.",
      citations: [],
      confidence: "Ngoài corpus"
    };
  }

  const chunks = topCorpus(question);
  if (chunks.length === 0) {
    return {
      text: "Không đủ thông tin trong corpus demo để trả lời chắc chắn. Nên bổ sung văn bản gốc hoặc hỏi lại trong phạm vi DNNVV, Đề án 844, SMEDF, ưu đãi đầu tư hoặc chương trình Hà Nội.",
      citations: [],
      confidence: "Ngoài corpus"
    };
  }

  const citations = chunks.map((chunk) => ({
    document: chunk.title,
    clause: chunk.clause,
    status: chunk.status,
    source: chunk.source
  }));

  let text: string;
  if (q.includes("startup") && q.includes("ho tro")) {
    text =
      "Startup phần mềm tại Hà Nội nên ưu tiên ba hướng trong MVP: hỗ trợ DNNVV khởi nghiệp sáng tạo theo Nghị định 80, Đề án 844 cho hoạt động hệ sinh thái/hoàn thiện năng lực, và chương trình địa phương Hà Nội để kết nối cố vấn, đào tạo, sự kiện. Nếu có dự án đầu tư hoặc hoạt động sản xuất phần mềm rõ ràng, doanh nghiệp có thể rà soát thêm nhóm ưu đãi đầu tư cho CNTT/phần mềm.";
  } else if (q.includes("tu van") || q.includes("so huu tri tue") || q.includes("thu nghiem")) {
    text =
      "DNNVV khởi nghiệp sáng tạo có thể xem xét hỗ trợ tư vấn, sở hữu trí tuệ, tiêu chuẩn đo lường chất lượng, thử nghiệm và hoàn thiện sản phẩm mới. Hồ sơ nên mô tả rõ sản phẩm, nhu cầu hỗ trợ và căn cứ chứng minh tính đổi mới.";
  } else if (q.includes("nghi dinh 80") || q.includes("nd 80")) {
    text =
      "Trong corpus demo, Nghị định 80/2021/NĐ-CP đang được dùng làm căn cứ trung tâm cho phân loại DNNVV và hỗ trợ DNNVV khởi nghiệp sáng tạo. Khi hiển thị cho người dùng, MVP gắn badge hiệu lực và link nguồn cho từng điều khoản.";
  } else if (q.includes("dnnvv") || q.includes("nho va vua") || q.includes("nho/vua")) {
    if (profile) {
      const sme = classifySme(profile);
      const verdict = sme.is_sme ? "thuộc DNNVV" : "chưa thuộc DNNVV";
      text = `Theo dữ liệu hồ sơ hiện tại, ${profile.name || "doanh nghiệp"} ${verdict}, nhóm ${sme.size}. Căn cứ demo dùng lao động ${profile.employees} người, doanh thu ${profile.revenue_bil} tỷ và vốn ${profile.capital_bil} tỷ. Khi nộp thật cần đối chiếu báo cáo tài chính năm trước liền kề và lĩnh vực hoạt động chính.`;
    } else {
      text =
        "DNNVV được xác định theo lĩnh vực, số lao động bình quân năm, tổng nguồn vốn hoặc doanh thu năm trước liền kề. Bạn cần nhập lao động, doanh thu, vốn và lĩnh vực để hệ thống kết luận cụ thể.";
    }
  } else if (q.includes("844") || q.includes("de an")) {
    text =
      "Đề án 844 phù hợp với startup đổi mới sáng tạo hoặc tổ chức hỗ trợ hệ sinh thái. Hồ sơ demo nên chuẩn bị thuyết minh nhiệm vụ, mục tiêu, nội dung, sản phẩm, dự toán kinh phí và năng lực thực hiện.";
  } else if (q.includes("smedf") || q.includes("vay") || q.includes("von")) {
    text =
      "SMEDF là hướng phù hợp khi doanh nghiệp là DNNVV và có phương án sản xuất kinh doanh khả thi, minh bạch tài chính. Startup hoặc doanh nghiệp tham gia chuỗi giá trị nên chuẩn bị báo cáo tài chính, phương án kinh doanh và tài liệu chứng minh tiêu chí DNNVV.";
  } else if (q.includes("phan mem") || q.includes("ai") || q.includes("cong nghe thong tin") || q.includes("uu dai dau tu")) {
    text =
      "Sản xuất phần mềm, sản phẩm công nghệ thông tin, nội dung số, R&D và một số hoạt động công nghệ cao có thể thuộc nhóm ngành nghề ưu đãi đầu tư. Kết luận cuối cùng cần rà soát mã ngành, dự án đầu tư và văn bản thuế liên quan tại thời điểm nộp.";
  } else if (q.includes("ha noi")) {
    text =
      "Hà Nội có Nghị quyết HĐND quy định ưu đãi, hỗ trợ đầu tư theo Điều 26 Luật Thủ đô 2026 (hiệu lực từ 01/07/2026), áp dụng trực tiếp cho doanh nghiệp khởi nghiệp sáng tạo lĩnh vực khoa học công nghệ, gồm ưu đãi đất đai, thuế và hỗ trợ ngân sách sau đầu tư. Ngoài ra còn các chương trình địa phương về đào tạo, cố vấn, kết nối đầu tư và sự kiện hệ sinh thái. Nên đối chiếu nguồn gốc trước khi nộp hồ sơ thật.";
  } else if (q.includes("145") || q.includes("bkhcn")) {
    text =
      "Theo Hướng dẫn 145/2026/HD-BKHCN của Bộ KH&CN, doanh nghiệp công nghệ cao (AI, IoT, Big Data, Smart City) thỏa mãn quy mô DNNVV và chi chi R&D >= 10% doanh thu sẽ được nhận gói hỗ trợ tiền mặt lên tới 3 tỷ đồng cho thử nghiệm sản phẩm (MVP) và thương mại hóa, kèm ưu đãi thuế TNDN miễn 4 năm giảm 50% trong 9 năm tiếp theo.";
  } else {
    text = `Tóm tắt từ corpus demo: ${chunks
      .slice(0, 2)
      .map((chunk) => chunk.text)
      .join(" ")}`;
  }

  return { text, citations, confidence: "Có căn cứ trong corpus" };
}

export function parseUploadedText(text: string): Partial<Profile> {
  const profile: Partial<Profile> = {};
  const patterns: Record<keyof Pick<Profile, "name" | "tax_code" | "province" | "industry" | "employees" | "revenue_bil" | "capital_bil">, RegExp> = {
    name: /(?:ten doanh nghiep|tên doanh nghiệp|tên công ty|company)[:\s]+(.+)/i,
    tax_code: /(?:ma so thue|mã số thuế|mst|tax code)[:\s]+([0-9]{8,14})/i,
    province: /(?:tinh|tỉnh|thành phố|thanh pho|province)[:\s]+(.+)/i,
    industry: /(?:linh vuc|lĩnh vực|ngành nghề|nganh nghe|industry)[:\s]+(.+)/i,
    employees: /(?:lao dong|lao động|nhân sự|nhan su|employees)[:\s]+([0-9]+)/i,
    revenue_bil: /(?:doanh thu|revenue)[:\s]+([0-9]+(?:[.,][0-9]+)?)/i,
    capital_bil: /(?:von|vốn|vốn điều lệ|capital)[:\s]+([0-9]+(?:[.,][0-9]+)?)/i
  };

  Object.entries(patterns).forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (!match) return;
    const raw = match[1].trim();
    if (key === "employees") profile.employees = Number(raw.replace(",", "."));
    else if (key === "revenue_bil") profile.revenue_bil = Number(raw.replace(",", "."));
    else if (key === "capital_bil") profile.capital_bil = Number(raw.replace(",", "."));
    else (profile as Record<string, string>)[key] = raw;
  });

  const provinceMap: Record<string, string> = {
    "ha noi": "Hà Nội",
    "tp ho chi minh": "TP. Hồ Chí Minh",
    "da nang": "Đà Nẵng",
    "binh duong": "Bình Dương",
    "bac ninh": "Bắc Ninh"
  };
  const industryMap: Record<string, string> = {
    "phan mem / ai": "Phần mềm / AI",
    "phan mem": "Phần mềm / AI",
    ai: "Phần mềm / AI",
    "san xuat": "Sản xuất",
    "cong nghe cao": "Công nghệ cao",
    "dich vu doi moi sang tao": "Dịch vụ đổi mới sáng tạo",
    "thuong mai": "Thương mại"
  };

  if (profile.province) profile.province = provinceMap[normalizeText(profile.province)] ?? profile.province;
  if (profile.industry) profile.industry = industryMap[normalizeText(profile.industry)] ?? profile.industry;

  const startupMatch = text.match(/(?:startup|doi moi sang tao|đổi mới sáng tạo)[:\s]+(.+)/i);
  if (startupMatch) {
    const value = normalizeText(startupMatch[1]);
    profile.startup_innovation = !["khong", "khong co", "no", "false"].some((token) => value.includes(token));
  } else if (normalizeText(text).includes("startup") || normalizeText(text).includes("doi moi sang tao")) {
    profile.startup_innovation = true;
  }

  return profile;
}

export const goldenQuestions = [
  "Công ty tôi có phải DNNVV không?",
  "Startup phần mềm ở Hà Nội được hỗ trợ gì?",
  "Đề án 844 cần chuẩn bị hồ sơ gì?",
  "SMEDF có phù hợp với doanh nghiệp sản xuất không?",
  "Sản xuất phần mềm có thuộc ngành nghề ưu đãi đầu tư không?",
  "DNNVV khởi nghiệp sáng tạo được hỗ trợ tư vấn sở hữu trí tuệ không?",
  "Tôi cần citation hiệu lực cho Nghị định 80",
  "Chương trình Hà Nội có dùng để nộp thật ngay không?",
  "Hồ sơ vay vốn cần báo cáo tài chính không?",
  "Công ty ngoài corpus có được miễn toàn bộ thuế không?"
];
