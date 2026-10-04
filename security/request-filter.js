const privatePath = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.vercel|node_modules|server|supabase|security)(?:\/|$)|^\/(?:package(?:-lock)?\.json|middleware\.js|SECURITY\.md)$/i;
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

export function filterRequest(request, applicationOrigin = "") {
  const url = new URL(request.url);
  let path = url.pathname;
  try {
    for (let i = 0; i < 3; i++) {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    }
  } catch {
    return rejection(400, "Invalid request path.");
  }
  if (path.includes("\\") || /[\x00-\x1f]/.test(path)) return rejection(400, "Invalid request path.");
  if (privatePath.test(path)) return rejection(403, "Access denied.");
  if (!path.startsWith("/api/")) return null;
  const method = request.method || "GET";
  if (!allowedMethods.has(method)) {
    return rejection(405, "Method not allowed.", { Allow: [...allowedMethods].join(", ") });
  }
  if (!writeMethods.has(method)) return null;
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return rejection(403, "Cross-origin requests are not allowed.");
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(applicationOrigin || url.origin).origin) {
        return rejection(403, "Cross-origin requests are not allowed.");
      }
    } catch { return rejection(403, "Invalid request origin."); }
  }
  const type = (request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/json") return rejection(415, "Use application/json for this request.");
  const sensitive = /^\/api\/(?:auth|billing|admin\/login)(?:\/|$)/.test(path);
  const limit = sensitive ? 16 * 1024 : 64 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > limit)) {
    return rejection(413, "Request body is too large.");
  }
  return null;
}

function rejection(status, error, extraHeaders = {}) {
  return Response.json({ error }, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      ...extraHeaders
    }
  });
}
