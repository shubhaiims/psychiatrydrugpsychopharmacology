(function () {
  "use strict";

  const loginPath = "/login?next=%2Faccount";
  const els = {
    loading: document.querySelector("#accountLoading"),
    error: document.querySelector("#accountError"),
    cards: document.querySelector("#accountCards"),
    nameForm: document.querySelector("#nameForm"),
    fullName: document.querySelector("#fullName"),
    saveName: document.querySelector("#saveName"),
    nameStatus: document.querySelector("#nameStatus"),
    email: document.querySelector("#accountEmail"),
    adminNote: document.querySelector("#adminNote"),
    membershipSummary: document.querySelector("#membershipSummary"),
    membershipNote: document.querySelector("#membershipNote"),
    membershipLink: document.querySelector("#membershipLink"),
    resetButton: document.querySelector("#resetButton"),
    logoutButton: document.querySelector("#logoutButton"),
    signinStatus: document.querySelector("#signinStatus")
  };

  let email = "";

  els.nameForm.addEventListener("submit", saveName);
  els.resetButton.addEventListener("click", sendResetEmail);
  els.logoutButton.addEventListener("click", logout);
  init();

  async function init() {
    try {
      render(await getJson("/api/account"));
    } catch (error) {
      if (error.status === 401) {
        window.location.replace(loginPath);
        return;
      }
      els.loading.hidden = true;
      els.error.textContent = error.message || "Your account couldn't be loaded. Refresh the page to try again.";
      els.error.hidden = false;
    }
  }

  function render(data) {
    email = data.user.email;
    els.fullName.value = data.user.fullName || "";
    els.email.textContent = data.user.email;
    els.adminNote.hidden = data.role !== "admin";
    renderMembership(data.membership);
    els.loading.hidden = true;
    els.cards.hidden = false;
  }

  function renderMembership(membership) {
    els.membershipNote.hidden = true;
    if (!membership) {
      els.membershipSummary.textContent = "Membership status isn't available right now";
      els.membershipLink.textContent = "View membership";
    } else if (membership.active && membership.accessUntil) {
      els.membershipSummary.textContent = `Active until ${formatDate(membership.accessUntil)}`;
      els.membershipLink.textContent = "Renew";
    } else {
      els.membershipSummary.textContent = "No active membership";
      els.membershipNote.textContent = membership.accessUntil
        ? `Your last membership ended on ${formatDate(membership.accessUntil)}.`
        : "Membership opens every drug monograph and Ask My Notes.";
      els.membershipNote.hidden = false;
      els.membershipLink.textContent = "Become a member";
    }
  }

  async function saveName(event) {
    event.preventDefault();
    const fullName = els.fullName.value.trim().replace(/\s+/g, " ");
    if (fullName.length < 2 || fullName.length > 120) {
      setStatus(els.nameStatus, "Enter your full name, between 2 and 120 characters.", true);
      return;
    }

    els.saveName.disabled = true;
    setStatus(els.nameStatus, "Saving…");
    try {
      const data = await sendJson("/api/account", "PATCH", { fullName });
      els.fullName.value = data.user.fullName;
      setStatus(els.nameStatus, "Name saved.");
    } catch (error) {
      if (error.status === 401) {
        window.location.replace(loginPath);
        return;
      }
      setStatus(els.nameStatus, error.message || "Your name couldn't be saved. Try again.", true);
    } finally {
      els.saveName.disabled = false;
    }
  }

  async function sendResetEmail() {
    els.resetButton.disabled = true;
    setStatus(els.signinStatus, "Sending…");
    try {
      const data = await sendJson("/api/auth/forgot-password", "POST", { email });
      setStatus(els.signinStatus, data.message || "Check your email for the reset link.");
    } catch (error) {
      setStatus(els.signinStatus, error.message || "The email couldn't be sent. Try again.", true);
    } finally {
      els.resetButton.disabled = false;
    }
  }

  async function logout() {
    els.logoutButton.disabled = true;
    try {
      await sendJson("/api/auth/logout", "POST", {});
    } catch {
      // Leave the page even if the server call fails
    }
    window.location.replace("/");
  }

  function setStatus(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("is-error", isError);
  }

  async function getJson(path) {
    return request(path, { method: "GET" });
  }

  async function sendJson(path, method, body) {
    return request(path, {
      method,
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

  function formatDate(value) {
    return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }
})();
