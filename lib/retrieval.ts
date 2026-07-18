import "server-only";
import fs from "fs";
import path from "path";

import { GoogleGenAI } from "@google/genai";

import corpusData from "@/data/corpus.json";
import embeddingsData from "@/data/corpus_embeddings.json";
import { normalizeText, type CorpusChunk } from "@/lib/grantpilot";

function getCorpus(): CorpusChunk[] {
  try {
    const corpusPath = path.join(process.cwd(), "data", "corpus.json");
    if (fs.existsSync(corpusPath)) {
      return JSON.parse(fs.readFileSync(corpusPath, "utf8")) as CorpusChunk[];
    }
  } catch (e) {
    console.error("Lỗi đọc corpus.json động:", e);
  }
  return corpusData as CorpusChunk[];
}

const embeddings = embeddingsData as { model: string; dimensions: number; chunks: { id: string; embedding: number[] }[] };
const embeddingById = new Map(embeddings.chunks.map((item) => [item.id, item.embedding]));

const STOPWORDS = new Set([
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

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function chunkHaystack(chunk: CorpusChunk): string {
  return [chunk.title, chunk.clause, chunk.tags.join(" "), chunk.text].join(" ");
}

// BM25 (Okapi), k1=1.5, b=0.75 — standard defaults, tuned for short legal-clause chunks.
function bm25Rank(query: string): Map<string, number> {
  const k1 = 1.5;
  const b = 0.75;
  const queryTokens = tokenize(query);
  const corpus = getCorpus();
  const docs = corpus.map((chunk) => ({ id: chunk.id, tokens: tokenize(chunkHaystack(chunk)) }));
  const N = docs.length;
  const avgdl = docs.reduce((sum, d) => sum + d.tokens.length, 0) / Math.max(N, 1);

  const df = new Map<string, number>();
  for (const term of new Set(queryTokens)) {
    let count = 0;
    for (const doc of docs) if (doc.tokens.includes(term)) count += 1;
    df.set(term, count);
  }

  const scores = new Map<string, number>();
  for (const doc of docs) {
    let score = 0;
    const dl = doc.tokens.length || 1;
    for (const term of queryTokens) {
      const n = df.get(term) ?? 0;
      if (n === 0) continue;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const f = doc.tokens.filter((t) => t === term).length;
      if (f === 0) continue;
      score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl));
    }
    if (score > 0) scores.set(doc.id, score);
  }
  return scores;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function denseRank(query: string, apiKey: string): Promise<Map<string, number>> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: embeddings.model || "gemini-embedding-001",
    contents: query
  });
  const queryVector = response.embeddings?.[0]?.values;
  const scores = new Map<string, number>();
  if (!queryVector) return scores;

  const corpus = getCorpus();
  for (const chunk of corpus) {
    const vector = embeddingById.get(chunk.id);
    if (!vector) continue;
    scores.set(chunk.id, cosineSimilarity(queryVector, vector));
  }
  return scores;
}

// Reciprocal Rank Fusion: combines multiple ranked lists into one, robust to
// each ranker's score scale being incomparable (BM25 scores and cosine
// similarity are not on the same scale, so we fuse by rank position, not score).
function reciprocalRankFusion(rankLists: Map<string, number>[], k = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranks of rankLists) {
    const sorted = [...ranks.entries()].sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id], index) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return fused;
}

export type RetrievalResult = {
  chunks: CorpusChunk[];
  mode: "hybrid" | "bm25_only";
};

// Hybrid retrieval: BM25 (exact/keyword match — strong for legal doc numbers
// like "NĐ 80/2021", "khoản 2 điều 12") + dense embedding similarity (semantic
// match — catches paraphrases/synonyms BM25 misses), fused with RRF.
// Falls back to BM25-only if embeddings are unavailable (missing API key,
// stale/incomplete data/corpus_embeddings.json, or a network error).
export async function hybridRetrieve(query: string, limit = 5): Promise<RetrievalResult> {
  const bm25Scores = bm25Rank(query);
  const apiKey = process.env.GEMINI_API_KEY;

  let fused = bm25Scores;
  let mode: RetrievalResult["mode"] = "bm25_only";

  if (apiKey && embeddingById.size > 0) {
    try {
      const dense = await denseRank(query, apiKey);
      if (dense.size > 0) {
        fused = reciprocalRankFusion([bm25Scores, dense]);
        mode = "hybrid";
      }
    } catch (error) {
      console.error("Dense retrieval thất bại, dùng BM25-only:", error);
    }
  }

  const corpus = getCorpus();
  const byId = new Map(corpus.map((chunk) => [chunk.id, chunk]));
  
  // Lấy top 2 của BM25 trước (đặc biệt hữu dụng cho các chunk mới cào chưa có embedding)
  const topBm25Ids = [...bm25Scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => id);

  const rankedIds = [...fused.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const finalIds = [...new Set([...topBm25Ids, ...rankedIds])];

  return {
    chunks: finalIds.slice(0, limit).map((id) => byId.get(id)!).filter(Boolean),
    mode
  };
}
