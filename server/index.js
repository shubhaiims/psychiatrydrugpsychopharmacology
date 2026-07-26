import { createReadStream, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isAdminConfigured, loginWithPassword, requireAdmin } from "./auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "./http.js";
import { createDrug, deleteDrug, hasSupabaseConfig, listDrugs, replaceDrugs, updateDrug } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");
loadDotEnv(resolve(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const staticFiles = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "admin.js",
  "admin/index.html",
  "assets/psychiatry-made-easy-logo.png"
]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"]
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
    sendError(response, error);
  }
});

server.listen(port, () => {
  console.log(`Psychiatry Made Easy running at http://localhost:${port}/`);
  console.log(hasSupabaseConfig() ? "Using Supabase storage." : "Using local JSON fallback storage.");
  if (!isAdminConfigured()) {
    console.log("Admin editor is locked until ADMIN_PASSWORD is set.");
  }
});

async function routeApi(request, response, url) {
  const method = request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      editorEnabled: isAdminConfigured(),
      storage: hasSupabaseConfig() ? "supabase" : "local-json"
    });
    return;
  }

  if (url.pathname === "/api/auth/login") {
    if (method !== "POST") {
      methodNotAllowed(response, ["POST"]);
      return;
    }
    const body = await readJsonBody(request);
    sendJson(response, 200, loginWithPassword(body.password));
    return;
  }

  if (url.pathname === "/api/drugs") {
    if (method === "GET") {
      sendJson(response, 200, { drugs: await listDrugs() });
      return;
    }
    if (method === "POST") {
      requireAdmin(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { drug: await createDrug(body) });
      return;
    }
    if (method === "PUT") {
      requireAdmin(request);
      const body = await readJsonBody(request);
      if (!Array.isArray(body)) {
        sendJson(response, 400, { error: "Expected a JSON array of drug records." });
        return;
      }
      sendJson(response, 200, { drugs: await replaceDrugs(body) });
      return;
    }
    methodNotAllowed(response, ["GET", "POST", "PUT"]);
    return;
  }

  if (parts.length === 3 && parts[0] === "api" && parts[1] === "drugs") {
    const id = decodeURIComponent(parts[2]);
    if (method === "GET") {
      const drug = (await listDrugs()).find((item) => item.id === id);
      if (!drug) {
        sendJson(response, 404, { error: "Drug record not found." });
        return;
      }
      sendJson(response, 200, { drug });
      return;
    }
    if (method === "PUT" || method === "PATCH") {
      requireAdmin(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { drug: await updateDrug(id, body) });
      return;
    }
    if (method === "DELETE") {
      requireAdmin(request);
      sendJson(response, 200, { drug: await deleteDrug(id) });
      return;
    }
    methodNotAllowed(response, ["GET", "PUT", "PATCH", "DELETE"]);
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function routeStatic(response, url) {
  const requested = url.pathname === "/"
    ? "index.html"
    : ["/admin", "/admin/"].includes(url.pathname)
      ? "admin/index.html"
      : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (!staticFiles.has(requested)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const filePath = resolve(publicDir, requested);
  const contentType = mimeTypes.get(extname(filePath)) || "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
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
