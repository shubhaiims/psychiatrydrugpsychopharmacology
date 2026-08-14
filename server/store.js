import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { httpError, normalizeCollection, normalizeDrug, sortDrugs } from "./drug-model.js";
import { hasSupabaseServiceConfig, isHostedProduction, supabaseServiceRequest } from "./supabase.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function listDrugs() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest("drugs?select=id,name,payload,updated_at&order=name.asc");
    return normalizeCollection(rows.map(fromSupabaseRow));
  }
  assertLocalFallbackAllowed();
  return readLocalDrugs();
}

export async function replaceDrugs(records) {
  const drugs = normalizeCollection(records);
  if (hasSupabaseConfig()) {
    await supabaseServiceRequest("drugs?id=not.is.null", {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (!drugs.length) return [];
    const rows = await supabaseServiceRequest("drugs", {
      method: "POST",
      body: drugs.map(toSupabaseRow),
      headers: { Prefer: "return=representation" }
    });
    return normalizeCollection(rows.map(fromSupabaseRow));
  }

  assertLocalFallbackAllowed();
  await writeLocalDrugs(drugs);
  return drugs;
}

export async function createDrug(input) {
  const existing = await listDrugs();
  const drug = normalizeDrug(input, { existingIds: new Set(existing.map((item) => item.id)) });

  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest("drugs", {
      method: "POST",
      body: toSupabaseRow(drug),
      headers: { Prefer: "return=representation" }
    });
    return fromSupabaseRow(rows[0]);
  }

  await writeLocalDrugs(sortDrugs([...existing, drug]));
  return drug;
}

export async function updateDrug(id, input) {
  const existing = await listDrugs();
  const index = existing.findIndex((drug) => drug.id === id);
  if (index < 0) {
    throw httpError(404, "Drug record not found.");
  }

  const existingIds = new Set(existing.map((drug) => drug.id).filter((drugId) => drugId !== id));
  const drug = normalizeDrug({ ...existing[index], ...input, id }, { existingIds, preserveId: id });

  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest(`drugs?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: toSupabaseRow(drug),
      headers: { Prefer: "return=representation" }
    });
    return fromSupabaseRow(rows[0]);
  }

  existing[index] = drug;
  await writeLocalDrugs(sortDrugs(existing));
  return drug;
}

export async function deleteDrug(id) {
  const existing = await listDrugs();
  const index = existing.findIndex((drug) => drug.id === id);
  if (index < 0) {
    throw httpError(404, "Drug record not found.");
  }

  if (hasSupabaseConfig()) {
    const rows = await supabaseServiceRequest(`drugs?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    });
    return fromSupabaseRow(rows[0]);
  }

  const [deleted] = existing.splice(index, 1);
  await writeLocalDrugs(existing);
  return deleted;
}

export function hasSupabaseConfig() {
  return hasSupabaseServiceConfig();
}

async function readLocalDrugs() {
  try {
    const source = await readFile(getDataFile(), "utf8");
    const parsed = JSON.parse(source);
    return normalizeCollection(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalDrugs(drugs) {
  const dataFile = getDataFile();
  await mkdir(dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(sortDrugs(drugs), null, 2)}\n`, "utf8");
  await rename(tempFile, dataFile);
}

function toSupabaseRow(drug) {
  return {
    id: drug.id,
    name: drug.name,
    payload: drug,
    updated_at: new Date().toISOString()
  };
}

function fromSupabaseRow(row = {}) {
  return {
    ...(row.payload || {}),
    id: row.id || row.payload?.id,
    name: row.name || row.payload?.name,
    updatedAt: row.payload?.updatedAt || String(row.updated_at || "").slice(0, 10)
  };
}

function getDataFile() {
  return resolve(process.env.DATA_FILE || join(__dirname, "data", "drugs.json"));
}

function assertLocalFallbackAllowed() {
  if (isHostedProduction()) {
    throw httpError(503, "Supabase database storage is required in production.");
  }
}
