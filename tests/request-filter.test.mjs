import assert from "node:assert/strict";
import { test } from "node:test";
import middleware from "../middleware.js";
import { filterRequest } from "../security/request-filter.js";

const origin = "https://www.psychiatrymadeeasy.com";
function request(path, options = {}) { return new Request(origin + path, options); }

test("private file probes including encoded paths are blocked", () => {
  for (const path of ["/.env", "/.env.production", "/.git/config", "/server/data/drugs.json", "/supabase/schema.sql", "/package.json", "/security/request-filter.js", "/%2eenv", "/%252eenv"]) {
    const response = filterRequest(request(path));
    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("normal pages, payment script and assets remain accessible", () => {
  for (const path of ["/", "/subscribe", "/login", "/library", "/admin", "/subscribe.js", "/assets/landing/logo-mark-64.png", "/.well-known/security.txt"]) {
    assert.equal(filterRequest(request(path)), null, path);
  }
});
test("cross-site and foreign-origin API mutations are rejected", () => {
  for (const headers of [{ "sec-fetch-site": "cross-site" }, { origin: "https://attacker.example" }, { origin: "null" }]) {
    assert.equal(filterRequest(request("/api/billing/order", { method: "POST", headers }), origin).status, 403);
  }
});
test("same-origin JSON checkout requests proceed to existing authorization", () => {
  assert.equal(filterRequest(request("/api/billing/order", { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }), origin), null);
});
test("oversized sensitive bodies and invalid types are blocked", () => {
  assert.equal(filterRequest(request("/api/auth/login", { method: "POST", headers: { "content-length": "17000" } })).status, 413);
  assert.equal(filterRequest(request("/api/billing/verify", { method: "POST", headers: { "content-type": "text/plain" } })).status, 415);
});
test("middleware passes normal traffic and rejects private paths", () => {
  assert.equal(middleware(request("/subscribe")).headers.get("x-middleware-next"), "1");
  assert.equal(middleware(request("/server/data/drugs.json")).status, 403);
});
