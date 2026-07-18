// Precomputes embeddings for every chunk in data/corpus.json and writes
// data/corpus_embeddings.json. Run after any change to corpus.json, before
// building the app, so lib/retrieval.ts has an up-to-date dense index.
//
// Usage: node scripts/build-embeddings.mjs
// Requires GEMINI_API_KEY (reads .env.local if present, like Next.js does).

import { GoogleGenAI } from "@google/genai";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const BATCH_SIZE = 20;

function loadEnvLocal() {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function chunkHaystack(chunk) {
  return [chunk.title, chunk.clause, chunk.tags.join(" "), chunk.text].join(" ");
}

async function main() {
  loadEnvLocal();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Thiếu GEMINI_API_KEY (đặt trong .env.local hoặc biến môi trường).");

  const corpus = JSON.parse(readFileSync(resolve(ROOT, "data/corpus.json"), "utf-8"));
  const ai = new GoogleGenAI({ apiKey });
  const results = [];

  for (let i = 0; i < corpus.length; i += BATCH_SIZE) {
    const batch = corpus.slice(i, i + BATCH_SIZE);
    const response = await ai.models.embedContent({
      model: MODEL,
      contents: batch.map(chunkHaystack)
    });
    batch.forEach((chunk, index) => {
      const values = response.embeddings?.[index]?.values;
      if (!values) throw new Error(`Không nhận được embedding cho chunk ${chunk.id}`);
      results.push({ id: chunk.id, embedding: values });
    });
    console.log(`Embedded ${Math.min(i + BATCH_SIZE, corpus.length)}/${corpus.length}`);
  }

  const payload = {
    model: MODEL,
    dimensions: results[0]?.embedding.length ?? 0,
    generated_at: new Date().toISOString(),
    chunks: results
  };
  writeFileSync(resolve(ROOT, "data/corpus_embeddings.json"), JSON.stringify(payload));
  console.log(`Wrote data/corpus_embeddings.json (${results.length} chunks, dim=${payload.dimensions})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
