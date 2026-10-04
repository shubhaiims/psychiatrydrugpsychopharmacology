import assert from "node:assert/strict";
import { test } from "node:test";
import { buildQuery, mergeItems, normalizeSummary } from "../scripts/fetch-research.mjs";

const record = {
  uid: "123",
  title: "Esketamine for <i>treatment-resistant</i> depression.",
  fulljournalname: "JAMA Psychiatry",
  sortpubdate: "2026/09/29 00:00",
  authors: [{ name: "Doe J" }, { name: "Roe R" }, { name: "Poe P" }],
  articleids: [{ idtype: "pubmed", value: "123" }, { idtype: "doi", value: "10.1001/example" }]
};

test("PubMed summaries become feed items that link to the journal via DOI", () => {
  assert.deepEqual(normalizeSummary(record), {
    id: "123",
    title: "Esketamine for treatment-resistant depression",
    journal: "JAMA Psychiatry",
    date: "2026-09-29",
    authors: "Doe J et al.",
    url: "https://doi.org/10.1001/example"
  });
});

test("records without a DOI fall back to PubMed and invalid records are dropped", () => {
  assert.equal(normalizeSummary({ ...record, articleids: [] }).url, "https://pubmed.ncbi.nlm.nih.gov/123/");
  assert.equal(normalizeSummary({ uid: "9", title: "", sortpubdate: "2026/01/01" }), null);
  assert.equal(normalizeSummary(undefined), null);
});

test("merging dedupes by id, keeps newest first and drops papers older than six months", () => {
  const now = new Date("2026-10-04T00:00:00Z");
  const expired = { id: "0", title: "Expired", date: "2026-03-01" };
  const old = { id: "1", title: "Old", date: "2026-05-01" };
  const fresh = { id: "2", title: "New", date: "2026-09-01" };
  assert.deepEqual(mergeItems([expired, old, { ...fresh, title: "Stale" }], [fresh], now).map((item) => item.title), ["New", "Old"]);
});

test("query restricts to journal articles and excludes editorials", () => {
  const query = buildQuery();
  assert.match(query, /"JAMA Psychiatry"\[ta\]/);
  assert.match(query, /"Bipolar Disord"\[ta\]/);
  for (const journal of ["JAMA Psychiatry", "Lancet Psychiatry", "Am J Psychiatry", "J Psychopharmacol"]) {
    assert.ok(query.includes(`"${journal}"[ta]`), journal);
  }
  assert.doesNotMatch(query, /Psychiatry Res/);
  assert.match(query, /"N Engl J Med"\[ta\]\) AND \(psychiatr/);
  assert.doesNotMatch(query, /"Lancet"\[ta\]|BMJ|"JAMA"\[ta\]/);
  assert.match(query, /NOT \(editorial\[pt\]/);
});
