import { spawnSync } from "node:child_process";

const files = [
  "public/app.js",
  "public/admin.js",
  "public/auth.js",
  "server/index.js",
  "server/drug-model.js",
  "server/http.js",
  "server/auth.js",
  "server/pages.js",
  "server/supabase.js",
  "server/store.js",
  "server/notebook-store.js",
  "api/drugs.js",
  "api/auth/login.js",
  "api/auth/register.js",
  "api/auth/logout.js",
  "api/auth/forgot-password.js",
  "api/auth/reset-password.js",
  "api/auth/session.js",
  "api/auth/me.js",
  "api/admin/login.js",
  "api/admin/page.js",
  "api/pages/library.js",
  "api/drugs/[id].js",
  "api/notebook/sources.js",
  "api/notebook/sources/[id].js",
  "api/notebook/search.js",
  "scripts/validate.mjs",
  "scripts/push-to-supabase.mjs",
  "tests/auth.test.mjs"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
