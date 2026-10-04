import { createReadStream, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filterRequest } from "../security/request-filter.js";
import {
  assertMutationRequest,
  establishRedirectSession,
  getCurrentUser,
  isAuthConfigured,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  requireAdmin,
  requireUser,
  resetPassword
} from "./auth.js";
import { getAccount, updateAccount } from "./account.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "./http.js";
import { createOrder, getMembershipStatus, getPublicBillingInfo, requireMember, verifyPayment } from "./billing.js";
import { getDashboardData } from "./dashboard.js";
import { listMembers } from "./members.js";
import { createNotebookSource, deleteNotebookSource, listNotebookSources, searchNotebook } from "./notebook-store.js";
import { serveAdminPage, serveLibraryPage } from "./pages.js";
import { createDrug, deleteDrug, hasSupabaseConfig, listDrugs, replaceDrugs, updateDrug } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");
loadDotEnv(resolve(rootDir, ".env"));

const port = Number(process.env.PORT || 3000);
const pageRoutes = new Map([
  ["/", "index.html"],
  ["/browse", "browse.html"],
  ["/subscribe", "subscribe.html"],
  ["/subscribe/", "subscribe.html"],
  ["/account", "account.html"],
  ["/account/", "account.html"],
  ["/terms", "terms.html"],
  ["/terms/", "terms.html"],
  ["/privacy", "privacy.html"],
  ["/privacy/", "privacy.html"],
  ["/refunds", "refunds.html"],
  ["/refunds/", "refunds.html"],
  ["/contact", "contact.html"],
  ["/contact/", "contact.html"],
  ["/browse/", "browse.html"],
  ["/formulas", "formulas.html"],
  ["/formulas/", "formulas.html"],
  ["/research", "research.html"],
  ["/research/", "research.html"],
  ["/qtc", "qtc.html"],
  ["/qtc/", "qtc.html"],
  ["/login", "login.html"],
  ["/register", "register.html"],
  ["/forgot-password", "forgot-password.html"],
  ["/reset-password", "reset-password.html"],
  ["/admin/login", "admin-login.html"]
]);
const staticFiles = new Set([
  ...pageRoutes.values(),
  "styles.css",
  "home.js",
  "formulas.js",
  "research.js",
  "research.css",
  "research.json",
  "qtc.html",
  "qtc.js",
  "app.js",
  "admin.js",
  "auth.js",
  "assets/psychiatry-made-easy-logo.png",
  "assets/qtc-ecg-reference.png",
  // Landing page assets
  "landing.css",
  "theme.css",
  "landing.js",
  "subscribe.js",
  "account.js",
  "assets/fonts/newsreader-roman.woff2",
  "assets/fonts/newsreader-italic.woff2",
  "assets/fonts/atkinson-next.woff2",
  "assets/landing/logo-mark-64.png",
  "assets/landing/logo-mark-128.png",
  ...["hero-plant-960", "hero-plant-1600", "hero-plant-2400"].map((name) => `assets/landing/${name}.webp`),
  ...["window-light", "window-figure"].flatMap((name) => [600, 900, 1200].map((width) => `assets/landing/${name}-${width}.webp`))
]);
const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

const server = createServer(async (request, response) => {
  setSecurityHeaders(response, request.url);
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (!/^\/api\/(?:drugs|notebook\/sources)(?:\/|$)/.test(url.pathname)) {
      const rejection = filterRequest({
        url: url.href,
        method: request.method,
        headers: new Headers(request.headers)
      }, process.env.APP_ORIGIN);
      if (rejection) {
        response.writeHead(rejection.status, Object.fromEntries(rejection.headers));
        response.end(await rejection.text());
        return;
      }
    }
    if (url.pathname.startsWith("/api/")) {
      await routeApi(request, response, url);
      return;
    }
    await routeStatic(request, response, url);
  } catch (error) {
    sendError(response, error);
  }
});

server.listen(port, () => {
  console.log(`Psychiatry Made Easy running at http://localhost:${port}/`);
  console.log(hasSupabaseConfig() ? "Using Supabase storage." : "Using local JSON fallback storage.");
  if (!isAuthConfigured()) {
    console.log("Protected routes are locked until Supabase Auth environment variables are configured.");
  }
});

