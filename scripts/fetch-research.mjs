// Refreshes public/research.json with recent psychiatry papers from PubMed (NCBI E-utilities).
// Run by .github/workflows/update-research.yml; safe to run locally with `npm run research:update`.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const OUTPUT = new URL("../public/research.json", import.meta.url);
const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const LOOKBACK_DAYS = 14;
const MAX_NEW = 60;
const MAX_KEPT = 120;

const PSYCHIATRY_JOURNALS = ["JAMA Psychiatry", "Bipolar Disord", "Psychiatry Res"];
// NEJM is general medicine, so only its psychiatry-topic papers are included.
const GENERAL_JOURNALS = ["N Engl J Med"];
const GENERAL_TOPICS = [
  "psychiatr*", "depress*", "schizophren*", "bipolar", "antidepressant*", "antipsychotic*",
  "anxiety", "ADHD", "suicid*", "psychosis", "lithium", "ketamine", "esketamine"
];

export function buildQuery() {
  const psychiatry = PSYCHIATRY_JOURNALS.map((name) => `"${name}"[ta]`).join(" OR ");
  const general = GENERAL_JOURNALS.map((name) => `"${name}"[ta]`).join(" OR ");
  const topics = GENERAL_TOPICS.map((term) => `${term}[tiab]`).join(" OR ");
  return `((${psychiatry}) OR ((${general}) AND (${topics}))) AND hasabstract AND "journal article"[pt] ` +
    "NOT (editorial[pt] OR comment[pt] OR letter[pt] OR news[pt] OR retracted publication[pt])";
}

export function normalizeSummary(record) {
  if (!record?.uid) return null;
  const title = String(record.title || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  const doi = (record.articleids || []).find((id) => id.idtype === "doi")?.value;
  const date = parseDate(record.sortpubdate || record.epubdate || record.pubdate);
  if (!title || !date) return null;
  const authors = (record.authors || []).filter((author) => author.authtype !== "CollectiveName" || author.name).map((author) => author.name);
  return {
    id: String(record.uid),
    title,
    journal: String(record.fulljournalname || record.source || "").trim(),
    date,
    authors: authors.length > 2 ? `${authors[0]} et al.` : authors.join(" and "),
    url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${record.uid}/`
  };
}

function parseDate(value) {
  const match = String(value || "").match(/(\d{4})[/ -](\d{1,2}|[A-Za-z]{3})?[/ -]?(\d{1,2})?/);
  if (!match) return null;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const month = /^\d+$/.test(match[2] || "") ? Number(match[2]) : months[String(match[2] || "jan").toLowerCase()] || 1;
  const day = Number(match[3] || 1);
  return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mergeItems(existing, incoming) {
  const byId = new Map();
  for (const item of [...existing, ...incoming]) byId.set(item.id, item);
  return [...byId.values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
    .slice(0, MAX_KEPT);
}

async function eutils(path, params) {
  const query = new URLSearchParams({ retmode: "json", tool: "psychiatry-made-easy", ...params });
  if (process.env.NCBI_API_KEY) query.set("api_key", process.env.NCBI_API_KEY);
  const response = await fetch(`${EUTILS}/${path}?${query}`, { headers: { "User-Agent": "psychiatry-made-easy-research-feed" } });
  if (!response.ok) throw new Error(`PubMed ${path} failed with status ${response.status}.`);
  return response.json();
}

async function main() {
  const search = await eutils("esearch.fcgi", {
    db: "pubmed", term: buildQuery(), datetype: "edat", reldate: String(LOOKBACK_DAYS),
    retmax: String(MAX_NEW), sort: "date"
  });
  const ids = search.esearchresult?.idlist || [];
  let incoming = [];
  if (ids.length) {
    const summary = await eutils("esummary.fcgi", { db: "pubmed", id: ids.join(",") });
    incoming = ids.map((id) => normalizeSummary(summary.result?.[id])).filter(Boolean);
  }

  let existing = [];
  try {
    existing = JSON.parse(await readFile(OUTPUT, "utf8")).items || [];
  } catch {
    // First run: no previous file.
  }
  const items = mergeItems(existing, incoming);
  await writeFile(OUTPUT, `${JSON.stringify({ updated: new Date().toISOString(), source: "PubMed", items }, null, 2)}\n`);
  console.log(`Fetched ${incoming.length} new records; ${items.length} kept.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
