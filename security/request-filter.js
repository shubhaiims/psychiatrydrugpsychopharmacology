const privatePath = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.git|\.vercel|node_modules|server|supabase|security)(?:\/|$)|^\/(?:package(?:-lock)?\.json|middleware\.js|SECURITY\.md)$/i;
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const allowedMethods = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

// Layer 4: known attack tooling and probes. None of these match a real page,
// API route or asset on this site, so blocking them costs legitimate users nothing.
const scannerAgent = /\b(?:sqlmap|nikto|nuclei|masscan|zgrab|acunetix|netsparker|wpscan|dirbuster|gobuster|feroxbuster|ffuf|wfuzz|havij|fimap|arachni|w3af|openvas|jaeles|nmap scripting engine|commix)\b/i;
const probePath = /(?:^|\/)(?:wp-admin|wp-login|wp-content|wp-includes|xmlrpc|phpmyadmin|pma|cgi-bin|\.aws|\.ssh|\.svn|\.hg|\.htaccess|\.htpasswd|\.ds_store|\.idea|\.vscode|actuator|vendor\/phpunit|etc\/passwd|proc\/self)(?:[/.]|$)|\.(?:php\d?|phtml|asp|aspx|jsp|cgi|pl|sql|bak|old|orig|swp|sh|ini|log|conf|yml|yaml|tar|gz|tgz|rar|7z)$/i;
const attackPayload = /<\s*\/?\s*(?:script|iframe|svg|img|object|embed)\b|javascript\s*:|\bon(?:error|load|mouseover|focus)\s*=|\bunion\b[\s\S]{0,40}\bselect\b|'\s*or\s*'?\d+'?\s*=\s*'?\d|\b(?:sleep|benchmark|pg_sleep)\s*\(|\$\{\s*jndi\s*:|(?:\.\.[/\\]){2,}|\/etc\/passwd/i;
const maxUrlLength = 2048;

export function filterRequest(request, applicationOrigin = "") {
  if (String(request.url).length > maxUrlLength) return rejection(414, "Request address is too long.");
  const url = new URL(request.url);
  if (scannerAgent.test(request.headers.get("user-agent") || "")) return blocked("scanner", url);
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
  if (probePath.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)) return blocked("probe", url);
  if (url.search && attackPayload.test(decodeRepeatedly(url.search))) return blocked("payload", url);
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

function decodeRepeatedly(value) {
  let current = value.replace(/\+/g, " ");
  for (let i = 0; i < 3; i++) {
    let decoded;
    try { decoded = decodeURIComponent(current); } catch { return current; }
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function blocked(reason, url) {
  // Log only the category and path; query strings may contain personal data.
  console.warn(JSON.stringify({ event: "request_blocked", reason, path: url.pathname.slice(0, 200) }));
  return rejection(403, "Request blocked.");
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
