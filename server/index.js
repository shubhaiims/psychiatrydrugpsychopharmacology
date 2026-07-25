import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
loadDotEnv(resolve(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const dataFile = resolve(process.env.DATA_FILE || join(__dirname, "data", "drugs.json"));
const adminPassword = process.env.ADMIN_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const tokenLifetimeMs = 12 * 60 * 60 * 1000;
const bodyLimitBytes = 2 * 1024 * 1024;

const staticFiles = new Set(["index.html", "styles.css", "app.js"]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"]
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }
    await routeStatic(response, url);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) {
      console.error(error);
    }
    json(response, status, { error: status >= 500 ? "Internal server error." : error.message });
  }
});

server.listen(port, () => {
  console.log(`PsychRx Drug Library running at http://localhost:${port}/`);
  if (!adminPassword) {
    console.log("Admin editor is locked until ADMIN_PASSWORD is set.");
  }
});

async function routeApi(request, response, url) {
  const method = request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { ok: true, editorEnabled: Boolean(adminPassword) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(request);
    if (!adminPassword) {
      json(response, 503, { error: "Admin password is not configured on this server." });
      return;
    }
    if (String(body.password || "") !== adminPassword) {
      json(response, 401, { error: "Incorrect admin password." });
      return;
    }
    const expiresAt = Date.now() + tokenLifetimeMs;
    const token = signToken({ sub: "admin", exp: expiresAt });
    json(response, 200, { token, expiresAt });
    return;
  }

  if (method === "GET" && url.pathname === "/api/drugs") {
    json(response, 200, { drugs: await readDrugs() });
    return;
  }

  if (method === "PUT" && url.pathname === "/api/drugs") {
    if (!requireAdmin(request, response)) return;
    const body = await readJsonBody(request);
    if (!Array.isArray(body)) {
      json(response, 400, { error: "Expected a JSON array of drug records." });
      return;
    }
    const drugs = normalizeCollection(body);
    await writeDrugs(drugs);
    json(response, 200, { drugs });
    return;
  }

  if (method === "POST" && url.pathname === "/api/drugs") {
    if (!requireAdmin(request, response)) return;
    const body = await readJsonBody(request);
    const drugs = await readDrugs();
    const drug = normalizeDrug(body, { existingIds: new Set(drugs.map((item) => item.id)) });
    drugs.push(drug);
    const saved = sortDrugs(drugs);
    await writeDrugs(saved);
    json(response, 201, { drug });
    return;
  }

  if (parts.length === 3 && parts[0] === "api" && parts[1] === "drugs") {
    const id = decodeURIComponent(parts[2]);
    const drugs = await readDrugs();
    const index = drugs.findIndex((drug) => drug.id === id);

    if (method === "GET") {
      if (index < 0) {
        json(response, 404, { error: "Drug record not found." });
        return;
      }
      json(response, 200, { drug: drugs[index] });
      return;
    }

    if (method === "PUT" || method === "PATCH") {
      if (!requireAdmin(request, response)) return;
      if (index < 0) {
        json(response, 404, { error: "Drug record not found." });
        return;
      }
      const body = await readJsonBody(request);
      const existingIds = new Set(drugs.map((drug) => drug.id).filter((drugId) => drugId !== id));
      const drug = normalizeDrug({ ...drugs[index], ...body, id }, { existingIds, preserveId: id });
      drugs[index] = drug;
      const saved = sortDrugs(drugs);
      await writeDrugs(saved);
      json(response, 200, { drug });
      return;
    }

    if (method === "DELETE") {
      if (!requireAdmin(request, response)) return;
      if (index < 0) {
        json(response, 404, { error: "Drug record not found." });
        return;
      }
      const [deleted] = drugs.splice(index, 1);
      await writeDrugs(drugs);
      json(response, 200, { drug: deleted });
      return;
    }
  }

  json(response, 404, { error: "API route not found." });
}

