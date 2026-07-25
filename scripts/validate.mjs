import { readFile } from "node:fs/promises";

const requiredFiles = ["index.html", "styles.css", "app.js", "server/index.js", "server/data/drugs.json"];

for (const file of requiredFiles) {
  await readFile(file, "utf8");
}

const source = await readFile("server/data/drugs.json", "utf8");
const drugs = JSON.parse(source);
if (!Array.isArray(drugs)) {
  throw new Error("server/data/drugs.json must contain a JSON array.");
}

const requiredFields = ["id", "name", "className", "riskLevel", "therapeuticAreas"];
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

console.log(`Validated backend app and ${drugs.length} drug records.`);
