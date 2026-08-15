import { readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/login.html",
  "public/register.html",
  "public/forgot-password.html",
  "public/reset-password.html",
  "public/admin-login.html",
  "public/styles.css",
  "public/app.js",
  "public/admin.js",
  "public/auth.js",
  "server/library.html",
  "server/admin.html",
  "server/index.js",
  "server/data/drugs.json",
  "supabase/schema.sql",
  "supabase/migrations/202608150000_existing_storage_schema.sql",
  "supabase/migrations/202608150001_auth_profiles_and_admins.sql",
  "supabase/migrations/202608150002_authorization_policies.sql",
  "supabase/migrations/202608150003_drop_legacy_mobile_otp.sql",
  "vercel.json",
  ".github/workflows/sync-supabase.yml"
];

for (const file of requiredFiles) {
  await readFile(file, "utf8");
}

const source = await readFile("server/data/drugs.json", "utf8");
const drugs = JSON.parse(source);
if (!Array.isArray(drugs)) {
  throw new Error("server/data/drugs.json must contain a JSON array.");
}

if (drugs.length !== 61) {
  throw new Error(`Expected all 61 drug records, found ${drugs.length}.`);
}

const requiredFields = ["id", "name", "classification", "riskLevel"];
const ids = new Set();

for (const drug of drugs) {
  for (const field of requiredFields) {
    if (!drug[field] || (Array.isArray(drug[field]) && drug[field].length === 0)) {
      throw new Error(`Drug record is missing required field: ${field}`);
    }
  }
  if (ids.has(drug.id)) {
    throw new Error(`Duplicate drug id found: ${drug.id}`);
  }
  ids.add(drug.id);
}

const browserFiles = [
  "public/index.html",
  "public/login.html",
  "public/register.html",
  "public/forgot-password.html",
  "public/reset-password.html",
  "public/admin-login.html",
  "public/app.js",
  "public/admin.js",
  "public/auth.js"
];
for (const file of browserFiles) {
  const browserSource = await readFile(file, "utf8");
  if (/SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)/.test(browserSource)) {
    throw new Error(`Backend-only Supabase key name found in browser asset: ${file}`);
  }
}

JSON.parse(await readFile("vercel.json", "utf8"));

const homepage = await readFile("public/index.html", "utf8");
if (/href=["']\/admin(?:\/login)?["']/i.test(homepage)) {
  throw new Error("The public homepage must not expose an admin login link.");
}

const userLoginPage = await readFile("public/login.html", "utf8");
if (/href=["']\/admin(?:\/login)?["']/i.test(userLoginPage)) {
  throw new Error("The user login page must not expose an admin login link.");
}

const activeSqlFiles = [
  "supabase/schema.sql",
  "supabase/migrations/202608150000_existing_storage_schema.sql",
  "supabase/migrations/202608150001_auth_profiles_and_admins.sql",
  "supabase/migrations/202608150002_authorization_policies.sql"
];
for (const file of activeSqlFiles) {
  const sql = await readFile(file, "utf8");
  if (/\buser_otps\b|\buser_profiles\b|\botp_hash\b|\bphone\s+text\b/i.test(sql)) {
    throw new Error(`Legacy mobile OTP storage found in active SQL: ${file}`);
  }
}

console.log(`Validated backend app and ${drugs.length} drug records.`);
