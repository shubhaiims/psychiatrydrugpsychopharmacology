import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  assertMutationRequest,
  loginUser,
  registerUser,
  requireAdmin,
  requireUser
} from "../server/auth.js";

const originalFetch = global.fetch;
const originalEnvironment = {
  APP_ORIGIN: process.env.APP_ORIGIN,
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
};

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

test("registration requires matching passwords before contacting Supabase", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("unexpected fetch");
  };

  await assert.rejects(
    registerUser({
      fullName: "Test User",
      email: "test@example.com",
      password: "password-one",
      confirmPassword: "password-two"
    }, request(), response()),
    (error) => error.status === 400 && /do not match/i.test(error.message)
  );
  assert.equal(fetchCalled, false);
});

test("member login stores Supabase tokens only in secure server cookies", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/auth/v1/token")) {
      return jsonResponse(200, authSession());
    }
    if (String(url).includes("/rest/v1/admin_users")) {
      return jsonResponse(200, []);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const output = response();
  const result = await loginUser({ email: "USER@example.com", password: "correct-password" }, request(), output);
  const cookies = output.getHeader("Set-Cookie");

  assert.equal(result.role, "user");
  assert.equal(result.user.email, "user@example.com");
  assert.equal("token" in result, false);
  assert.equal(cookies.length, 3);
  assert.match(cookies[0], /^pme_access=/);
  assert.match(cookies[0], /HttpOnly/);
  assert.match(cookies[1], /^pme_refresh=/);
  assert.match(cookies[1], /HttpOnly/);
  assert.match(cookies[2], /^pme_csrf=/);
  assert.doesNotMatch(cookies[2], /HttpOnly/);
  assert.equal(calls[1].options.headers.Authorization, undefined);
});

test("admin login rejects an authenticated user who is absent from admin_users", async () => {
  global.fetch = async (url) => {
    if (String(url).includes("/auth/v1/token")) return jsonResponse(200, authSession());
    if (String(url).includes("/rest/v1/admin_users")) return jsonResponse(200, []);
    if (String(url).includes("/auth/v1/logout")) return jsonResponse(204, null);
    throw new Error(`Unexpected URL: ${url}`);
  };

  const output = response();
  await assert.rejects(
    loginUser({ email: "user@example.com", password: "correct-password" }, request(), output, { adminOnly: true }),
    (error) => error.status === 403 && /not authorized/i.test(error.message)
  );
  assert.ok(output.getHeader("Set-Cookie").every((cookie) => cookie.includes("Max-Age=0")));
});

test("admin authorization uses the verified Supabase user id", async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/v1/user")) {
      return jsonResponse(200, authSession().user);
    }
    if (String(url).includes("/rest/v1/admin_users")) {
      return jsonResponse(200, [{ user_id: authSession().user.id }]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await requireAdmin(request({ cookie: "pme_access=access-token" }), response());
  assert.equal(result.user.id, authSession().user.id);
  assert.match(calls[1].url, new RegExp(`user_id=eq\\.${authSession().user.id}`));
});

test("protected access rejects a request without a session", async () => {
  await assert.rejects(
    requireUser(request(), response()),
    (error) => error.status === 401
  );
});

test("state-changing requests require a matching CSRF cookie and header", () => {
  assert.throws(
    () => assertMutationRequest(request({ cookie: "pme_csrf=expected", "x-csrf-token": "wrong" })),
    (error) => error.status === 403
  );
  assert.doesNotThrow(
    () => assertMutationRequest(request({ cookie: "pme_csrf=expected", "x-csrf-token": "expected" }))
  );
});

function authSession() {
  return {
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 3600,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      user_metadata: { full_name: "Test User" }
    }
  };
}

function request(headers = {}) {
  return {
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      ...headers
    }
  };
}

function response() {
  const headers = new Map();
  return {
    headersSent: false,
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    }
  };
}

function jsonResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return data === null ? "" : JSON.stringify(data);
    }
  };
}
