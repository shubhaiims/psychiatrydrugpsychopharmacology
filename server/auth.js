import { randomBytes, timingSafeEqual } from "node:crypto";
import { httpError } from "./drug-model.js";
import {
  hasSupabaseAuthConfig,
  isHostedProduction,
  supabaseAuthRequest,
  supabaseServiceRequest
} from "./supabase.js";

const ACCESS_COOKIE = "pme_access";
const REFRESH_COOKIE = "pme_refresh";
const CSRF_COOKIE = "pme_csrf";
const refreshCookieLifetimeSeconds = 30 * 24 * 60 * 60;

export function isAuthConfigured() {
  return hasSupabaseAuthConfig();
}

export async function registerUser(input, request, response) {
  assertAuthConfigured();
  assertSameOrigin(request);
  const fullName = normalizeFullName(input.fullName);
  const email = normalizeEmail(input.email);
  const password = validatePasswordPair(input.password, input.confirmPassword);
  const redirectTo = `${getApplicationOrigin(request)}/login?confirmed=1`;

  let data;
  try {
    data = await supabaseAuthRequest(`signup?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      body: {
        email,
        password,
        data: { full_name: fullName }
      }
    });
  } catch (error) {
    throw mapRegistrationError(error);
  }

  const session = normalizeSession(data);
  if (session) {
    setSessionCookies(request, response, session);
  }

  return {
    ok: true,
    requiresEmailConfirmation: !session,
    user: toPublicUser(data.user || session?.user)
  };
}

export async function loginUser(input, request, response, options = {}) {
  assertAuthConfigured();
  assertSameOrigin(request);
  const email = normalizeEmail(input.email);
  const password = String(input.password || "");
  if (!password) {
    throw httpError(400, "Enter your password.");
  }

  let data;
  try {
    data = await supabaseAuthRequest("token?grant_type=password", {
      method: "POST",
      body: { email, password }
    });
  } catch (error) {
    if (/email not confirmed/i.test(String(error.message || ""))) {
      throw httpError(403, "Confirm your email address before logging in.");
    }
    if ([400, 401].includes(error.supabaseStatus || error.status)) {
      throw httpError(401, "Invalid email or password.");
    }
    throw error;
  }

  const session = normalizeSession(data);
  if (!session) {
    throw httpError(502, "Supabase Auth did not return a valid session.");
  }

  const user = data.user || session.user || await fetchUser(session.accessToken);
  const admin = await isAdminUser(user.id);
  if (options.adminOnly && !admin) {
    await revokeAccessToken(session.accessToken);
    clearSessionCookies(request, response);
    throw httpError(403, "This account is not authorized for the admin editor.");
  }

  setSessionCookies(request, response, session);
  return {
    ok: true,
    role: admin ? "admin" : "user",
    user: toPublicUser(user)
  };
}

export async function requestPasswordReset(input, request) {
  assertAuthConfigured();
  assertSameOrigin(request);
  const email = normalizeEmail(input.email);
  const redirectTo = `${getApplicationOrigin(request)}/reset-password`;

  await supabaseAuthRequest(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    body: { email }
  });

  return {
    ok: true,
    message: "If an account exists for that email, a password reset link has been sent."
  };
}

export async function establishRedirectSession(input, request, response) {
  assertAuthConfigured();
  assertSameOrigin(request);
  const accessToken = String(input.accessToken || "").trim();
  const refreshToken = String(input.refreshToken || "").trim();
  const expiresIn = Number(input.expiresIn || 3600);
  if (!accessToken || !refreshToken) {
    throw httpError(400, "The authentication link is incomplete or expired.");
  }

  const user = await fetchUser(accessToken);
  const admin = await isAdminUser(user.id);
  setSessionCookies(request, response, {
    accessToken,
    refreshToken,
    expiresIn,
    user
  });

  return {
    ok: true,
    role: admin ? "admin" : "user",
    user: toPublicUser(user)
  };
}

export async function resetPassword(input, request, response) {
  assertAuthConfigured();
  assertMutationRequest(request);
  const password = validatePasswordPair(input.password, input.confirmPassword);
  const session = await requireUser(request, response);

  await supabaseAuthRequest("user", {
    method: "PUT",
    accessToken: session.accessToken,
    body: { password }
  });

  await revokeAccessToken(session.accessToken);
  clearSessionCookies(request, response);
  return { ok: true };
}

export async function logoutUser(request, response) {
  assertMutationRequest(request, { allowMissingCsrf: true });
  const accessToken = readCookie(request, ACCESS_COOKIE);
  const refreshToken = readCookie(request, REFRESH_COOKIE);
  const revoked = accessToken ? await revokeAccessToken(accessToken) : false;
  if (!revoked && refreshToken && hasSupabaseAuthConfig()) {
    try {
      const refreshed = normalizeSession(await supabaseAuthRequest("token?grant_type=refresh_token", {
        method: "POST",
        body: { refresh_token: refreshToken }
      }));
      if (refreshed?.accessToken) {
        await revokeAccessToken(refreshed.accessToken);
      }
    } catch {
      // Local cookies are still cleared when the remote session is already invalid or unavailable.
    }
  }
  clearSessionCookies(request, response);
  return { ok: true };
}

export async function getCurrentUser(request, response) {
  assertAuthConfigured();
  const session = await requireUser(request, response);
  const admin = await isAdminUser(session.user.id);
  return {
    authenticated: true,
    role: admin ? "admin" : "user",
    user: toPublicUser(session.user)
  };
}

export async function requireUser(request, response) {
  assertAuthConfigured();
  const accessToken = readCookie(request, ACCESS_COOKIE);
  if (accessToken) {
    const user = await fetchUser(accessToken, { allowUnauthorized: true });
    if (user) {
      return { accessToken, user };
    }
  }

  const refreshToken = readCookie(request, REFRESH_COOKIE);
  if (!refreshToken) {
    clearSessionCookies(request, response);
    throw httpError(401, "Log in to continue.");
  }

  let refreshed;
  try {
    refreshed = await supabaseAuthRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: refreshToken }
    });
  } catch (error) {
    clearSessionCookies(request, response);
    if ([400, 401].includes(error.supabaseStatus || error.status)) {
      throw httpError(401, "Your session has expired. Log in again.");
    }
    throw error;
  }

  const session = normalizeSession(refreshed);
  if (!session) {
    clearSessionCookies(request, response);
    throw httpError(401, "Your session has expired. Log in again.");
  }
  const user = refreshed.user || session.user || await fetchUser(session.accessToken);
  setSessionCookies(request, response, { ...session, user });
  return { accessToken: session.accessToken, user };
}

export async function requireAdmin(request, response) {
  const session = await requireUser(request, response);
  if (!await isAdminUser(session.user.id)) {
    throw httpError(403, "Admin authorization is required.");
  }
  return { ...session, role: "admin" };
}

export function assertMutationRequest(request, options = {}) {
  assertSameOrigin(request);
  const cookies = parseCookies(request);
  const expected = cookies[CSRF_COOKIE] || "";
  const supplied = String(getHeader(request, "x-csrf-token") || "");
  if (!expected && options.allowMissingCsrf) return;
  if (!expected || !supplied || !safeEqual(expected, supplied)) {
    throw httpError(403, "The security token is missing or invalid. Refresh the page and try again.");
  }
}

export function assertSameOrigin(request) {
  const fetchSite = String(getHeader(request, "sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") {
    throw httpError(403, "Cross-origin requests are not allowed.");
  }
  const origin = String(getHeader(request, "origin") || "").trim();
  if (!origin) return;

  let suppliedOrigin;
  try {
    suppliedOrigin = new URL(origin).origin;
  } catch {
    throw httpError(403, "Request origin is invalid.");
  }
  if (suppliedOrigin !== getApplicationOrigin(request)) {
    throw httpError(403, "Cross-origin requests are not allowed.");
  }
}

async function fetchUser(accessToken, options = {}) {
  try {
    const data = await supabaseAuthRequest("user", { accessToken });
    if (!data?.id) {
      throw httpError(401, "Your session is invalid. Log in again.");
    }
    return data;
  } catch (error) {
    if (options.allowUnauthorized && [400, 401].includes(error.supabaseStatus || error.status)) {
      return null;
    }
    if ([400, 401].includes(error.supabaseStatus || error.status)) {
      throw httpError(401, "Your session is invalid or expired. Log in again.");
    }
    throw error;
  }
}

async function isAdminUser(userId) {
  const rows = await supabaseServiceRequest(
    `admin_users?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return Array.isArray(rows) && rows.length === 1;
}

async function revokeAccessToken(accessToken) {
  try {
    await supabaseAuthRequest("logout", {
      method: "POST",
      accessToken
    });
    return true;
  } catch (error) {
    if (![400, 401, 403].includes(error.supabaseStatus || error.status)) {
      console.error("Supabase logout failed.", error);
    }
    return false;
  }
}

function normalizeSession(data = {}) {
  const source = data.session || data;
  const accessToken = String(source.access_token || "");
  const refreshToken = String(source.refresh_token || "");
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    expiresIn: Number(source.expires_in || 3600),
    user: source.user || data.user || null
  };
}

function setSessionCookies(request, response, session) {
  const secure = shouldUseSecureCookies(request);
  const csrfToken = readCookie(request, CSRF_COOKIE) || randomBytes(24).toString("base64url");
  appendSetCookie(response, serializeCookie(ACCESS_COOKIE, session.accessToken, {
    httpOnly: true,
    secure,
    maxAge: Math.max(60, Math.min(Number(session.expiresIn || 3600), 24 * 60 * 60))
  }));
  appendSetCookie(response, serializeCookie(REFRESH_COOKIE, session.refreshToken, {
    httpOnly: true,
    secure,
    maxAge: refreshCookieLifetimeSeconds
  }));
  appendSetCookie(response, serializeCookie(CSRF_COOKIE, csrfToken, {
    secure,
    maxAge: refreshCookieLifetimeSeconds
  }));
}

function clearSessionCookies(request, response) {
  if (!response || response.headersSent) return;
  const secure = shouldUseSecureCookies(request);
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE]) {
    appendSetCookie(response, serializeCookie(name, "", {
      httpOnly: name !== CSRF_COOKIE,
      secure,
      maxAge: 0
    }));
  }
}

