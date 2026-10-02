import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import handler from "../api/auth/[action].js";
import { listMembers } from "../server/members.js";

const originalFetch = global.fetch;
const keys = ["APP_ORIGIN", "NODE_ENV", "VERCEL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const originalEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const admin = { id: "22222222-2222-4222-8222-222222222222", email: "owner@example.com", user_metadata: { full_name: "Site Owner" } };
const profiles = [
  { id: "33333333-3333-4333-8333-333333333333", email: "new@example.com", full_name: "Newest Person", created_at: "2026-10-01T10:00:00Z" },
  { id: "44444444-4444-4444-8444-444444444444", email: "paid@example.com", full_name: "Paid Member", created_at: "2026-09-01T10:00:00Z" },
  { id: "55555555-5555-4555-8555-555555555555", email: "lapsed@example.com", full_name: "Lapsed Member", created_at: "2026-08-01T10:00:00Z" }
];
const memberships = [
  { user_id: "44444444-4444-4444-8444-444444444444", access_until: "2999-01-01T00:00:00Z" },
  { user_id: "55555555-5555-4555-8555-555555555555", access_until: "2000-01-01T00:00:00Z" }
];

beforeEach(() => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("the member list needs a login", async () => {
  await assert.rejects(listMembers(request({ cookie: "" }), response()), (error) => error.status === 401);
});

test("signed-in non-admins get 403 and no member data is read", async () => {
  const calls = [];
  global.fetch = adminFetch({ isAdmin: false, calls });
  await assert.rejects(listMembers(request(), response()), (error) => error.status === 403);
  assert.equal(calls.some((url) => url.includes("/rest/v1/profiles")), false);
});

test("admins see each member's name, email, join date and membership status", async () => {
  const calls = [];
  global.fetch = adminFetch({ isAdmin: true, calls });

  const { members } = await listMembers(request(), response());

  assert.deepEqual(members.map((member) => member.email), ["new@example.com", "paid@example.com", "lapsed@example.com"]);
  assert.deepEqual(members[0], {
    id: profiles[0].id,
    name: "Newest Person",
    email: "new@example.com",
    joinedAt: "2026-10-01T10:00:00Z",
    accessUntil: null,
    active: false
  });
  assert.equal(members[1].active, true);
  assert.equal(members[1].accessUntil, "2999-01-01T00:00:00Z");
  assert.equal(members[2].active, false);
  assert.equal(members[2].accessUntil, "2000-01-01T00:00:00Z");

  const profileRequest = calls.find((url) => url.includes("/rest/v1/profiles"));
  assert.match(profileRequest, /order=created_at\.desc/);
  assert.match(profileRequest, /limit=500/);
});

test("the members route answers 403 JSON to non-admins and 405 to other methods", async () => {
  global.fetch = adminFetch({ isAdmin: false });
  const refused = await callHandler({ method: "GET" });
  assert.equal(refused.statusCode, 403);
  assert.match(JSON.parse(refused.body).error, /admin/i);

  const wrongMethod = await callHandler({ method: "POST" });
  assert.equal(wrongMethod.statusCode, 405);
});

test("the members route also resolves from the URL when no query is passed", async () => {
  global.fetch = adminFetch({ isAdmin: true });
  const output = response();
  await handler(request({ method: "GET" }), output);
  assert.equal(output.statusCode, 200);
  assert.equal(JSON.parse(output.body).members.length, 3);
});

test("the members route returns the list to an admin", async () => {
  global.fetch = adminFetch({ isAdmin: true });
  const output = await callHandler({ method: "GET" });
  assert.equal(output.statusCode, 200);
  assert.equal(JSON.parse(output.body).members.length, 3);
});

async function callHandler({ method }) {
  const output = response();
  const incoming = request({ method });
  incoming.query = { action: "members" };
  await handler(incoming, output);
  return output;
}

function request({ method = "GET", cookie = "pme_access=token123" } = {}) {
  return {
    method,
    url: "/api/admin/members",
    headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie }
  };
}

function adminFetch({ isAdmin, calls = [] }) {
  return async (url) => {
    url = String(url);
    calls.push(url);
    if (url.endsWith("/auth/v1/user")) return json(200, admin);
    if (url.includes("/rest/v1/admin_users")) return json(200, isAdmin ? [{ user_id: admin.id }] : []);
    if (url.includes("/rest/v1/profiles")) return json(200, profiles);
    if (url.includes("/rest/v1/memberships")) return json(200, memberships);
    throw new Error(`unexpected fetch ${url}`);
  };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    getHeader(name) { return this.headers[name.toLowerCase()]; },
    end(body = "") { this.body = String(body); this.headersSent = true; }
  };
}