async function routeStatic(response, url) {
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!staticFiles.has(requested)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = resolve(rootDir, requested);
  const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

async function readDrugs() {
  try {
    const source = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(source);
    return normalizeCollection(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeDrugs(drugs) {
  await mkdir(dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(sortDrugs(drugs), null, 2)}\n`, "utf8");
  await rename(tempFile, dataFile);
}

function normalizeCollection(collection) {
  const used = new Set();
  return sortDrugs(collection.map((drug) => {
    const normalized = normalizeDrug(drug, { existingIds: used });
    used.add(normalized.id);
    return normalized;
  }));
}

function normalizeDrug(input, options = {}) {
  const existingIds = options.existingIds || new Set();
  const name = cleanString(input.name);
  const classification = cleanString(input.classification || input.className);

  if (!name) {
    throw httpError(400, "Generic name is required.");
  }
  if (!classification) {
    throw httpError(400, "Classification is required.");
  }

  const requestedId = cleanString(options.preserveId || input.id || slugify(name));
  const id = options.preserveId ? requestedId : uniqueId(slugify(requestedId || name), existingIds);

  return {
    id,
    name,
    brands: toArray(input.brands),
    classification,
    riskLevel: ["standard", "watch", "high"].includes(input.riskLevel) ? input.riskLevel : "standard",
    targetDose: cleanString(input.targetDose),
    maximumDose: cleanString(input.maximumDose),
    mechanismOfActionAndReceptorProfile: textField(input.mechanismOfActionAndReceptorProfile || input.mechanismOfAction || input.mechanism),
    pharmacodynamics: textField(input.pharmacodynamics),
    fdaApprovedAndOffLabelUses: textField(input.fdaApprovedAndOffLabelUses || input.indication || input.indications),
    pharmacokineticsAndHalfLife: textField(input.pharmacokineticsAndHalfLife || input.pharmacokinetics),
    clinicalDosingOptimizationAndTargetDose: textField(input.clinicalDosingOptimizationAndTargetDose || input.dosageAndTitration || joinLegacyDose(input)),
    sideEffects: textField(input.sideEffects || input.sideEffect),
    fdaBlackBoxWarning: textField(input.fdaBlackBoxWarning || input.seriousWarnings),
    prescribingInSpecialPopulations: textField(input.prescribingInSpecialPopulations || input.specialPopulation || input.cautions),
    drugInteractions: textField(input.drugInteractions || input.interactions),
    miscellaneous: textField(input.miscellaneous || input.pearls),
    lastReviewed: dateString(input.lastReviewed) || todayString(),
    updatedAt: dateString(input.updatedAt) || todayString()
  };
}

function sortDrugs(drugs) {
  return [...drugs].sort((a, b) => a.name.localeCompare(b.name));
}

function cleanString(value) {
  return String(value || "").trim();
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => cleanString(item)).filter(Boolean);
  }
  return [];
}

function textField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean).join("\n");
  }
  return cleanString(value);
}

function joinLegacyDose(input) {
  return [input.adultDose, input.titration].map(textField).filter(Boolean).join("\n");
}

function dateString(value) {
  const candidate = cleanString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "drug";
}

function uniqueId(base, existingIds) {
  let candidate = slugify(base);
  let count = 2;
  while (existingIds.has(candidate)) {
    candidate = `${slugify(base)}-${count}`;
    count += 1;
  }
  return candidate;
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimitBytes) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function requireAdmin(request, response) {
  if (!adminPassword) {
    json(response, 503, { error: "Admin password is not configured on this server." });
    return false;
  }

  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verifyToken(token)) {
    json(response, 401, { error: "Unauthorized or expired admin token." });
    return false;
  }
  return true;
}

function signToken(payload) {
  const body = base64Url(JSON.stringify(payload));
  const signature = sign(body);
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return false;
  const [body, signature] = token.split(".");
  const expected = sign(body);
  if (!safeEqual(signature, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.sub === "admin" && Number(payload.exp) > Date.now();
  } catch {
    return false;
  }
}

function sign(value) {
  return createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function safeEqual(a, b) {
  const first = Buffer.from(a || "");
  const second = Buffer.from(b || "");
  return first.length === second.length && timingSafeEqual(first, second);
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function loadDotEnv(filePath) {
  try {
    const source = readFileSync(filePath, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional. Production hosts should provide environment variables.
  }
}
