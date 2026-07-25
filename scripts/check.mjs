import { spawnSync } from "node:child_process";

const files = [
  "public/app.js",
  "public/admin.js",
  "server/index.js",
  "server/drug-model.js",
  "server/http.js",
  "server/auth.js",
  "server/store.js",
  "api/drugs.js",
  "api/auth/login.js",
  "api/drugs/[id].js",
  "scripts/validate.mjs",
  "scripts/push-to-supabase.mjs"
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Checked ${files.length} JavaScript files.`);
