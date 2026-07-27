import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { httpError } from "./drug-model.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function normalizePhone(input) {
  const raw = String(input || "").trim();
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw httpError(400, "Enter a valid phone number with country code if possible.");
  }
  return hasPlus ? `+${digits}` : digits;
}

export function normalizeUserProfile(input = {}) {
  const phone = normalizePhone(input.phone);
  const name = String(input.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw httpError(400, "Enter your full name before requesting an OTP.");
  }

  return {
    id: `user_${phone.replace(/\D/g, "")}`,
    name,
    phone,
    createdAt: String(input.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    phoneVerifiedAt: input.phoneVerifiedAt ? String(input.phoneVerifiedAt) : ""
  };
}

export async function upsertUserProfile(input) {
  const profile = normalizeUserProfile(input);
  const existing = await getUserProfile(profile.phone);
  const record = {
    ...existing,
    ...profile,
    createdAt: existing?.createdAt || profile.createdAt,
    phoneVerifiedAt: profile.phoneVerifiedAt || existing?.phoneVerifiedAt || ""
  };

  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest("user_profiles?on_conflict=phone", {
      method: "POST",
      body: toUserRow(record),
      headers: { Prefer: "resolution=merge-duplicates,return=representation" }
    });
    return fromUserRow(rows[0]);
  }

  const users = await readLocalArray(getUsersFile());
  const index = users.findIndex((user) => user.phone === record.phone);
  if (index >= 0) {
    users[index] = record;
  } else {
    users.push(record);
  }
  await writeLocalArray(getUsersFile(), users);
  return record;
}

export async function getUserProfile(phoneInput) {
  const phone = normalizePhone(phoneInput);
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`user_profiles?phone=eq.${encodeURIComponent(phone)}&select=*`);
    return rows[0] ? fromUserRow(rows[0]) : null;
  }

  const users = await readLocalArray(getUsersFile());
  return users.find((user) => user.phone === phone) || null;
}

export async function saveOtpChallenge(challenge) {
  const record = {
    phone: normalizePhone(challenge.phone),
    otpHash: String(challenge.otpHash || ""),
    profile: normalizeUserProfile(challenge.profile || challenge),
    attempts: Number(challenge.attempts || 0),
    expiresAt: String(challenge.expiresAt || ""),
    createdAt: new Date().toISOString()
  };
  if (!record.otpHash || !record.expiresAt) {
    throw httpError(500, "OTP challenge is incomplete.");
  }

  if (hasSupabaseConfig()) {
    await supabaseRequest("user_otps?on_conflict=phone", {
      method: "POST",
      body: toOtpRow(record),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" }
    });
    return record;
  }

  const challenges = await readLocalArray(getOtpsFile());
  const index = challenges.findIndex((item) => item.phone === record.phone);
  if (index >= 0) {
    challenges[index] = record;
  } else {
    challenges.push(record);
  }
  await writeLocalArray(getOtpsFile(), challenges);
  return record;
}

export async function getOtpChallenge(phoneInput) {
  const phone = normalizePhone(phoneInput);
  if (hasSupabaseConfig()) {
    const rows = await supabaseRequest(`user_otps?phone=eq.${encodeURIComponent(phone)}&select=*`);
    return rows[0] ? fromOtpRow(rows[0]) : null;
  }

  const challenges = await readLocalArray(getOtpsFile());
  return challenges.find((item) => item.phone === phone) || null;
}

export async function updateOtpAttempts(phoneInput, attempts) {
  const phone = normalizePhone(phoneInput);
  if (hasSupabaseConfig()) {
    await supabaseRequest(`user_otps?phone=eq.${encodeURIComponent(phone)}`, {
      method: "PATCH",
      body: { attempts: Number(attempts || 0) },
      headers: { Prefer: "return=minimal" }
    });
    return;
  }

  const challenges = await readLocalArray(getOtpsFile());
  const index = challenges.findIndex((item) => item.phone === phone);
  if (index >= 0) {
    challenges[index] = { ...challenges[index], attempts: Number(attempts || 0) };
    await writeLocalArray(getOtpsFile(), challenges);
  }
}

export async function deleteOtpChallenge(phoneInput) {
  const phone = normalizePhone(phoneInput);
  if (hasSupabaseConfig()) {
    await supabaseRequest(`user_otps?phone=eq.${encodeURIComponent(phone)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return;
  }

  const challenges = await readLocalArray(getOtpsFile());
  await writeLocalArray(getOtpsFile(), challenges.filter((item) => item.phone !== phone));
}

export function publicUser(profile = {}) {
  return {
    name: String(profile.name || ""),
    phone: String(profile.phone || ""),
    phoneVerifiedAt: String(profile.phoneVerifiedAt || "")
  };
}

function hasSupabaseConfig() {
  return Boolean(getSupabaseUrl() && getSupabaseKey());
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${getSupabaseUrl()}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: getSupabaseKey(),
      Authorization: `Bearer ${getSupabaseKey()}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.hint || text || `status ${response.status}`;
    throw httpError(response.status, `Supabase request failed: ${detail}`);
  }
  return data || [];
}

async function readLocalArray(filePath) {
  try {
    const source = await readFile(filePath, "utf8");
    const parsed = JSON.parse(source);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalArray(filePath, records) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempFile = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await rename(tempFile, filePath);
}

function toUserRow(profile) {
  return {
    id: profile.id,
    phone: profile.phone,
    name: profile.name,
    payload: profile,
    updated_at: new Date().toISOString()
  };
}

function fromUserRow(row = {}) {
  const payload = row.payload || {};
  return {
    id: row.id || payload.id,
    phone: row.phone || payload.phone,
    name: row.name || payload.name,
    createdAt: payload.createdAt || String(row.created_at || row.updated_at || ""),
    updatedAt: payload.updatedAt || String(row.updated_at || ""),
    phoneVerifiedAt: payload.phoneVerifiedAt || String(row.phone_verified_at || "")
  };
}

function toOtpRow(challenge) {
  return {
    phone: challenge.phone,
    otp_hash: challenge.otpHash,
    attempts: challenge.attempts,
    expires_at: challenge.expiresAt,
    profile_payload: challenge.profile,
    created_at: challenge.createdAt
  };
}

function fromOtpRow(row = {}) {
  return {
    phone: row.phone,
    otpHash: row.otp_hash,
    attempts: Number(row.attempts || 0),
    expiresAt: String(row.expires_at || ""),
    profile: row.profile_payload || {},
    createdAt: String(row.created_at || "")
  };
}

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
}

function getSupabaseKey() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function getUsersFile() {
  return resolve(process.env.USERS_FILE || join(__dirname, "data", "users.json"));
}

function getOtpsFile() {
  return resolve(process.env.OTPS_FILE || join(__dirname, "data", "user-otps.json"));
}
