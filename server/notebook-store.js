import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { httpError } from "./drug-model.js";
import { hasSupabaseServiceConfig, isHostedProduction, supabaseServiceRequest } from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const maxSourceBytes = 8 * 1024 * 1024;
const chunkWordTarget = 220;
const chunkOverlap = 45;

export async function listNotebookSources() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest("notebook_sources?select=id,title,file_name,content_type,word_count,created_at,updated_at&order=updated_at.desc");
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      fileName: row.file_name || "",
      contentType: row.content_type || "",
      wordCount: Number(row.word_count || 0),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || "")
    }));
  }

  assertLocalFallbackAllowed();
  return (await readLocalSources()).map(toPublicSource);
}

export async function createNotebookSource(input = {}) {
  const source = await normalizeSourceInput(input);

  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest("notebook_sources", {
      method: "POST",
      body: toSupabaseRow(source),
      headers: { Prefer: "return=representation" }
    });
    return toPublicSource(fromSupabaseRow(rows[0]));
  }

  assertLocalFallbackAllowed();
  const sources = await readLocalSources();
  sources.push(source);
  await writeLocalSources(sources);
  return toPublicSource(source);
}

export async function deleteNotebookSource(id) {
  const sourceId = String(id || "").trim();
  if (!sourceId) {
    throw httpError(400, "Notebook source id is required.");
  }

  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest(`notebook_sources?id=eq.${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    if (!rows.length) {
      throw httpError(404, "Notebook source not found.");
    }
    return toPublicSource(fromSupabaseRow(rows[0]));
  }

  assertLocalFallbackAllowed();
  const sources = await readLocalSources();
  const index = sources.findIndex((source) => source.id === sourceId);
  if (index < 0) {
    throw httpError(404, "Notebook source not found.");
  }
  const [deleted] = sources.splice(index, 1);
  await writeLocalSources(sources);
  return toPublicSource(deleted);
}

export async function searchNotebook(queryInput) {
  const query = String(queryInput || "").trim();
  if (query.length < 2) {
    throw httpError(400, "Enter a longer search question.");
  }

  const sources = await readAllSources();
  const terms = tokenize(query);
  const results = sources
    .flatMap((source) => source.chunks.map((chunk) => scoreChunk(source, chunk, terms, query)))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return {
    query,
    answer: buildSearchAnswer(query, results),
    results
  };
}

async function normalizeSourceInput(input) {
  const title = String(input.title || input.fileName || "Notebook source").trim().replace(/\s+/g, " ");
  const fileName = String(input.fileName || "").trim();
  const contentType = String(input.contentType || "").trim();
  const sourceType = contentType.includes("pdf") || /\.pdf$/i.test(fileName) ? "pdf" : "text";
  const text = await extractSourceText(input, sourceType);
  const cleanedText = normalizeText(text);
  if (cleanedText.length < 20) {
    throw httpError(400, "The source does not contain enough searchable text.");
  }

  const now = new Date().toISOString();
  const chunks = chunkText(cleanedText).map((chunk, index) => ({
    id: `${index + 1}`,
    index,
    text: chunk
  }));

  return {
    id: slugify(`${title}-${randomUUID().slice(0, 8)}`),
    title,
    fileName,
    contentType,
    sourceType,
    text: cleanedText,
    chunks,
    wordCount: countWords(cleanedText),
    createdAt: now,
    updatedAt: now
  };
}

async function extractSourceText(input, sourceType) {
  const directText = String(input.text || "").trim();
  if (directText) return directText;

  const dataBase64 = String(input.dataBase64 || "").trim();
  if (!dataBase64) {
    throw httpError(400, "Add text or upload a supported source file.");
  }

  const buffer = Buffer.from(dataBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
  if (buffer.length > maxSourceBytes) {
    throw httpError(413, "Source file is too large. Keep uploads under 8 MB.");
  }

  if (sourceType === "pdf") {
    return extractPdfText(buffer);
  }
  return buffer.toString("utf8");
}

async function extractPdfText(buffer) {
  try {
    const module = await import("pdf-parse");
    const parsePdf = module.default || module;
    const result = await parsePdf(buffer);
    return result.text || "";
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      throw httpError(501, "PDF extraction dependency is not installed yet. Redeploy after installing dependencies, or paste extracted text.");
    }
    throw httpError(400, "Unable to extract text from this PDF. If it is scanned, paste OCR text instead.");
  }
}

async function readAllSources() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest("notebook_sources?select=id,title,file_name,content_type,payload,created_at,updated_at");
    return rows.map(fromSupabaseRow);
  }
  assertLocalFallbackAllowed();
  return readLocalSources();
}

async function readLocalSources() {
  try {
    const source = await readFile(getSourcesFile(), "utf8");
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalSources(sources) {
  const filePath = getSourcesFile();
  await mkdir(dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(sources, null, 2)}\n`, "utf8");
  await rename(tempFile, filePath);
}

