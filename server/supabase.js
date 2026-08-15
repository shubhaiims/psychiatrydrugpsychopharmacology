import { httpError } from "./drug-model.js";

export function getSupabaseUrl() {
  const configured = String(process.env.SUPABASE_URL || "").trim();
  if (!configured) return "";

  try {
    // The dashboard also shows /rest/v1 endpoints. Auth and Data API clients
    // both need the project origin, so normalize either copied form here.
    return new URL(configured).origin;
  } catch {
    return configured.replace(/\/+$/, "");
  }
}

export function getSupabasePublishableKey() {
  return String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
}

export function getSupabaseSecretKey() {
  return String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

export function hasSupabaseAuthConfig() {
  return Boolean(getSupabaseUrl() && getSupabasePublishableKey() && getSupabaseSecretKey());
}

export function hasSupabaseServiceConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function isHostedProduction() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

export async function supabaseAuthRequest(path, options = {}) {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw httpError(503, "Supabase Auth is not configured on this server.");
  }
  assertSupabaseUrl(url);

  return requestJson(`${url}/auth/v1/${path.replace(/^\/+/, "")}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Accept: "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }, "auth");
}

export async function supabaseServiceRequest(path, options = {}) {
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) {
    throw httpError(503, "Supabase database storage is not configured on this server.");
  }
  assertSupabaseUrl(url);

  const isLegacyJwtKey = key.split(".").length === 3;
  return requestJson(`${url}/rest/v1/${path.replace(/^\/+/, "")}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      ...(isLegacyJwtKey ? { Authorization: `Bearer ${key}` } : {}),
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }, "database");
}

async function requestJson(url, options, kind) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const wrapped = httpError(502, `Unable to reach the Supabase ${kind} service.`);
    wrapped.cause = error;
    throw wrapped;
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const detail = data?.msg || data?.message || data?.error_description || data?.error || `status ${response.status}`;
    const status = response.status >= 500 ? 502 : response.status;
    const error = httpError(status, `Supabase ${kind} request failed: ${detail}`);
    error.supabaseStatus = response.status;
    error.supabaseCode = data?.code || data?.error_code || "";
    throw error;
  }

  return data ?? {};
}

function assertSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw httpError(503, "SUPABASE_URL must be a valid absolute URL.");
  }
  if (isHostedProduction() && url.protocol !== "https:") {
    throw httpError(503, "SUPABASE_URL must use HTTPS in production.");
  }
}
