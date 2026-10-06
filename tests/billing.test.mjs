import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import {
  createOrder,
  getPlan,
  getPublicBillingInfo,
  isValidSignature,
  requireMember,
  verifyPayment
} from "../server/billing.js";
import { serveAdverseEffectsPage, serveLibraryPage } from "../server/pages.js";

const originalFetch = global.fetch;
const keys = [
  "APP_ORIGIN", "NODE_ENV", "VERCEL", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "MEMBERSHIP_PRICE_INR", "MEMBERSHIP_DAYS", "PAYWALL_ENABLED"
];
const originalEnvironment = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
const user = { id: "11111111-1111-4111-8111-111111111111", email: "member@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "Test Member" } };

beforeEach(() => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_key123";
  process.env.RAZORPAY_KEY_SECRET = "razorpay_secret_test";
  delete process.env.MEMBERSHIP_PRICE_INR;
  delete process.env.MEMBERSHIP_DAYS;
  delete process.env.PAYWALL_ENABLED;
});

afterEach(() => {
  global.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("plan defaults to one rupee for thirty days and never exposes the secret", () => {
  assert.deepEqual(getPlan(), { id: "membership", name: "Membership", amountPaise: 100, currency: "INR", days: 30 });
  const info = getPublicBillingInfo();
  assert.equal(info.mode, "test");
  assert.equal(info.keyId, "rzp_test_key123");
  assert.equal(JSON.stringify(info).includes("razorpay_secret_test"), false);
});

test("plan price and length can be changed from the environment", () => {
  process.env.MEMBERSHIP_PRICE_INR = "299";
  process.env.MEMBERSHIP_DAYS = "365";
  assert.equal(getPlan().amountPaise, 29900);
  assert.equal(getPlan().days, 365);
});

test("payment signatures follow Razorpay's order|payment HMAC", () => {
  const good = sign("order_ABC123", "pay_XYZ789");
  assert.equal(isValidSignature("order_ABC123", "pay_XYZ789", good), true);
  assert.equal(isValidSignature("order_ABC123", "pay_OTHER1", good), false);
});

test("creating an order calls Razorpay with basic auth and stores a pending payment", async () => {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://api.razorpay.com/v1/orders") {
      return json(200, { id: "order_ABC123", amount: 100, currency: "INR" });
    }
    if (String(url).includes("/rest/v1/payments")) return new Response(null, { status: 201 });
    throw new Error(`unexpected fetch ${url}`);
  };

  const order = await createOrder({ user });
  assert.equal(order.orderId, "order_ABC123");
  assert.equal(order.amountPaise, 100);
  assert.equal(order.prefill.email, "member@example.com");

  const razorpayCall = calls[0];
  assert.equal(razorpayCall.options.headers.Authorization, `Basic ${Buffer.from("rzp_test_key123:razorpay_secret_test").toString("base64")}`);
  assert.equal(JSON.parse(razorpayCall.options.body).amount, 100);
  const stored = JSON.parse(calls[1].options.body);
  assert.equal(stored.user_id, user.id);
  assert.equal(stored.status, "created");
  assert.equal(stored.days, 30);
});

test("verification rejects a forged signature before contacting anyone", async () => {
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("unexpected fetch");
  };
  await assert.rejects(
    verifyPayment({ user }, { razorpay_order_id: "order_ABC123", razorpay_payment_id: "pay_XYZ789", razorpay_signature: "0".repeat(64) }),
    (error) => error.status === 400
  );
  assert.equal(fetchCalled, false);
});

test("verified captured payments grant membership through the database function", async () => {
  const urls = [];
  global.fetch = async (url) => {
    url = String(url);
    urls.push(url);
    if (url.includes("/rest/v1/payments?select=order_id") && url.includes("order_id=eq.order_ABC123")) {
      return json(200, [{ order_id: "order_ABC123", amount_paise: 100, currency: "INR", status: "created" }]);
    }
    if (url === "https://api.razorpay.com/v1/payments/pay_XYZ789") {
      return json(200, { id: "pay_XYZ789", order_id: "order_ABC123", amount: 100, currency: "INR", status: "captured" });
    }
    if (url.endsWith("/rest/v1/rpc/grant_membership")) return json(200, "2026-11-01T00:00:00Z");
    if (url.includes("/rest/v1/payments?select=order_id") && url.includes("status=eq.created")) return json(200, []);
    if (url.includes("/rest/v1/memberships")) return json(200, [{ access_until: "2999-01-01T00:00:00Z" }]);
    throw new Error(`unexpected fetch ${url}`);
  };

  const status = await verifyPayment({ user }, {
    razorpay_order_id: "order_ABC123",
    razorpay_payment_id: "pay_XYZ789",
    razorpay_signature: sign("order_ABC123", "pay_XYZ789")
  });
  assert.equal(status.active, true);
  assert.ok(urls.some((url) => url.endsWith("/rest/v1/rpc/grant_membership")));
});