async function routeApi(request, response, url) {
  const method = request.method || "GET";
  const parts = url.pathname.split("/").filter(Boolean);

  if (method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      authConfigured: isAuthConfigured(),
      storage: hasSupabaseConfig() ? "supabase" : "local-json"
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(response, 200, await getDashboardData());
    return;
  }

  if (url.pathname === "/api/auth/register") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 201, await registerUser(body, request, response));
    return;
  }

  if (url.pathname === "/api/auth/login") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await loginUser(body, request, response));
    return;
  }

  if (url.pathname === "/api/admin/login") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await loginUser(body, request, response, { adminOnly: true }));
    return;
  }

  if (url.pathname === "/api/auth/logout") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    sendJson(response, 200, await logoutUser(request, response));
    return;
  }

  if (url.pathname === "/api/auth/forgot-password") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await requestPasswordReset(body, request));
    return;
  }

  if (url.pathname === "/api/auth/reset-password") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await resetPassword(body, request, response));
    return;
  }

  if (url.pathname === "/api/auth/session") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    const body = await readJsonBody(request);
    sendJson(response, 200, await establishRedirectSession(body, request, response));
    return;
  }

  if (url.pathname === "/api/auth/me") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    sendJson(response, 200, await getCurrentUser(request, response));
    return;
  }

  if (url.pathname === "/api/account") {
    if (method === "GET") {
      sendJson(response, 200, await getAccount(request, response));
      return;
    }
    if (method === "PATCH") {
      sendJson(response, 200, await updateAccount(request, response));
      return;
    }
    return methodNotAllowed(response, ["GET", "PATCH"]);
  }

  if (url.pathname === "/api/admin/members") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    sendJson(response, 200, await listMembers(request, response));
    return;
  }

  if (url.pathname === "/api/billing/plans") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    sendJson(response, 200, getPublicBillingInfo());
    return;
  }

  if (url.pathname === "/api/billing/status") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    sendJson(response, 200, await getMembershipStatus(await requireUser(request, response)));
    return;
  }

  if (url.pathname === "/api/billing/order") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    assertMutationRequest(request);
    sendJson(response, 201, await createOrder(await requireUser(request, response)));
    return;
  }

  if (url.pathname === "/api/billing/verify") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    assertMutationRequest(request);
    const session = await requireUser(request, response);
    sendJson(response, 200, await verifyPayment(session, await readJsonBody(request)));
    return;
  }

  if (url.pathname === "/api/pages/library") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    await serveLibraryPage(request, response);
    return;
  }

  if (url.pathname === "/api/admin/page") {
    if (method !== "GET") return methodNotAllowed(response, ["GET"]);
    await serveAdminPage(request, response);
    return;
  }

  if (url.pathname === "/api/drugs") {
    if (method === "GET") {
      await requireMember(request, response);
      sendJson(response, 200, { drugs: await listDrugs() });
      return;
    }
    if (method === "POST") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 201, { drug: await createDrug(body) });
      return;
    }
    if (method === "PUT") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
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

  if (url.pathname === "/api/notebook/sources") {
    if (method === "GET") {
      await requireAdmin(request, response);
      sendJson(response, 200, { sources: await listNotebookSources() });
      return;
    }
    if (method === "POST") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 201, { source: await createNotebookSource(body) });
      return;
    }
    methodNotAllowed(response, ["GET", "POST"]);
    return;
  }

  if (parts.length === 4 && parts[0] === "api" && parts[1] === "notebook" && parts[2] === "sources") {
    if (method === "DELETE") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      sendJson(response, 200, { source: await deleteNotebookSource(decodeURIComponent(parts[3])) });
      return;
    }
    methodNotAllowed(response, ["DELETE"]);
    return;
  }

  if (url.pathname === "/api/notebook/search") {
    if (method !== "POST") return methodNotAllowed(response, ["POST"]);
    assertMutationRequest(request);
    await requireMember(request, response);
    const body = await readJsonBody(request);
    sendJson(response, 200, await searchNotebook(body.query));
    return;
  }

  if (parts.length === 3 && parts[0] === "api" && parts[1] === "drugs") {
    const id = decodeURIComponent(parts[2]);
    if (method === "GET") {
      await requireMember(request, response);
      const drug = (await listDrugs()).find((item) => item.id === id);
      if (!drug) {
        sendJson(response, 404, { error: "Drug record not found." });
        return;
      }
      sendJson(response, 200, { drug });
      return;
    }
    if (method === "PUT" || method === "PATCH") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 200, { drug: await updateDrug(id, body) });
      return;
    }
    if (method === "DELETE") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      sendJson(response, 200, { drug: await deleteDrug(id) });
      return;
    }
    methodNotAllowed(response, ["GET", "PUT", "PATCH", "DELETE"]);
    return;
  }

  sendJson(response, 404, { error: "API route not found." });
}

async function routeStatic(request, response, url) {
  if (["/library", "/library/"].includes(url.pathname)) {
    await serveLibraryPage(request, response);
    return;
  }
  if (["/admin", "/admin/", "/admin/index.html"].includes(url.pathname)) {
    await serveAdminPage(request, response);
    return;
  }

  const requested = pageRoutes.get(url.pathname)
    || decodeURIComponent(url.pathname).replace(/^\/+/, "");
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

// Same policies as vercel.json; only the checkout page may load Razorpay
const strictCsp = "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'";
const checkoutCsp = "default-src 'self'; base-uri 'self'; connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com; font-src 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://api.razorpay.com https://checkout.razorpay.com; img-src 'self' data: https://cdn.razorpay.com; object-src 'none'; script-src 'self' https://checkout.razorpay.com https://cdn.razorpay.com; style-src 'self' 'unsafe-inline'";

function setSecurityHeaders(response, requestUrl = "/") {
  const pathname = String(requestUrl).split("?")[0];
  const isCheckout = ["/subscribe", "/subscribe/", "/subscribe.html"].includes(pathname);
  response.setHeader("Content-Security-Policy", isCheckout ? checkoutCsp : strictCsp);
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
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
