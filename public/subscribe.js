(function () {
  "use strict";

  const els = {
    modeNote: document.querySelector("#modeNote"),
    states: document.querySelectorAll(".lp-sub__state"),
    payButton: document.querySelector("#payButton"),
    extendButton: document.querySelector("#extendButton"),
    accessUntil: document.querySelector("#accessUntil"),
    status: document.querySelector("#payStatus")
  };

  let busy = false;

  els.payButton?.addEventListener("click", startPayment);
  els.extendButton?.addEventListener("click", startPayment);
  init();

  async function init() {
    let billing;
    try {
      billing = await getJson("/api/billing/plans");
    } catch {
      showState("stateUnavailable");
      return;
    }

    fillPlan(billing.plan);
    if (!billing.configured) {
      showState("stateUnavailable");
      return;
    }
    if (billing.mode === "test") els.modeNote.hidden = false;

    try {
      renderMembership(await getJson("/api/billing/status"));
    } catch (error) {
      if (error.status === 401) {
        showState("stateGuest");
        return;
      }
      showState("stateBuy");
      setStatus("Your membership status couldn't be checked. Refresh the page to try again.", true);
    }
  }

  async function startPayment() {
    if (busy) return;
    if (typeof window.Razorpay !== "function") {
      setStatus("The payment window didn't load. Check your connection and refresh the page.", true);
      return;
    }

    setBusy(true);
    setStatus("Opening secure payment…");
    try {
      const order = await postJson("/api/billing/order", {});
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        order_id: order.orderId,
        name: "Psychiatry Made Easy",
        description: `Membership, ${order.days} days`,
        prefill: order.prefill,
        theme: { color: "#e49b5a" },
        handler: confirmPayment,
        modal: {
          ondismiss: () => {
            setBusy(false);
            setStatus("Payment window closed.");
          }
        }
      });
      checkout.on("payment.failed", (event) => {
        setStatus(event?.error?.description || "The payment failed. Try again or use another method.", true);
      });
      checkout.open();
      setStatus("");
    } catch (error) {
      setBusy(false);
      setStatus(error.message || "The payment couldn't start. Try again.", true);
    }
  }

  async function confirmPayment(result) {
    setStatus("Confirming your payment…");
    try {
      renderMembership(await postJson("/api/billing/verify", result));
      setStatus("Payment confirmed. Your membership is active.");
    } catch (error) {
      setStatus(`${error.message || "The payment couldn't be confirmed."} If money was taken, refresh this page in a minute; finished payments are picked up automatically.`, true);
    } finally {
      setBusy(false);
    }
  }

  function renderMembership(status) {
    if (status?.active && status.accessUntil) {
      els.accessUntil.textContent = formatDate(status.accessUntil);
      showState("stateMember");
    } else {
      showState("stateBuy");
    }
  }

  function fillPlan(plan) {
    if (!plan) return;
    document.querySelectorAll("[data-plan-price]").forEach((element) => {
      element.textContent = formatPrice(plan.amountPaise, plan.currency);
    });
    document.querySelectorAll("[data-plan-days]").forEach((element) => {
      element.textContent = String(plan.days);
    });
  }

  function showState(id) {
    els.states.forEach((element) => { element.hidden = element.id !== id; });
  }

  function setBusy(value) {
    busy = value;
    if (els.payButton) els.payButton.disabled = value;
    if (els.extendButton) els.extendButton.disabled = value;
  }

  function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle("is-error", isError);
  }

  async function getJson(path) {
    return request(path, { method: "GET" });
  }

  async function postJson(path, body) {
    return request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": readCookie("pme_csrf") },
      body: JSON.stringify(body)
    });
  }

  async function request(path, options) {
    const response = await fetch(path, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      credentials: "same-origin"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed with status ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function readCookie(name) {
    for (const part of document.cookie.split(";")) {
      const [key, ...rest] = part.trim().split("=");
      if (key === name) return decodeURIComponent(rest.join("="));
    }
    return "";
  }

  function formatPrice(paise, currency = "INR") {
    const amount = Number(paise) / 100;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
    }).format(amount);
  }

  function formatDate(value) {
    return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }
})();