test("a payment for a different amount is refused", async () => {
  global.fetch = async (url) => {
    url = String(url);
    if (url.includes("/rest/v1/payments")) return json(200, [{ order_id: "order_ABC123", amount_paise: 100, currency: "INR", status: "created" }]);
    if (url.includes("api.razorpay.com/v1/payments/")) return json(200, { id: "pay_XYZ789", order_id: "order_ABC123", amount: 1, status: "captured" });
    throw new Error(`unexpected fetch ${url}`);
  };
  await assert.rejects(
    verifyPayment({ user }, { razorpay_order_id: "order_ABC123", razorpay_payment_id: "pay_XYZ789", razorpay_signature: sign("order_ABC123", "pay_XYZ789") }),
    (error) => error.status === 400 && /does not match/.test(error.message)
  );
});

test("a payment in a different currency cannot grant membership", async () => {
  let granted = false;
  global.fetch = async (url) => {
    url = String(url);
    if (url.includes("/rpc/grant_membership")) granted = true;
    if (url.includes("/rest/v1/payments")) return json(200, [{ order_id: "order_ABC123", amount_paise: 100, currency: "INR", status: "created" }]);
    if (url.includes("api.razorpay.com/v1/payments/")) return json(200, { id: "pay_XYZ789", order_id: "order_ABC123", amount: 100, currency: "USD", status: "captured" });
    throw new Error("Unexpected service call");
  };
  await assert.rejects(verifyPayment({ user }, {
    razorpay_order_id: "order_ABC123", razorpay_payment_id: "pay_XYZ789",
    razorpay_signature: sign("order_ABC123", "pay_XYZ789")
  }), error => error.status === 400);
  assert.equal(granted, false);
});

test("with the paywall off, signed-in users keep library access", async () => {
  global.fetch = sessionFetch({ admin: false, accessUntil: null });
  const session = await requireMember(signedInRequest(), response());
  assert.equal(session.user.id, user.id);
});

test("signed-in users get the adverse-effects index and requested topic embedded", async () => {
  global.fetch = sessionFetch({ admin: false, accessUntil: null });
  const res = response();
  await serveAdverseEffectsPage({ ...signedInRequest(), url: "/adverse-effects?topic=weight-gain" }, res);
  assert.equal(res.statusCode, 200);
  const data = JSON.parse(res.body.match(/<script type="application\/json" id="aeData">([\s\S]*?)<\/script>/)[1]);
  assert.ok(data.systems.length > 0);
  assert.ok(data.topics.some((topic) => topic.id === "weight-gain" && topic.published));
  assert.equal(data.topic.id, "weight-gain");
  assert.doesNotMatch(res.body.match(/id="aeData">([\s\S]*?)<\/script>/)[1], /</);
});

test("unknown or malformed adverse-effect topics fall back to the index", async () => {
  global.fetch = sessionFetch({ admin: false, accessUntil: null });
  for (const topic of ["not-a-topic", "../drugs", "WEIGHT-GAIN"]) {
    const res = response();
    await serveAdverseEffectsPage({ ...signedInRequest(), url: `/adverse-effects?topic=${encodeURIComponent(topic)}` }, res);
    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body.match(/id="aeData">([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.topic, undefined, topic);
    assert.equal(data.notFound, true, topic);
  }
});

test("with the paywall on, non-members are sent to the membership page", async () => {
  process.env.PAYWALL_ENABLED = "true";
  global.fetch = sessionFetch({ admin: false, accessUntil: null });
  await assert.rejects(requireMember(signedInRequest(), response()), (error) => error.status === 402);

  const res = response();
  await serveLibraryPage(signedInRequest(), res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.headers.location, "/subscribe");
});

test("with the paywall on, members and admins get in", async () => {
  process.env.PAYWALL_ENABLED = "true";
  global.fetch = sessionFetch({ admin: false, accessUntil: "2999-01-01T00:00:00Z" });
  assert.equal((await requireMember(signedInRequest(), response())).user.id, user.id);

  global.fetch = sessionFetch({ admin: true, accessUntil: null });
  assert.equal((await requireMember(signedInRequest(), response())).user.id, user.id);
});

function sign(orderId, paymentId) {
  return createHmac("sha256", "razorpay_secret_test").update(`${orderId}|${paymentId}`).digest("hex");
}

function sessionFetch({ admin, accessUntil }) {
  return async (url) => {
    url = String(url);
    if (url.endsWith("/auth/v1/user")) return json(200, user);
    if (url.includes("/rest/v1/admin_users")) return json(200, admin ? [{ user_id: user.id }] : []);
    if (url.includes("/rest/v1/payments")) return json(200, []);
    if (url.includes("/rest/v1/memberships")) return json(200, accessUntil ? [{ access_until: accessUntil }] : []);
    if (url.includes("api.razorpay.com")) return json(200, { items: [] });
    throw new Error(`unexpected fetch ${url}`);
  };
}

function signedInRequest() {
  return { method: "GET", url: "/library", headers: { host: "localhost:3000", cookie: "pme_access=token123" } };
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
