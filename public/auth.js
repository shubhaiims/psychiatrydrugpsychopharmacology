(function () {
  "use strict";

  const page = document.body.dataset.authPage || "";
  const form = document.querySelector("#authForm");
  const status = document.querySelector("#authStatus");
  const submitButton = form?.querySelector("button[type='submit']");

  initialize();

  async function initialize() {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorDescription = fragment.get("error_description") || fragment.get("error");
    if (errorDescription) {
      clearFragment();
      setStatus(errorDescription, true);
    }

    if (fragment.get("type") === "recovery" && page === "login") {
      window.location.replace(`/reset-password${window.location.hash}`);
      return;
    }

    if (fragment.get("access_token") && fragment.get("refresh_token")) {
      const sessionInput = {
        accessToken: fragment.get("access_token"),
        refreshToken: fragment.get("refresh_token"),
        expiresIn: Number(fragment.get("expires_in") || 3600)
      };
      clearFragment();
      setStatus("Verifying the secure link...");
      try {
        await api("/api/auth/session", { method: "POST", body: sessionInput });
        if (page === "reset-password") {
          form.classList.remove("is-hidden");
          setStatus("Secure link verified. Choose a new password.");
        } else {
          window.location.replace(safeNextPath("/library"));
        }
      } catch (error) {
        setStatus(error.message || "The authentication link is invalid or expired.", true);
      }
    } else if (page === "reset-password") {
      await checkResetSession();
    }

    const query = new URLSearchParams(window.location.search);
    if (page === "login" && query.get("confirmed") === "1" && !status.textContent) {
      setStatus("Email confirmed. You can now log in.");
    }
    if (page === "login" && query.get("reset") === "1") {
      setStatus("Password updated. Log in with your new password.");
    }

    form?.addEventListener("submit", submitForm);
  }

  async function checkResetSession() {
    try {
      await api("/api/auth/me");
      form.classList.remove("is-hidden");
      setStatus("Choose a new password.");
    } catch {
      form.classList.add("is-hidden");
      setStatus("Open the password reset link from your email to continue.", true);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    setBusy(true);
    setStatus(workingMessage());
    try {
      if (page === "register") {
        const body = {
          fullName: value("fullName"),
          email: value("email"),
          password: value("password"),
          confirmPassword: value("confirmPassword")
        };
        const data = await api("/api/auth/register", { method: "POST", body });
        if (data.requiresEmailConfirmation) {
          form.reset();
          setStatus("Registration received. Check your email to confirm your account.");
        } else {
          window.location.replace("/library");
        }
        return;
      }

      if (page === "forgot-password") {
        const data = await api("/api/auth/forgot-password", {
          method: "POST",
          body: { email: value("email") }
        });
        form.reset();
        setStatus(data.message || "If the account exists, a reset email has been sent.");
        return;
      }

      if (page === "reset-password") {
        await api("/api/auth/reset-password", {
          method: "POST",
          body: {
            password: value("password"),
            confirmPassword: value("confirmPassword")
          }
        });
        window.location.replace("/login?reset=1");
        return;
      }

      const adminLogin = page === "admin-login";
      await api(adminLogin ? "/api/admin/login" : "/api/auth/login", {
        method: "POST",
        body: {
          email: value("email"),
          password: value("password")
        }
      });
      window.location.replace(adminLogin ? "/admin" : safeNextPath("/library"));
    } catch (error) {
      setStatus(error.message || "Authentication failed.", true);
    } finally {
      setBusy(false);
    }
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const csrf = readCookie("pme_csrf");
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(csrf && method !== "GET" ? { "X-CSRF-Token": csrf } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
      const error = new Error(data.error || `Request failed with status ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function safeNextPath(fallback) {
    const next = new URLSearchParams(window.location.search).get("next");
    return next === "/library" ? next : fallback;
  }

  function clearFragment() {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  function readCookie(name) {
    for (const part of document.cookie.split(";")) {
      const [cookieName, ...rest] = part.trim().split("=");
      if (cookieName === name) return decodeURIComponent(rest.join("="));
    }
    return "";
  }

  function value(id) {
    return String(document.getElementById(id)?.value || "");
  }

  function setBusy(busy) {
    if (submitButton) submitButton.disabled = busy;
    form?.querySelectorAll("input").forEach((input) => {
      input.disabled = busy;
    });
  }

  function setStatus(message, danger = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-danger", danger);
  }

  function workingMessage() {
    if (page === "register") return "Creating account...";
    if (page === "forgot-password") return "Requesting reset email...";
    if (page === "reset-password") return "Updating password...";
    return "Signing in...";
  }
})();
