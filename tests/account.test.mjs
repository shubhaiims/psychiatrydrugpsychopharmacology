import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import handler from "../api/auth/[action].js";
import { getAccount, updateAccount } from "../server/account.js";

const originalFetch = global.fetch;
const originalConsoleError = console.error;
const keys = [
  "APP_ORIGIN", "NODE_ENV", "VERCEL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"
];
const originalEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const user = { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", user_metadata: { full_name: "Test Member" } };

beforeEach(() => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
});

afterEach(() => {
  global.fetch = originalFetch;
  console.error = originalConsoleError;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("account details need a login", async () => {
  await assert.rejects(getAccount(request({ cookie: "" }), response()), (error) => error.status === 401);
});

test("changing the name without the security token is refused", async () => {
  global.fetch = failOnFetch;
  await assert.rejects(
    updateAccount(request({ method: "PATCH", csrf: false, body: { fullName: "New Name" } }), response()),
    (error) => error.status === 403
  );
});

test("a one-character name is refused before anything is saved", async () => {
  const calls = [];
  global.fetch = sessionFetch({ calls });
  await assert.rejects(
    updateAccount(request({ method: "PATCH", body: { fullName: "A" } }), response()),
    (error) => error.status === 400
  );
  assert.equal(calls.some((call) => call.options.method === "PUT"), false);
});

test("the new name is saved with the member's own token", async () => {
  const calls = [];
  global.fetch = sessionFetch({ calls });

  const result = await updateAccount(request({ method: "PATCH", body: { fullName: "  Dr   Asha Rao " } }), response());

  const save = calls.find((call) => call.options.method === "PUT");
  assert.equal(save.url, "https://project.supabase.co/auth/v1/user");
  assert.equal(save.options.headers.Authorization, "Bearer token123");
  assert.deepEqual(JSON.parse(save.options.body), { data: { full_name: "Dr Asha Rao" } });
  assert.equal(result.user.fullName, "Dr Asha Rao");
  assert.equal(result.user.email, "member@example.com");
});

test("account details include the role and membership", async () => {
  global.fetch = sessionFetch({ accessUntil: "2999-01-01T00:00:00Z" });
  const account = await getAccount(request(), response());
  assert.deepEqual(account.user, { id: user.id, fullName: "Test Member", email: "member@example.com" });
  assert.equal(account.role, "user");
  assert.deepEqual(account.membership, { active: true, accessUntil: "2999-01-01T00:00:00Z" });

  global.fetch = sessionFetch({ admin: true });
  assert.equal((await getAccount(request(), response())).role, "admin");
});

test("account details still load when payments are not set up", async () => {
  console.error = () => {};
  global.fetch = async (url, options = {}) => {
    if (String(url).includes("/rest/v1/memberships")) return json(404, { message: "relation does not exist" });
    return sessionFetch()(url, options);
  };
  const account = await getAccount(request(), response());
  assert.equal(account.membership, null);
  assert.equal(account.user.email, "member@example.com");
});

test("the account route serves reads and name changes and rejects other methods", async () => {
  global.fetch = sessionFetch();
  const read = await callHandler({ method: "GET" });
  assert.equal(read.statusCode, 200);
  assert.equal(JSON.parse(read.body).user.fullName, "Test Member");

  const save = await callHandler({ method: "PATCH", body: { fullName: "Asha Rao" } });
  assert.equal(save.statusCode, 200);
  assert.equal(JSON.parse(save.body).user.fullName, "Asha Rao");

  const refused = await callHandler({ method: "PATCH", csrf: false, body: { fullName: "Asha Rao" } });
  assert.equal(refused.statusCode, 403);

  const wrongMethod = await callHandler({ method: "DELETE" });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, "GET, PATCH");
});

test("the account route also resolves from the URL when no query is passed", async () => {
  global.fetch = sessionFetch();
  const output = response();
  await handler(request({ method: "GET" }), output);
  assert.equal(output.statusCode, 200);
  assert.equal(JSON.parse(output.body).user.email, "member@example.com");
});

test("the account route answers 401 JSON when signed out", async () => {
  const output = await callHandler({ method: "GET", cookie: "" });
  assert.equal(output.statusCode, 401);
  assert.match(JSON.parse(output.body).error, /log in/i);
});

async function callHandler({ method, ...options }) {
  const output = response();
  const incoming = request({ method, ...options });
  incoming.query = { action: "account" };
  await handler(incoming, output);
  return output;
}

function request({ method = "GET", cookie = "pme_access=token123", csrf = true, body } = {}) {
  const cookies = [cookie, csrf && method !== "GET" ? "pme_csrf=csrf123" : ""].filter(Boolean).join("; ");
  return {
    method,
    url: "/api/account",
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      cookie: cookies,
      ...(csrf && method !== "GET" ? { "x-csrf-token": "csrf123" } : {})
    },
    body
  };
}

function sessionFetch({ admin = false, accessUntil = null, calls = [] } = {}) {
  return async (url, options = {}) => {
    url = String(url);
    calls.push({ url, options });
    if (url.endsWith("/auth/v1/user") && options.method === "PUT") {
      return json(200, { ...user, user_metadata: { full_name: JSON.parse(options.body).data.full_name } });
    }
    if (url.endsWith("/auth/v1/user")) return json(200, user);
    if (url.includes("/rest/v1/admin_users")) return json(200, admin ? [{ user_id: user.id }] : []);
    if (url.includes("/rest/v1/memberships")) return json(200, accessUntil ? [{ access_until: accessUntil }] : []);
    throw new Error(`unexpected fetch ${url}`);
  };
}

async function failOnFetch(url) {
  throw new Error(`unexpected fetch ${url}`);
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
