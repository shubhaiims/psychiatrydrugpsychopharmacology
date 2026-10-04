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
test("layer 4 blocks scanner tools, CMS/backup probes and traversal", () => {
  assert.equal(filterRequest(request("/", { headers: { "user-agent": "sqlmap/1.8#stable" } })).status, 403);
  assert.equal(filterRequest(request("/", { headers: { "user-agent": "Mozilla/5.0 (compatible; Nuclei)" } })).status, 403);
  for (const path of ["/wp-login.php", "/wp-admin/", "/xmlrpc.php", "/phpmyadmin/", "/index.php", "/backup.sql", "/site.tar.gz", "/.aws/credentials", "/.htaccess", "/cgi-bin/test", "/%2e%2e/%2e%2e/etc/passwd"]) {
    assert.equal(filterRequest(request(path)).status, 403, path);
  }
});
test("layer 4 blocks injection payloads in the query string, including double encoding", () => {
  for (const query of ["?q=%3Cscript%3Ealert(1)%3C/script%3E", "?q=%253Cscript%253E", "?next=javascript:alert(1)", "?id=1%20UNION%20SELECT%20password", "?id=1'%20OR%20'1'='1", "?x=${jndi:ldap://a}", "?f=../../../etc/passwd", "?q=<img src=x onerror=alert(1)>"]) {
    assert.equal(filterRequest(request(`/library${query}`)).status, 403, query);
  }
  assert.equal(filterRequest(request(`/?q=${"a".repeat(2100)}`)).status, 414);
});
test("layer 4 leaves real visitors, links and browsers alone", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  for (const path of ["/library?drug=sertraline", "/library?class=Mood%20Stabilizers%20and%20Anticonvulsants", "/login?next=%2Flibrary", "/login?confirmed=1", "/reset-password?code=abc123", "/research.json", "/assets/fonts/newsreader-OFL.txt", "/.well-known/security.txt", "/library?drug=selection-of-drugs"]) {
    assert.equal(filterRequest(request(path, { headers: { "user-agent": ua } })), null, path);
  }
});
