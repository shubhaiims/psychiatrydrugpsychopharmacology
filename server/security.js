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
  const result = await consumeLimit(key, policy.limit, policy.seconds);
  if (result?.allowed !== true) {
    console.warn(JSON.stringify({ event: "request_rate_limited", scope: policy.scope, client: key }));
    const error = httpError(429, "Too many requests. Please wait before trying again.");
    error.retryAfter = Number(result?.retry_after) || policy.seconds;
    throw error;
  }
  checked.add(request);
}

// Layer 4: per-account limits stop password guessing and reset-email flooding
// spread across many IP addresses, which the per-IP limits above cannot see.
const accountPolicies = {
  login: { limit: 10, seconds: 900, message: "Too many sign-in attempts for this account. Please wait 15 minutes or reset your password." },
  reset: { limit: 5, seconds: 3600, message: "Too many password reset requests for this account. Please wait an hour and check your inbox." }
};

export async function guardAccount(kind, email) {
  const policy = accountPolicies[kind];
  if (!policy) throw new Error(`Unknown account limit: ${kind}`);
  const key = createHash("sha256").update(`account-${kind}|${String(email).toLowerCase()}`).digest("hex");
  const result = await consumeLimit(key, policy.limit, policy.seconds);
  if (result?.allowed !== true) {
    console.warn(JSON.stringify({ event: "account_rate_limited", kind, account: key }));
    const error = httpError(429, policy.message);
    error.retryAfter = Number(result?.retry_after) || policy.seconds;
    throw error;
  }
}

async function consumeLimit(key, limit, seconds) {
  if (isHostedProduction()) {
    try {
      return await supabaseServiceRequest("rpc/consume_security_limit", {
        method: "POST",
        body: { p_key: key, p_limit: limit, p_seconds: seconds }
      });
    } catch {
      throw httpError(503, "Security checks are temporarily unavailable. Please try again.");
    }
  }
  const now = Date.now();
  for (const [bucketKey, bucket] of localBuckets) {
    if (bucket.until <= now) localBuckets.delete(bucketKey);
  }
  const bucket = localBuckets.get(key) || { count: 0, until: now + seconds * 1000 };
  bucket.count += 1;
  localBuckets.set(key, bucket);
  return { allowed: bucket.count <= limit, retry_after: Math.max(1, Math.ceil((bucket.until - now) / 1000)) };
}
