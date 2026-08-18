(function () {
  "use strict";

  const libraryUrl = "/library";
  const fallbackClasses = [
    "Antidepressants",
    "Antipsychotics",
    "Mood stabilizers and Anticonvulsants",
    "Anxiolytic and hypnotic medications",
    "ADHD medications"
  ];

  const els = {
    sidebar: document.querySelector("#sidebar"),
    scrim: document.querySelector("#sidebarScrim"),
    menuBtn: document.querySelector("#menuBtn"),
    libraryToggle: document.querySelector("#libraryToggle"),
    librarySubgroup: document.querySelector("#librarySubgroup"),
    formulaToggle: document.querySelector("#formulaToggle"),
    formulaSubgroup: document.querySelector("#formulaSubgroup"),
    searchInput: document.querySelector("#drugSearch"),
    searchResults: document.querySelector("#searchResults"),
    classChips: document.querySelector("#classChips"),
    authArea: document.querySelector("#authArea"),
    disclaimerBanner: document.querySelector("#disclaimerBanner"),
    dismissDisclaimer: document.querySelector("#dismissDisclaimer"),
    calculator: document.querySelector("#benzodiazepineCalculator"),
    alcoholVolume: document.querySelector("#alcoholVolume"),
    alcoholPercentage: document.querySelector("#alcoholPercentage"),
    chlordiazepoxideDose: document.querySelector("#chlordiazepoxideDose strong"),
    diazepamDose: document.querySelector("#diazepamDose strong"),
    lorazepamDose: document.querySelector("#lorazepamDose strong")
  };

  let drugs = [];
  let debounceTimer = 0;

  bindEvents();
  initialize();

  function bindEvents() {
    els.menuBtn?.addEventListener("click", () => setSidebarOpen(!els.sidebar?.classList.contains("is-open")));
    els.scrim?.addEventListener("click", () => setSidebarOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        hideSearchResults();
      }
      if (event.key === "Enter" && document.activeElement === els.searchInput) {
        const firstResult = els.searchResults?.querySelector("a");
        if (firstResult && !els.searchResults.hidden) {
          window.location.href = firstResult.href;
        }
      }
    });

    els.libraryToggle?.addEventListener("click", () => {
      toggleSubgroup(els.libraryToggle, els.librarySubgroup);
    });

    els.formulaToggle?.addEventListener("click", () => {
      toggleSubgroup(els.formulaToggle, els.formulaSubgroup);
    });

    els.searchInput?.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const query = els.searchInput.value.trim();
      if (query.length < 2) {
        hideSearchResults();
        return;
      }
      debounceTimer = window.setTimeout(() => renderSearchResults(query), 180);
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".dashboard-search")) {
        hideSearchResults();
      }
    });

    els.dismissDisclaimer?.addEventListener("click", () => {
      els.disclaimerBanner.hidden = true;
      localStorage.setItem("pme_disclaimer_dismissed", "1");
    });

    els.calculator?.addEventListener("input", updateBenzodiazepineDoses);
    els.calculator?.addEventListener("submit", (event) => event.preventDefault());
  }

  async function initialize() {
    if (!localStorage.getItem("pme_disclaimer_dismissed") && els.disclaimerBanner) {
      els.disclaimerBanner.hidden = false;
    }

    try {
      const data = await api("/api/dashboard");
      drugs = normalizeDrugs(data.drugs);
      renderClassChips(data.classes || getClasses(drugs));
    } catch {
      renderClassChips(fallbackClasses);
    }

    await initializeAuthUi();
  }

  async function initializeAuthUi() {
    try {
      const session = await api("/api/auth/me");
      const name = session.user?.fullName || session.user?.email || "My account";
      if (els.authArea) {
        els.authArea.innerHTML = `<a href="/library" class="dashboard-btn dashboard-btn--ghost">${escapeHtml(name)}</a>`;
      }
      document.querySelectorAll("[data-requires-auth]").forEach((element) => {
        element.hidden = false;
      });
    } catch {
      document.querySelectorAll("[data-requires-auth]").forEach((element) => {
        element.hidden = true;
      });
    }
  }

  async function api(path) {
    const response = await fetch(path, {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
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

  function setSidebarOpen(isOpen) {
    if (!els.sidebar || !els.scrim || !els.menuBtn) return;
    els.sidebar.classList.toggle("is-open", isOpen);
    els.scrim.hidden = !isOpen;
    els.menuBtn.setAttribute("aria-expanded", String(isOpen));
  }

  function toggleSubgroup(toggle, subgroup) {
    if (!toggle || !subgroup) return;
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    subgroup.hidden = isOpen;
  }

  function renderClassChips(classes) {
    if (!els.classChips) return;
    const items = (classes.length ? classes : fallbackClasses).slice().sort((a, b) => a.localeCompare(b));
    els.classChips.innerHTML = [
      ...items.map((className) => `<a class="dashboard-chip" href="${classUrl(className)}">${escapeHtml(shortClassName(className))}</a>`),
      `<a class="dashboard-chip dashboard-chip--all" href="${libraryUrl}">All drugs</a>`
    ].join("");
  }

  function renderSearchResults(query) {
    if (!els.searchResults || !els.searchInput) return;
    const lowered = query.toLowerCase();
    const results = drugs
      .filter((drug) => {
        const haystack = [drug.name, drug.medicationGroup, drug.classification, ...(drug.brands || [])].join(" ").toLowerCase();
        return haystack.includes(lowered);
      })
      .sort((first, second) => first.name.localeCompare(second.name))
      .slice(0, 6);

    els.searchInput.setAttribute("aria-expanded", "true");
    els.searchResults.hidden = false;
    els.searchResults.innerHTML = results.length
      ? results.map((drug) => `
          <a href="${drugUrl(drug.id)}" role="option">
            <span>${escapeHtml(drug.name)}</span>
            <span class="dashboard-result-class">${escapeHtml(drug.medicationGroup || "Psychopharmacology")}</span>
          </a>
        `).join("")
      : `<div class="dashboard-result-empty">No drugs match "${escapeHtml(query)}".</div>`;
  }

  function hideSearchResults() {
    if (!els.searchResults || !els.searchInput) return;
    els.searchResults.hidden = true;
    els.searchResults.innerHTML = "";
    els.searchInput.setAttribute("aria-expanded", "false");
  }

  function normalizeDrugs(collection) {
    if (!Array.isArray(collection)) return [];
    return collection.map((drug) => ({
      id: String(drug.id || ""),
      name: String(drug.name || ""),
      brands: Array.isArray(drug.brands) ? drug.brands : [],
      medicationGroup: String(drug.medicationGroup || ""),
      classification: String(drug.classification || "")
    })).filter((drug) => drug.id && drug.name);
  }

  function getClasses(items) {
    return [...new Set(items.map((drug) => drug.medicationGroup).filter(Boolean))];
  }

  function drugUrl(id) {
    return `${libraryUrl}?drug=${encodeURIComponent(id)}`;
  }

  function classUrl(className) {
    return `${libraryUrl}?class=${encodeURIComponent(className)}`;
  }

  function shortClassName(className) {
    return String(className)
      .replace(" and Anticonvulsants", "")
      .replace(" medications", "")
      .replace("Anxiolytic and hypnotic", "Anxiolytics & hypnotics");
  }

  function updateBenzodiazepineDoses() {
    if (!els.alcoholVolume || !els.alcoholPercentage || !els.chlordiazepoxideDose || !els.diazepamDose || !els.lorazepamDose) return;

    const volume = Number.parseFloat(els.alcoholVolume.value);
    const percentage = Number.parseFloat(els.alcoholPercentage.value);
    const hasValidInputs = Number.isFinite(volume) && Number.isFinite(percentage) && volume >= 0 && percentage >= 0 && percentage <= 100;
    const baseDose = hasValidInputs ? (volume * percentage) / 1000 : Number.NaN;

    els.chlordiazepoxideDose.textContent = formatDose(baseDose);
    els.diazepamDose.textContent = formatDose(0.4 * baseDose);
    els.lorazepamDose.textContent = formatDose(0.08 * baseDose);
  }

  function formatDose(value) {
    if (!Number.isFinite(value)) return "-- mg";
    return `${value.toFixed(2).replace(/\.?0+$/, "")} mg`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }
})();
