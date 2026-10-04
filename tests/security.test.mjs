import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { Readable } from "node:stream";
import { guardRequest, clientAddress, requestPolicy } from "../server/security.js";
import { readJsonBody } from "../server/http.js";

const original = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL };
afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function request(ip, extra = {}) {
  return { url: "/api/auth/login", method: "POST", headers: {}, socket: { remoteAddress: ip }, ...extra };
}
test("repeated auth attempts are rejected and a request is counted only once", async () => {
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  for (let i = 0; i < 15; i++) {
    const req = request("192.0.2.10");
    await guardRequest(req);
    await guardRequest(req);
  }
  await assert.rejects(guardRequest(request("192.0.2.10")), error => error.status === 429 && error.retryAfter > 0);
  await guardRequest(request("192.0.2.11"));
});
test("untrusted local forwarding headers cannot evade limits", () => {
  delete process.env.VERCEL;
  assert.equal(clientAddress(request("192.0.2.12", { headers: { "x-forwarded-for": "203.0.113.10" } })), "192.0.2.12");
});
test("query parameters cannot relax the login policy", () => {
  assert.equal(requestPolicy(request("192.0.2.13", { query: { action: "plans" } })).scope, "auth");
});
test("hosted limiter fails closed when the shared store is unavailable", async () => {
  process.env.NODE_ENV = "production";
  const fetch = global.fetch;
  global.fetch = async () => { throw new Error("store offline"); };
  try {
    await assert.rejects(guardRequest(request("192.0.2.14")), error => error.status === 503);
  } finally { global.fetch = fetch; }
});
test("oversized pre-parsed and streamed authentication bodies are rejected", async () => {
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  await assert.rejects(readJsonBody(request("192.0.2.15", { body: { password: "x".repeat(17000) } })), error => error.status === 413);
  const stream = Readable.from([Buffer.alloc(17000, 120)]);
  Object.assign(stream, request("192.0.2.16"));
  await assert.rejects(readJsonBody(stream), error => error.status === 413);
});
test("unsupported request content types are rejected", async () => {
  await assert.rejects(guardRequest(request("192.0.2.17", { headers: { "content-type": "text/plain" } })), error => error.status === 415);
});

test("hosted requests use the shared counter and obey its denial", async () => {
  process.env.NODE_ENV = "production";
  const names = ["SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  const saved = Object.fromEntries(names.map(key => [key, process.env[key]]));
  const fetch = global.fetch;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.ok(String(url).endsWith("/rpc/consume_security_limit"));
    const body = JSON.parse(options.body);
    assert.match(body.p_key, /^[a-f0-9]{64}$/);
    assert.equal(body.p_limit, 15);
    calls++;
    return Response.json({ allowed: calls === 1, retry_after: 42 });
  };
  try {
    await guardRequest(request("192.0.2.18"));
    await assert.rejects(guardRequest(request("192.0.2.18")), error => error.status === 429 && error.retryAfter === 42);
    assert.equal(calls, 2);
  } finally {
    global.fetch = fetch;
    for (const key of names) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
