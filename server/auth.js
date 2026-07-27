import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { httpError } from "./drug-model.js";
import {
  deleteOtpChallenge,
  getOtpChallenge,
  getUserProfile,
  normalizePhone,
  normalizeUserProfile,
  publicUser,
  saveOtpChallenge,
  updateOtpAttempts,
  upsertUserProfile
} from "./user-store.js";

const fallbackSecret = randomBytes(32).toString("hex");
const adminTokenLifetimeMs = 12 * 60 * 60 * 1000;
const userTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const otpLifetimeMs = 10 * 60 * 1000;
const maxOtpAttempts = 5;

export function loginWithPassword(password) {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    throw httpError(503, "Admin password is not configured on this server.");
  }
  if (String(password || "") !== adminPassword) {
    throw httpError(401, "Incorrect admin password.");
  }

  const expiresAt = Date.now() + adminTokenLifetimeMs;
  return {
    token: signToken({ sub: "admin", role: "admin", exp: expiresAt }),
    expiresAt
  };
}

export async function requestUserOtp(input) {
  const profile = normalizeUserProfile(input);
  const otp = createOtp();
  const expiresAt = new Date(Date.now() + otpLifetimeMs).toISOString();
  await saveOtpChallenge({
    phone: profile.phone,
    profile,
    otpHash: hashOtp(profile.phone, otp),
    expiresAt,
    attempts: 0
  });

  const delivery = await deliverOtp(profile.phone, otp);
  return {
    ok: true,
    phone: profile.phone,
    expiresAt,
    delivery: delivery.channel,
    ...(delivery.devOtp ? { devOtp: delivery.devOtp } : {})
  };
}

export async function verifyUserOtp(input) {
  const phone = normalizePhone(input.phone);
  const code = String(input.otp || "").replace(/\D/g, "");
  if (code.length !== 6) {
    throw httpError(400, "Enter the 6-digit OTP.");
  }

  const challenge = await getOtpChallenge(phone);
  if (!challenge) {
    throw httpError(404, "Request a fresh OTP before logging in.");
  }
  if (Date.parse(challenge.expiresAt) <= Date.now()) {
    await deleteOtpChallenge(phone);
    throw httpError(410, "OTP expired. Request a fresh OTP.");
  }
  if (Number(challenge.attempts || 0) >= maxOtpAttempts) {
    await deleteOtpChallenge(phone);
    throw httpError(429, "Too many OTP attempts. Request a fresh OTP.");
  }
  if (challenge.otpHash !== hashOtp(phone, code)) {
    await updateOtpAttempts(phone, Number(challenge.attempts || 0) + 1);
    throw httpError(401, "Incorrect OTP.");
  }

  const verifiedAt = new Date().toISOString();
  const user = await upsertUserProfile({
    ...challenge.profile,
    phone,
    phoneVerifiedAt: verifiedAt
  });
  await deleteOtpChallenge(phone);

  const expiresAt = Date.now() + userTokenLifetimeMs;
  return {
    token: signToken({ sub: user.phone, role: "user", phone: user.phone, exp: expiresAt }),
    expiresAt,
    user: publicUser(user)
  };
}

export async function getCurrentUser(request) {
  const payload = verifyBearerToken(request);
  if (!payload) {
    throw httpError(401, "Log in with phone OTP to continue.");
  }
  if (payload.role === "admin") {
    return { role: "admin", user: { name: "Admin", phone: "", phoneVerifiedAt: "" } };
  }
  if (payload.role !== "user" || !payload.phone) {
    throw httpError(401, "Log in with phone OTP to continue.");
  }
  const user = await getUserProfile(payload.phone);
  if (!user?.phoneVerifiedAt) {
    throw httpError(401, "Log in with phone OTP to continue.");
  }
  return { role: "user", user: publicUser(user) };
}

export function requireAdmin(request) {
  if (!getAdminPassword()) {
    throw httpError(503, "Admin password is not configured on this server.");
  }

  const payload = verifyBearerToken(request);
  if (payload?.role !== "admin") {
    throw httpError(401, "Unauthorized or expired admin token.");
  }
}

export function requireDashboardAccess(request) {
  const payload = verifyBearerToken(request);
  if (payload?.role === "admin" || payload?.role === "user") {
    return payload;
  }
  throw httpError(401, "Log in with phone OTP to read the drug library.");
}

export function isAdminConfigured() {
  return Boolean(getAdminPassword());
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
}

function verifyBearerToken(request) {
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !token.includes(".")) return false;
  const [body, signature] = token.split(".");
  const expected = sign(body);
  if (!safeEqual(signature, expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!["admin", "user"].includes(payload.role)) return false;
    if (Number(payload.exp) <= Date.now()) return false;
    return payload;
  } catch {
    return false;
  }
}

function createOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOtp(phone, otp) {
  return createHmac("sha256", getSessionSecret())
    .update(`${phone}:${otp}`)
    .digest("base64url");
}

async function deliverOtp(phone, otp) {
  const webhookUrl = process.env.OTP_WEBHOOK_URL || "";
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OTP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.OTP_WEBHOOK_TOKEN}` } : {})
      },
      body: JSON.stringify({
        phone,
        otp,
        message: `Your Psychiatry Made Easy OTP is ${otp}. It expires in 10 minutes.`
      })
    });
    if (!response.ok) {
      throw httpError(502, "OTP gateway failed to send the code.");
    }
    return { channel: "sms-gateway" };
  }

  if (allowDevelopmentOtp()) {
    console.log(`Development OTP for ${phone}: ${otp}`);
    return { channel: "development", devOtp: otp };
  }

  throw httpError(503, "OTP gateway is not configured. Add OTP_WEBHOOK_URL before enabling user login.");
}

function allowDevelopmentOtp() {
  return process.env.OTP_DEV_MODE === "true" || (!process.env.OTP_WEBHOOK_URL && process.env.NODE_ENV !== "production");
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
