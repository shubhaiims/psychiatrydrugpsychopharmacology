import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

loadDotEnv(".env");
const { replaceDrugs } = await import("../server/store.js");

const source = await readFile("server/data/drugs.json", "utf8");
const drugs = JSON.parse(source);

if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running npm run supabase:push.");
}

const saved = await replaceDrugs(drugs);
console.log(`Uploaded ${saved.length} drug records to Supabase.`);

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
