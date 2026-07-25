import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { httpError, normalizeCollection, normalizeDrug, sortDrugs } from "./drug-model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function listDrugs() {
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest("drugs?select=id,name,payload,updated_at&order=name.asc");
    return normalizeCollection(rows.map(fromSupabaseRow));
  }
  return readLocalDrugs();
}

export async function replaceDrugs(records) {
  const drugs = normalizeCollection(records);
  if (hasSupabaseConfig()) {
    await supabaseRequest("drugs?id=not.is.null", {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    if (!drugs.length) return [];
    const rows = await supabaseRequest("drugs", {
      method: "POST",
      body: drugs.map(toSupabaseRow),
      headers: { Prefer: "return=representation" }
    });
    return normalizeCollection(rows.map(fromSupabaseRow));
  }

  await writeLocalDrugs(drugs);
  return drugs;
}

export async function createDrug(input) {
  const existing = await listDrugs();
  const drug = normalizeDrug(input, { existingIds: new Set(existing.map((item) => item.id)) });

  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest("drugs", {
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
    const rows = await supabaseRequest(`drugs?id=eq.${encodeURIComponent(id)}`, {
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
    const rows = await supabaseRequest(`drugs?id=eq.${encodeURIComponent(id)}`, {
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
  return Boolean(getSupabaseUrl() && getSupabaseKey());
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

async function supabaseRequest(path, options = {}) {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) {
    throw httpError(500, "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.hint || text || `status ${response.status}`;
    throw httpError(response.status, `Supabase request failed: ${detail}`);
  }
  return data || [];
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

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

function getSupabaseKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function getDataFile() {
  return resolve(process.env.DATA_FILE || join(__dirname, "data", "drugs.json"));
}
