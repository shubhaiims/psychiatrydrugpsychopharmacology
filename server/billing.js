import { createHmac, timingSafeEqual } from "node:crypto";
import { isAdminUser, requireUser } from "./auth.js";
import { httpError } from "./drug-model.js";
import { supabaseServiceRequest } from "./supabase.js";

const razorpayApi = "https://api.razorpay.com/v1";
const idPattern = /^[A-Za-z0-9_]{6,64}$/;

// One membership plan; price and length come from env so they can change without code
export function getPlan() {
  const priceInr = Number(process.env.MEMBERSHIP_PRICE_INR || 1);
  const days = Math.round(Number(process.env.MEMBERSHIP_DAYS || 30));
  if (!Number.isFinite(priceInr) || priceInr < 1) {
    throw httpError(503, "MEMBERSHIP_PRICE_INR must be at least 1.");
  }
  if (!Number.isFinite(days) || days < 1) {
    throw httpError(503, "MEMBERSHIP_DAYS must be at least 1.");
  }
  return {
    id: "membership",
    name: "Membership",
    amountPaise: Math.round(priceInr * 100),
    currency: "INR",
    days
  };
}

export function isPaywallEnabled() {
  return String(process.env.PAYWALL_ENABLED || "").trim().toLowerCase() === "true";
}

function getKeys() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || "").trim()
  };
}

export function isBillingConfigured() {
  const { keyId, keySecret } = getKeys();
  return Boolean(keyId && keySecret);
}

function assertBillingConfigured() {
  if (!isBillingConfigured()) {
    throw httpError(503, "Payments are not set up on this server yet.");
  }
}

// Safe to send to the browser: the key id is public, the secret never leaves the server
export function getPublicBillingInfo() {
  const { keyId } = getKeys();
  const plan = getPlan();
  return {
    configured: isBillingConfigured(),
    mode: keyId.startsWith("rzp_live_") ? "live" : "test",
    keyId: isBillingConfigured() ? keyId : "",
    paywall: isPaywallEnabled(),
    plan: {
      name: plan.name,
      amountPaise: plan.amountPaise,
      currency: plan.currency,
      days: plan.days
    }
  };
}

export async function createOrder(session) {
  assertBillingConfigured();
  const plan = getPlan();
  const user = session.user;

  const order = await razorpayRequest("orders", {
    method: "POST",
    body: {
      amount: plan.amountPaise,
      currency: plan.currency,
      receipt: `pme_${Date.now().toString(36)}`,
      notes: { user_id: user.id, plan_id: plan.id }
    }
  });
  if (!idPattern.test(String(order.id || ""))) {
    throw httpError(502, "Razorpay did not return a valid order.");
  }

  await supabaseServiceRequest("payments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: {
      order_id: order.id,
      user_id: user.id,
      plan_id: plan.id,
      amount_paise: plan.amountPaise,
      currency: plan.currency,
      days: plan.days,
      status: "created"
    }
  });

  const { keyId } = getKeys();
  return {
    orderId: order.id,
    keyId,
    amountPaise: plan.amountPaise,
    currency: plan.currency,
    days: plan.days,
    prefill: {
      name: String(user.user_metadata?.full_name || "").trim(),
      email: String(user.email || "")
    }
  };
}

export async function verifyPayment(session, input = {}) {
  assertBillingConfigured();
  const orderId = String(input.razorpay_order_id || "");
  const paymentId = String(input.razorpay_payment_id || "");
  const signature = String(input.razorpay_signature || "");
  if (!idPattern.test(orderId) || !idPattern.test(paymentId) || !/^[a-f0-9]{64}$/.test(signature)) {
    throw httpError(400, "The payment details are incomplete.");
  }
  if (!isValidSignature(orderId, paymentId, signature)) {
    throw httpError(400, "The payment could not be verified.");
  }

  const record = await findPayment(session.user.id, orderId);
  if (!record) {
    throw httpError(404, "This payment does not belong to your account.");
  }

  await confirmWithRazorpay(record, paymentId);
  await grantMembership(orderId, paymentId);
  return getMembershipStatus(session);
}

