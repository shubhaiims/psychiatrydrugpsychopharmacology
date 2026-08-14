import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

// Manual seed/disaster-recovery operation only: this deletes every row in
// public.drugs before inserting server/data/drugs.json. Never run it as part of
// a normal deployment or an automatic push workflow.
const requiredConfirmation = "REPLACE_ALL_SUPABASE_DRUGS";
if (process.env.CONFIRM_SUPABASE_DRUG_REPLACE !== requiredConfirmation) {
  throw new Error(
    `Refusing to replace public.drugs. Set CONFIRM_SUPABASE_DRUG_REPLACE=${requiredConfirmation} only for a deliberate full-table replacement.`
  );
}

loadDotEnv(".env");

if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) before running npm run supabase:push.");
}

const { replaceDrugs } = await import("../server/store.js");
const source = await readFile("server/data/drugs.json", "utf8");
const drugs = JSON.parse(source);
const saved = await replaceDrugs(drugs);
console.log(`Replaced public.drugs with ${saved.length} records from server/data/drugs.json.`);

function loadDotEnv(filePath) {
  try {
    const source = readFileSync(filePath, "utf8");
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...rest] = trimmed.split("=");
      if (process.env[key]) continue;
      process.env[key] = rest.join("=").trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env is optional in GitHub Actions and Vercel.
  }
}
