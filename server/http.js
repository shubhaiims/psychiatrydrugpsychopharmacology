import { httpError } from "./drug-model.js";
import { guardRequest, requestPolicy } from "./security.js";

export async function readJsonBody(request) {
  await guardRequest(request);
  const bodyLimitBytes = requestPolicy(request).bodyBytes;
  if (request.body && typeof request.body === "object" && !isReadable(request.body)) {
    if (Buffer.byteLength(JSON.stringify(request.body)) > bodyLimitBytes) throw httpError(413, "Request body is too large.");
    return request.body;
  }

  if (typeof request.body === "string") {
    if (Buffer.byteLength(request.body) > bodyLimitBytes) throw httpError(413, "Request body is too large.");
    return parseJson(request.body);
  }

  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > bodyLimitBytes) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? parseJson(text) : {};
}

export function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

export function sendError(response, error) {
  const status = error.status || 500;
  if (status >= 500) {
    console.error(JSON.stringify({ event: "server_error", status, code: error.supabaseCode || "internal" }));
  }
  if (error.retryAfter) response.setHeader("Retry-After", String(error.retryAfter));
  sendJson(response, status, { error: status >= 500 ? "Internal server error." : error.message });
}

export function methodNotAllowed(response, allowed) {
  response.setHeader("Allow", allowed.join(", "));
  sendJson(response, 405, { error: `Method not allowed. Use ${allowed.join(", ")}.` });
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Request body must be valid JSON.");
  }
}

function isReadable(value) {
  return value && typeof value.on === "function" && typeof value.pipe === "function";
}