function scoreChunk(source, chunk, terms, query) {
  const text = chunk.text || "";
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const matches = haystack.split(term).length - 1;
    if (matches) score += matches * (term.length > 5 ? 3 : 1);
  }
  if (haystack.includes(query.toLowerCase())) score += 12;
  return {
    sourceId: source.id,
    sourceTitle: source.title,
    fileName: source.fileName || "",
    chunkIndex: chunk.index,
    score,
    snippet: makeSnippet(text, terms)
  };
}

function buildSearchAnswer(query, results) {
  if (!results.length) {
    return `No matching notebook sources were found for "${query}". Add more PDFs or notes, or try different keywords.`;
  }

  const top = results.slice(0, 3);
  return [
    `I found ${results.length} relevant notebook passage${results.length === 1 ? "" : "s"} for "${query}".`,
    ...top.map((result, index) => `${index + 1}. ${result.snippet} [${result.sourceTitle}]`)
  ].join("\n");
}

function makeSnippet(text, terms) {
  const lower = text.toLowerCase();
  const firstIndex = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] || 0;
  const start = Math.max(0, firstIndex - 180);
  const end = Math.min(text.length, firstIndex + 520);
  const snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "... " : ""}${snippet}${end < text.length ? " ..." : ""}`;
}

function chunkText(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let index = 0; index < words.length; index += chunkWordTarget - chunkOverlap) {
    const chunk = words.slice(index, index + chunkWordTarget).join(" ");
    if (chunk) chunks.push(chunk);
  }
  return chunks.length ? chunks : [text];
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tokenize(value) {
  const stopWords = new Set(["about", "after", "also", "and", "are", "for", "from", "how", "into", "the", "their", "there", "this", "what", "when", "where", "which", "with"]);
  return [...new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g) || [])]
    .filter((term) => !stopWords.has(term))
    .slice(0, 18);
}

function toPublicSource(source) {
  return {
    id: source.id,
    title: source.title,
    fileName: source.fileName || "",
    contentType: source.contentType || "",
    wordCount: Number(source.wordCount || 0),
    createdAt: source.createdAt || "",
    updatedAt: source.updatedAt || ""
  };
}

function toSupabaseRow(source) {
  return {
    id: source.id,
    title: source.title,
    file_name: source.fileName,
    content_type: source.contentType,
    word_count: source.wordCount,
    payload: source,
    updated_at: new Date().toISOString()
  };
}

function fromSupabaseRow(row = {}) {
  const payload = row.payload || {};
  return {
    ...payload,
    id: row.id || payload.id,
    title: row.title || payload.title,
    fileName: row.file_name || payload.fileName || "",
    contentType: row.content_type || payload.contentType || "",
    wordCount: Number(row.word_count || payload.wordCount || 0),
    createdAt: payload.createdAt || String(row.created_at || ""),
    updatedAt: payload.updatedAt || String(row.updated_at || "")
  };
}

function hasSupabaseConfig() {
  return hasSupabaseServiceConfig();
}

function getSourcesFile() {
  return resolve(process.env.NOTEBOOK_SOURCES_FILE || join(__dirname, "data", "notebook-sources.json"));
}

function assertLocalFallbackAllowed() {
  if (isHostedProduction()) {
    throw httpError(503, "Supabase notebook storage is required in production.");
  }
}

function countWords(value) {
  return String(value || "").split(/\s+/).filter(Boolean).length;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || randomUUID();
}