// Signature check from Razorpay's checkout docs: HMAC-SHA256 of "order_id|payment_id"
export function isValidSignature(orderId, paymentId, signature) {
  const { keySecret } = getKeys();
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const first = Buffer.from(expected);
  const second = Buffer.from(String(signature));
  return first.length === second.length && timingSafeEqual(first, second);
}

export async function getMembershipStatus(session) {
  const userId = session.user.id;
  if (isBillingConfigured()) {
    await reconcilePendingPayments(userId);
  }
  const rows = await supabaseServiceRequest(
    `memberships?select=access_until&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  const accessUntil = Array.isArray(rows) && rows[0]?.access_until ? rows[0].access_until : null;
  return {
    active: Boolean(accessUntil && Date.parse(accessUntil) > Date.now()),
    accessUntil
  };
}

// Library, drug and notes routes call this instead of requireUser
export async function requireMember(request, response) {
  const session = await requireUser(request, response);
  if (!isPaywallEnabled()) return session;
  if (await isAdminUser(session.user.id)) return session;
  const status = await getMembershipStatus(session);
  if (!status.active) {
    throw httpError(402, "An active membership is required.");
  }
  return session;
}

async function findPayment(userId, orderId) {
  const rows = await supabaseServiceRequest(
    `payments?select=order_id,amount_paise,currency,status&order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function confirmWithRazorpay(record, paymentId) {
  if (record.status === "paid") return;
  let payment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}`);
  if (payment.order_id !== record.order_id || Number(payment.amount) !== Number(record.amount_paise) || payment.currency !== record.currency) {
    throw httpError(400, "The payment does not match this order.");
  }
  if (payment.status === "authorized") {
    payment = await razorpayRequest(`payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: { amount: record.amount_paise, currency: record.currency }
    });
  }
  if (payment.order_id !== record.order_id || Number(payment.amount) !== Number(record.amount_paise) || payment.currency !== record.currency) {
    throw httpError(400, "The payment does not match this order.");
  }
  if (payment.status !== "captured") {
    throw httpError(402, "The payment has not completed yet.");
  }
}

// Atomic: marks the payment paid once and extends access in one database call
async function grantMembership(orderId, paymentId) {
  await supabaseServiceRequest("rpc/grant_membership", {
    method: "POST",
    body: { p_order_id: orderId, p_payment_id: paymentId }
  });
}

// Catches payments that finished after the visitor closed the tab
async function reconcilePendingPayments(userId) {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const pending = await supabaseServiceRequest(
    `payments?select=order_id,amount_paise,currency,status&user_id=eq.${encodeURIComponent(userId)}&status=eq.created&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=3`
  );
  for (const record of Array.isArray(pending) ? pending : []) {
    try {
      const result = await razorpayRequest(`orders/${encodeURIComponent(record.order_id)}/payments`);
      const captured = (result.items || []).find((item) => item.status === "captured" && item.order_id === record.order_id && item.currency === record.currency && Number(item.amount) === Number(record.amount_paise));
      if (captured) await grantMembership(record.order_id, captured.id);
    } catch (error) {
      console.error("Payment reconcile failed.", error);
    }
  }
}

async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getKeys();
  let response;
  try {
    response = await fetch(`${razorpayApi}/${path}`, {
      signal: AbortSignal.timeout(15000),
      method: options.method || "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (error) {
    const wrapped = httpError(502, "Unable to reach Razorpay.");
    wrapped.cause = error;
    throw wrapped;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.description || `status ${response.status}`;
    const error = httpError(response.status >= 500 ? 502 : 400, `Razorpay request failed: ${detail}`);
    error.razorpayStatus = response.status;
    throw error;
  }
  return data;
}
