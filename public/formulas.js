(function () {
  "use strict";

  const els = {
    sidebar: document.querySelector("#sidebar"),
    scrim: document.querySelector("#sidebarScrim"),
    menuBtn: document.querySelector("#menuBtn"),
    libraryToggle: document.querySelector("#libraryToggle"),
    librarySubgroup: document.querySelector("#librarySubgroup"),
    formulaToggle: document.querySelector("#formulaToggle"),
    formulaSubgroup: document.querySelector("#formulaSubgroup"),
    authArea: document.querySelector("#authArea"),
    calculator: document.querySelector("#benzodiazepineCalculator"),
    alcoholVolume: document.querySelector("#alcoholVolume"),
    alcoholPercentage: document.querySelector("#alcoholPercentage"),
    chlordiazepoxideDose: document.querySelector("#chlordiazepoxideDose strong"),
    diazepamDose: document.querySelector("#diazepamDose strong"),
    lorazepamDose: document.querySelector("#lorazepamDose strong")
  };

  bindEvents();
  initializeAuthUi();

  function bindEvents() {
    els.menuBtn?.addEventListener("click", () => setSidebarOpen(!els.sidebar?.classList.contains("is-open")));
    els.scrim?.addEventListener("click", () => setSidebarOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    });

    els.libraryToggle?.addEventListener("click", () => toggleSubgroup(els.libraryToggle, els.librarySubgroup));
    els.formulaToggle?.addEventListener("click", () => toggleSubgroup(els.formulaToggle, els.formulaSubgroup));
    els.calculator?.addEventListener("input", updateBenzodiazepineDoses);
    els.calculator?.addEventListener("submit", (event) => event.preventDefault());
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

  async function initializeAuthUi() {
    try {
      const response = await fetch("/api/auth/me", {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error("Not signed in.");
      const session = await response.json();
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
