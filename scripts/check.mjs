import { spawnSync } from "node:child_process";

const files = [
  "middleware.js",
  "security/request-filter.js",
  "server/security.js",
  "tests/security.test.mjs",
  "tests/request-filter.test.mjs",
  "public/app.js",
  "public/admin.js",
  "public/auth.js",
  "public/home.js",
  "public/formulas.js",
  "public/qtc.js",
  "public/research.js",
  "scripts/fetch-research.mjs",
  "tests/research.test.mjs",
  "public/landing.js",
  "public/search.js",
  "public/search-index.js",
  "tests/search.test.mjs",
  "public/subscribe.js",
  "public/account.js",
  "server/index.js",
  "server/drug-model.js",
  "server/dashboard.js",
  "server/http.js",
  "server/auth.js",
  "server/pages.js",
  "server/supabase.js",
  "server/store.js",
  "server/notebook-store.js",
  "server/billing.js",
  "server/account.js",
  "server/members.js",
  "api/drugs.js",
  "api/dashboard.js",
  "api/health.js",
  "api/auth/[action].js",
  "api/admin/login.js",
  "api/admin/page.js",
  "api/pages/[page].js",
  "public/adverse-effects.js",
  "api/drugs/[id].js",
  "api/notebook/sources.js",
  "api/notebook/sources/[id].js",
  "api/notebook/search.js",
  "api/billing/[action].js",
  "scripts/validate.mjs",
  "scripts/push-to-supabase.mjs",
  "tests/auth.test.mjs",
  "tests/billing.test.mjs",
  "tests/account.test.mjs",
  "tests/members.test.mjs"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
