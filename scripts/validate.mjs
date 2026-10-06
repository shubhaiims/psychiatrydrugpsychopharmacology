import { readdir, readFile } from "node:fs/promises";

const requiredFiles = [
  "public/index.html",
  "public/browse.html",
  "public/landing.css",
  "public/landing.js",
  "public/subscribe.html",
  "public/subscribe.js",
  "public/account.html",
  "public/account.js",
  "public/terms.html",
  "public/privacy.html",
  "public/refunds.html",
  "public/contact.html",
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
  "server/adverse-effects.html",
  "public/adverse-effects.js",
  "public/adverse-effects.css",
  "server/admin.html",
  "server/index.js",
  "server/account.js",
  "server/members.js",
  "api/health.js",
  "server/data/drugs.json",
  "server/data/adverse-effects.json",
  "supabase/schema.sql",
  "supabase/migrations/202608150000_existing_storage_schema.sql",
  "supabase/migrations/202608150001_auth_profiles_and_admins.sql",
  "supabase/migrations/202608150002_authorization_policies.sql",
  "supabase/migrations/202608150003_drop_legacy_mobile_otp.sql",
  "supabase/migrations/20260815061242_harden_public_defaults_and_indexes.sql",
  "supabase/migrations/202610020001_memberships_and_payments.sql",
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

if (drugs.length !== 79) {
  throw new Error(`Expected all 79 drug records, found ${drugs.length}.`);
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

const adverseEffects = JSON.parse(await readFile("server/data/adverse-effects.json", "utf8"));
const systemIds = new Set(adverseEffects.systems.map((system) => system.id));
const topicIds = new Set();
for (const topic of adverseEffects.topics) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(topic.id)) {
    throw new Error(`Adverse-effect id must be lowercase words joined by hyphens: ${topic.id}`);
  }
  if (topicIds.has(topic.id)) {
    throw new Error(`Duplicate adverse-effect id found: ${topic.id}`);
  }
  topicIds.add(topic.id);
  if (!topic.name || !systemIds.has(topic.system) || ![1, 2, 3].includes(topic.tier)) {
    throw new Error(`Adverse-effect topic ${topic.id} needs a name, a known system and tier 1-3.`);
  }
  for (const drugId of topic.exampleDrugs) {
    if (!ids.has(drugId)) {
      throw new Error(`Adverse-effect topic ${topic.id} references unknown drug id: ${drugId}`);
    }
  }
}
for (const entry of adverseEffects.drugPageOnly) {
  if (!ids.has(entry.drug)) {
    throw new Error(`Drug-page-only adverse effect references unknown drug id: ${entry.drug}`);
  }
}

const topicFiles = (await readdir("server/data/adverse-effects")).filter((file) => file.endsWith(".json"));
for (const file of topicFiles) {
  const topic = JSON.parse(await readFile(`server/data/adverse-effects/${file}`, "utf8"));
  if (`${topic.id}.json` !== file || !topicIds.has(topic.id)) {
    throw new Error(`Adverse-effect content file ${file} must be named after a topic id in adverse-effects.json.`);
  }
  const ratedDrugs = new Set();
  for (const rating of topic.drugRatings || []) {
    // Library drugs are referenced by id; drugs outside the library carry a plain name.
    if (rating.drug ? !ids.has(rating.drug) : !rating.name) {
      throw new Error(`${file} rates unknown drug id: ${rating.drug || "(missing name)"}`);
    }
    if (!Object.hasOwn(topic.ratingScale || {}, rating.rating)) {
      throw new Error(`${file} uses a rating not in its ratingScale: ${rating.rating}`);
    }
    const ratedKey = rating.drug || rating.name;
    if (ratedDrugs.has(ratedKey)) {
      throw new Error(`${file} rates ${ratedKey} more than once.`);
    }
    ratedDrugs.add(ratedKey);
  }
}

const browserFiles = [
  "public/index.html",
  "public/browse.html",
  "public/login.html",
  "public/register.html",
  "public/forgot-password.html",
  "public/reset-password.html",
  "public/admin-login.html",
  "public/app.js",
  "public/admin.js",
  "public/auth.js",
  "public/landing.js",
  "public/subscribe.html",
  "public/subscribe.js",
  "public/account.html",
  "public/account.js"
];
for (const file of browserFiles) {
  const browserSource = await readFile(file, "utf8");
  if (/SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)|RAZORPAY_KEY_SECRET/.test(browserSource)) {
    throw new Error(`Backend-only key name found in browser asset: ${file}`);
  }
}

JSON.parse(await readFile("vercel.json", "utf8"));

// "/" is the public landing page; the browse experience lives at "/browse"
const homepage = await readFile("public/index.html", "utf8");
const browsePage = await readFile("public/browse.html", "utf8");

for (const [file, page] of [["public/index.html", homepage], ["public/browse.html", browsePage]]) {
  if (/href=["']\/admin(?:\/login)?["']/i.test(page)) {
    throw new Error(`${file} must not expose an admin login link.`);
  }

  if (/dashboard-page-head|dashboard-stats|dashboard-grid-2|statUpdated|recentUpdatesCard|bookmarksCard|Last updated|Recently updated/i.test(page)) {
    throw new Error(`${file} must not include dashboard summaries or update dates.`);
  }
}

if (!/<h1[^>]*>Browse the drug library<\/h1>/i.test(browsePage) || !/id=["']classChips["']/i.test(browsePage)) {
  throw new Error("The browse page must retain the drug-library browse experience.");
}

if (!/href=["']\/browse["']/i.test(homepage)) {
  throw new Error("The public homepage must link to the drug-library browse page.");
}

for (const file of ["public/index.html", "public/browse.html", "public/formulas.html", "public/qtc.html"]) {
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

// Vercel's free plan allows 12 serverless functions; extra routes go through an existing [action].js
const functionFiles = (await readdir("api", { recursive: true })).filter((file) => file.endsWith(".js"));
if (functionFiles.length > 12) {
  throw new Error(`api/ has ${functionFiles.length} functions but Vercel's free plan allows 12. Serve new routes from an existing [action].js handler.`);
}

// Pages that run under the strict Content-Security-Policy and must stay public-safe
const strictPages = [
  "public/account.html",
  "public/terms.html",
  "public/privacy.html",
  "public/refunds.html",
  "public/contact.html"
];
for (const file of strictPages) {
  const page = await readFile(file, "utf8");
  if (/<script(?![^>]*\ssrc=)/i.test(page) || /<style[\s>]/i.test(page) || /\sstyle=["']/i.test(page)) {
    throw new Error(`${file} must not use inline scripts or styles.`);
  }
  if (/(?:src|href|action)=["']https?:\/\//i.test(page)) {
    throw new Error(`${file} must not load or link to external hosts.`);
  }
  if (/href=["']\/admin(?:\/login)?["']/i.test(page)) {
    throw new Error(`${file} must not expose an admin link.`);
  }
  if (/Last updated|Recently updated|Last reviewed/i.test(page)) {
    throw new Error(`${file} must not show update or review dates.`);
  }
}

console.log(`Validated backend app and ${drugs.length} drug records.`);
