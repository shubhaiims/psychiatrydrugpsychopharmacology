import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { httpError } from "./drug-model.js";

const fallbackSecret = randomBytes(32).toString("hex");
const tokenLifetimeMs = 12 * 60 * 60 * 1000;

export function loginWithPassword(password) {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    throw httpError(503, "Admin password is not configured on this server.");
  }
  if (String(password || "") !== adminPassword) {
    throw httpError(401, "Incorrect admin password.");
  }

  const expiresAt = Date.now() + tokenLifetimeMs;
  return {
    token: signToken({ sub: "admin", exp: expiresAt }),
    expiresAt
  };
}

export function requireAdmin(request) {
  if (!getAdminPassword()) {
    throw httpError(503, "Admin password is not configured on this server.");
  }

  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!verifyToken(token)) {
    throw httpError(401, "Unauthorized or expired admin token.");
  }
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
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
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(a, b) {
  const first = Buffer.from(a || "");
  const second = Buffer.from(b || "");
  return first.length === second.length && timingSafeEqual(first, second);
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || fallbackSecret;
}

