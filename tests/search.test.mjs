import test from "node:test";
import assert from "node:assert/strict";
import { pages, plain, drugDocuments, findMatches, excerpt } from "../public/search-index.js";

test("research is excluded from the page allowlist", () => {
  assert.ok(pages.every(([path]) => !path.includes("research")));
});
test("all matches are returned, including nested content", () => {
  const docs = Array.from({ length: 30 }, (_, i) => ({ page: "Medicine", title: String(i), text: plain({ warning: ["Severe nausea"] }) }));
  assert.equal(findMatches(docs, "severe NAUSEA").length, 30);
  assert.equal(findMatches(docs, "nausea hallucinations").length, 0);
  assert.equal(findMatches(docs, " ").length, 0);
});
test("monograph matches link to the corresponding section with an encoded drug ID", () => {
  const docs = drugDocuments({ id: "drug & name", name: "Medicine", sideEffects: "Nausea" });
  assert.equal(docs[0].href, "/library?drug=drug%20%26%20name#section-sideEffects");
  assert.equal(findMatches(docs, "nausea").length, 1);
});
test("snippet includes a matching word deep in content", () => {
  assert.ok(excerpt("prefix ".repeat(200) + "hyponatremia warning", "hyponatremia").includes("hyponatremia"));
});
