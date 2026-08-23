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
  "api/health.js",
  "server/data/drugs.json",
  "supabase/schema.sql",
  "supabase/migrations/202608150000_existing_storage_schema.sql",
  "supabase/migrations/202608150001_auth_profiles_and_admins.sql",
  "supabase/migrations/202608150002_authorization_policies.sql",
  "supabase/migrations/202608150003_drop_legacy_mobile_otp.sql",
  "supabase/migrations/20260815061242_harden_public_defaults_and_indexes.sql",
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

if (drugs.length !== 69) {
  throw new Error(`Expected all 69 drug records, found ${drugs.length}.`);
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

if (/dashboard-page-head|dashboard-stats|dashboard-grid-2|statUpdated|recentUpdatesCard|bookmarksCard|Last updated|Recently updated/i.test(homepage)) {
  throw new Error("The public homepage must not include dashboard summaries or update dates.");
}

if (!/<h1[^>]*>Browse the drug library<\/h1>/i.test(homepage) || !/id=["']classChips["']/i.test(homepage)) {
  throw new Error("The public homepage must retain the drug-library browse experience.");
}

for (const file of ["public/index.html", "public/formulas.html", "public/qtc.html"]) {
  const page = await readFile(file, "utf8");
  if (/recentUpdatesCard|bookmarksCard|>\s*(?:Dashboard|Updates|Bookmarks)\s*</i.test(page)) {
    throw new Error(`${file} must not expose removed dashboard navigation.`);
  }
}

const publicLibraryScript = await readFile("public/app.js", "utf8");
if (/\b(?:updatedAt|lastReviewed|formatDate)\b/.test(publicLibraryScript)) {
  throw new Error("The public drug library must not include review or update-date presentation.");
}

const homepageScript = await readFile("public/home.js", "utf8");
if (/statUpdated|recentUpdates|lastUpdated|renderStats|renderRecentUpdates|formatDate/.test(homepageScript)) {
  throw new Error("The homepage script must not restore dashboard summaries or update dates.");
}

const dashboardDataSource = await readFile("server/dashboard.js", "utf8");
if (/\b(?:lastUpdated|recent|updatedAt|lastReviewed)\b/.test(dashboardDataSource)) {
  throw new Error("The public homepage data must not include update-date fields.");
}

const dashboardStyles = await readFile("public/styles.css", "utf8");
if (!/\.dashboard-nav-subgroup\[hidden\]\s*\{[^}]*display:\s*none\s*;/s.test(dashboardStyles)) {
  throw new Error("Collapsed dashboard navigation subgroups must be hidden by CSS.");
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