function appendSetCookie(response, value) {
  if (!response || response.headersSent) return;
  const current = response.getHeader?.("Set-Cookie");
  const values = current ? (Array.isArray(current) ? current : [current]) : [];
  response.setHeader("Set-Cookie", [...values, value]);
}

function serializeCookie(name, value, options = {}) {
  return [
    `${name}=${encodeURIComponent(String(value || ""))}`,
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(options.maxAge || 0))}`,
    "SameSite=Lax",
    ...(options.httpOnly ? ["HttpOnly"] : []),
    ...(options.secure ? ["Secure"] : [])
  ].join("; ");
}

function parseCookies(request) {
  const source = String(getHeader(request, "cookie") || "");
  const cookies = {};
  for (const part of source.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

function readCookie(request, name) {
  return parseCookies(request)[name] || "";
}

function getHeader(request, name) {
  if (typeof request.headers?.get === "function") {
    return request.headers.get(name);
  }
  return request.headers?.[name] || request.headers?.[name.toLowerCase()] || "";
}

function getApplicationOrigin(request) {
  const configured = String(process.env.APP_ORIGIN || "").trim();
  if (configured) {
    let url;
    try {
      url = new URL(configured);
    } catch {
      throw httpError(503, "APP_ORIGIN must be a valid absolute URL.");
    }
    if (isHostedProduction() && url.protocol !== "https:") {
      throw httpError(503, "APP_ORIGIN must use HTTPS in production.");
    }
    return url.origin;
  }

  if (isHostedProduction()) {
    throw httpError(503, "APP_ORIGIN is required in production.");
  }

  const forwardedProto = String(getHeader(request, "x-forwarded-proto") || "").split(",")[0].trim();
  const forwardedHost = String(getHeader(request, "x-forwarded-host") || "").split(",")[0].trim();
  const protocol = forwardedProto || "http";
  const host = forwardedHost || String(getHeader(request, "host") || "localhost:3000");
  return new URL(`${protocol}://${host}`).origin;
}

