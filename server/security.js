import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { httpError } from "./drug-model.js";
import { isHostedProduction, supabaseServiceRequest } from "./supabase.js";

const checked = new WeakSet();
const localBuckets = new Map();

export function requestPolicy(request) {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  const action = String(request.query?.action || path.split("/").pop() || "");
  const actions = [action, path.split("/").pop()];
  if (actions.some(value => ["login", "register", "forgot-password", "reset-password", "session"].includes(value))) {
    return { scope: "auth", limit: 15, seconds: 900, bodyBytes: 16 * 1024 };
  }
  if (["order", "verify", "status"].includes(action) && path.includes("/billing/")) {
    return { scope: "billing", limit: 30, seconds: 300, bodyBytes: 16 * 1024 };
  }
  return { scope: "api", limit: 180, seconds: 60, bodyBytes: path.includes("/notebook/sources") || path.includes("/drugs") ? 12 * 1024 * 1024 : 64 * 1024 };
}

export function clientAddress(request) {
  // Trust forwarded addresses only behind Vercel's proxy, never on a local server.
  const forwarded = process.env.VERCEL ? String(request.headers?.["x-forwarded-for"] || "").split(",")[0].trim() : "";
  return isIP(forwarded) ? forwarded : request.socket?.remoteAddress || "unknown";
}

export async function guardRequest(request) {
  if (checked.has(request)) return;
  const policy = requestPolicy(request);
  const contentType = String(request.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (["POST", "PUT", "PATCH"].includes(request.method) && contentType && contentType !== "application/json") {
    throw httpError(415, "Use application/json for this request.");
  }
  const declaredSize = Number(request.headers?.["content-length"] || 0);
  if (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > policy.bodyBytes) {
    throw httpError(413, "Request body is too large.");
  }
  const key = createHash("sha256").update(`${policy.scope}|${clientAddress(request)}`).digest("hex");
  let result;
  if (isHostedProduction()) {
    try {
      result = await supabaseServiceRequest("rpc/consume_security_limit", {
        method: "POST",
        body: { p_key: key, p_limit: policy.limit, p_seconds: policy.seconds }
      });
    } catch {
      throw httpError(503, "Security checks are temporarily unavailable. Please try again.");
    }
  } else {
    const now = Date.now();
    for (const [bucketKey, bucket] of localBuckets) {
      if (bucket.until <= now) localBuckets.delete(bucketKey);
    }
    const bucket = localBuckets.get(key) || { count: 0, until: now + policy.seconds * 1000 };
    bucket.count += 1;
    localBuckets.set(key, bucket);
    result = { allowed: bucket.count <= policy.limit, retry_after: Math.max(1, Math.ceil((bucket.until - now) / 1000)) };
  }
  if (result?.allowed !== true) {
    console.warn(JSON.stringify({ event: "request_rate_limited", scope: policy.scope, client: key }));
    const error = httpError(429, "Too many requests. Please wait before trying again.");
    error.retryAfter = Number(result?.retry_after) || policy.seconds;
    throw error;
  }
  checked.add(request);
}
