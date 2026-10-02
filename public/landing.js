(function () {
  "use strict";

  const root = document.documentElement;
  const header = document.querySelector("#siteHeader");
  const motionToggle = document.querySelector("#motionToggle");
  const classList = document.querySelector("#classList");
  const motionKey = "pme_motion_paused";

  // Friendlier names for stored class labels
  const classLabels = {
    "Anxiolytic and hypnotic medications": "Anxiolytics and hypnotics",
    "Mood stabilizers and Anticonvulsants": "Mood stabilizers and anticonvulsants"
  };

  initHeader();
  initMotionToggle();
  loadLibraryStats();
  loadPlan();
  loadSession();

  function initHeader() {
    if (!header) return;
    let ticking = false;
    const update = () => {
      header.classList.toggle("is-solid", window.scrollY > 40);
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function initMotionToggle() {
    if (!motionToggle) return;
    if (readMotionPref()) setMotionPaused(true);
    motionToggle.addEventListener("click", () => {
      const paused = !root.classList.contains("lp-motion-paused");
      setMotionPaused(paused);
      writeMotionPref(paused);
    });
  }

  function setMotionPaused(paused) {
    root.classList.toggle("lp-motion-paused", paused);
    motionToggle.textContent = paused ? "Resume motion" : "Pause motion";
  }

  // Live counts so the page grows with the library
  async function loadLibraryStats() {
    try {
      const data = await getJson("/api/dashboard");
      const drugs = Array.isArray(data.drugs) ? data.drugs.filter((drug) => drug && drug.id && drug.name) : [];
      if (!drugs.length) return;

      const counts = new Map();
      for (const drug of drugs) {
        const group = String(drug.medicationGroup || "").trim();
        if (group) counts.set(group, (counts.get(group) || 0) + 1);
      }

      setText("[data-drug-count]", drugs.length);
      setText("[data-class-count]", counts.size);
      renderClasses(counts);
    } catch {
      // Keep the built-in numbers when the live list is unavailable
    }
  }

  function renderClasses(counts) {
    if (!classList || !counts.size) return;
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    classList.replaceChildren(...rows.map(([name, count]) => classRow(name, count)));
  }

  function classRow(name, count) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    const label = document.createElement("span");
    const total = document.createElement("span");

    link.href = `/library?class=${encodeURIComponent(name)}`;
    label.className = "lp-class-list__name";
    label.textContent = classLabels[name] || name;
    total.className = "lp-class-list__count";
    total.textContent = count === 1 ? "1 drug so far" : `${count} drugs`;

    link.append(label, total);
    item.append(link);
    return item;
  }

  // Price and length come from the server so they can change without editing HTML
  async function loadPlan() {
    try {
      const { plan } = await getJson("/api/billing/plans");
      if (!plan) return;
      const amount = Number(plan.amountPaise) / 100;
      const price = new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: plan.currency || "INR",
        minimumFractionDigits: Number.isInteger(amount) ? 0 : 2
      }).format(amount);
      setText("[data-plan-price]", price);
      setText("[data-plan-days]", plan.days);
    } catch {
      // Keep the built-in price text
    }
  }

  // Signed-in visitors see a library button instead of sign-up
  async function loadSession() {
    try {
      const session = await getJson("/api/auth/me");
      if (!session || !session.user) return;
      document.querySelectorAll("[data-guest]").forEach((element) => { element.hidden = true; });
      document.querySelectorAll("[data-member]").forEach((element) => { element.hidden = false; });
    } catch {
      // Signed-out visitors keep the guest buttons
    }
  }

  async function getJson(path) {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}.`);
    return response.json();
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => { element.textContent = String(value); });
  }

  function readMotionPref() {
    try {
      return window.localStorage.getItem(motionKey) === "1";
    } catch {
      return false;
    }
  }

  function writeMotionPref(paused) {
    try {
      if (paused) window.localStorage.setItem(motionKey, "1");
      else window.localStorage.removeItem(motionKey);
    } catch {
      // Storage can be blocked; the toggle still works for this visit
    }
  }
})();