function shouldUseSecureCookies(request) {
  const forwardedProto = String(getHeader(request, "x-forwarded-proto") || "").split(",")[0].trim();
  return isHostedProduction() || forwardedProto === "https";
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Enter a valid email address.");
  }
  return email;
}

function normalizeFullName(value) {
  const fullName = String(value || "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 120) {
    throw httpError(400, "Enter your full name.");
  }
  return fullName;
}

function validatePasswordPair(passwordInput, confirmationInput) {
  const password = String(passwordInput || "");
  const confirmation = String(confirmationInput || "");
  if (password.length < 8 || password.length > 128) {
    throw httpError(400, "Password must be between 8 and 128 characters.");
  }
  if (password !== confirmation) {
    throw httpError(400, "Passwords do not match.");
  }
  return password;
}

function toPublicUser(user = {}) {
  const fullName = String(user.user_metadata?.full_name || user.user_metadata?.name || "").trim();
  return {
    id: String(user.id || ""),
    fullName,
    name: fullName,
    email: String(user.email || "")
  };
}

function mapRegistrationError(error) {
  const status = error.supabaseStatus || error.status;
  const message = String(error.message || "");
  const code = String(error.supabaseCode || "");
  if ([400, 422].includes(status) && /already|registered|exists/i.test(message)) {
    return httpError(409, "An account with this email already exists.");
  }
  if (status === 429 || /rate limit|too many/i.test(message) || /over_.*rate_limit/i.test(code)) {
    return httpError(429, "Too many confirmation emails have been requested. Please wait a while before trying again, or use User Login if your account was already created.");
  }
  if ([400, 422].includes(status) && /signup.*disabled|signups?.*disabled|not allowed/i.test(message)) {
    return httpError(403, "New account registration is currently disabled.");
  }
  if ([400, 422].includes(status) && /password|weak|pwned|breach|leaked/i.test(message)) {
    return httpError(400, readableSupabaseSignupMessage(message, "Use a stronger password that meets the site requirements."));
  }
  if ([400, 422].includes(status) && /email|invalid/i.test(message)) {
    return httpError(400, readableSupabaseSignupMessage(message, "Enter a valid email address."));
  }
  if ([400, 422].includes(status)) {
    return httpError(400, readableSupabaseSignupMessage(message, "Unable to create the account. Check the email and password requirements."));
  }
  return error;
}

function readableSupabaseSignupMessage(message, fallback) {
  const detail = String(message || "")
    .replace(/^Supabase auth request failed:\s*/i, "")
    .replace(/^AuthApiError:\s*/i, "")
    .trim();
  if (!detail || /^status\s+\d+$/i.test(detail)) return fallback;

  if (/password/i.test(detail)) {
    return normalizeSentence(detail);
  }
  if (/email/i.test(detail)) {
    return normalizeSentence(detail);
  }
  return fallback;
}

function normalizeSentence(value) {
  const message = String(value || "").trim().replace(/\s+/g, " ");
  if (!message) return "";
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

function assertAuthConfigured() {
  if (!hasSupabaseAuthConfig()) {
    throw httpError(503, "Supabase Auth is not fully configured on this server.");
  }
}

function safeEqual(firstValue, secondValue) {
  const first = Buffer.from(String(firstValue || ""));
  const second = Buffer.from(String(secondValue || ""));
  return first.length === second.length && timingSafeEqual(first, second);
}
