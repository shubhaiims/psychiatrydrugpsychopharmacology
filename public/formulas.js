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
    lorazepamDose: document.querySelector("#lorazepamDose strong"),
    equivForm: document.querySelector("#benzodiazepineEquivalentForm"),
    equivFromDrug: document.querySelector("#equivFromDrug"),
    equivFromDose: document.querySelector("#equivFromDose"),
    equivToDrug: document.querySelector("#equivToDrug"),
    equivToDose: document.querySelector("#equivToDose")
  };

  // Approximate therapeutic equivalent doses in mg: Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 11th ed.
  const EQUIVALENT_DOSES = [
    ["alprazolam", "Alprazolam", 1, 1],
    ["chlordiazepoxide", "Chlordiazepoxide", 25, 25],
    ["clonazepam", "Clonazepam", 0.5, 1],
    ["clorazepate", "Clorazepate", 15, 15],
    ["diazepam", "Diazepam", 10, 10],
    ["estazolam", "Estazolam", 1, 1],
    ["flurazepam", "Flurazepam", 30, 30],
    ["lorazepam", "Lorazepam", 2, 2],
    ["oxazepam", "Oxazepam", 30, 30],
    ["temazepam", "Temazepam", 20, 20],
    ["triazolam", "Triazolam", 0.25, 0.25],
    ["quazepam", "Quazepam", 15, 15],
    ["zolpidem", "Zolpidem", 10, 10],
    ["zaleplon", "Zaleplon", 10, 10]
  ].map(([id, name, min, max]) => ({ id, name, min, max }));

  populateEquivalentDrugs();
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
    els.equivForm?.addEventListener("input", updateEquivalentDose);
    els.equivForm?.addEventListener("change", updateEquivalentDose);
    els.equivForm?.addEventListener("submit", (event) => event.preventDefault());
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

  function populateEquivalentDrugs() {
    if (!els.equivFromDrug || !els.equivToDrug) return;
    for (const select of [els.equivFromDrug, els.equivToDrug]) {
      for (const drug of EQUIVALENT_DOSES) {
        select.add(new Option(`${drug.name} (${formatRange(drug.min, drug.max)} mg)`, drug.id));
      }
    }
    els.equivFromDrug.value = "lorazepam";
    els.equivToDrug.value = "diazepam";
  }

  function updateEquivalentDose() {
    if (!els.equivFromDrug || !els.equivFromDose || !els.equivToDrug || !els.equivToDose) return;

    const from = EQUIVALENT_DOSES.find((drug) => drug.id === els.equivFromDrug.value);
    const to = EQUIVALENT_DOSES.find((drug) => drug.id === els.equivToDrug.value);
    const dose = Number.parseFloat(els.equivFromDose.value);

    if (!from || !to || !Number.isFinite(dose) || dose < 0) {
      els.equivToDose.textContent = "-- mg";
      return;
    }

    // A range on either side widens the result: lowest = dose x target low / source high, and vice versa.
    els.equivToDose.textContent = `${formatRange((dose * to.min) / from.max, (dose * to.max) / from.min)} mg`;
  }

  function formatRange(low, high) {
    const lowText = formatNumber(low);
    const highText = formatNumber(high);
    return lowText === highText ? lowText : `${lowText}-${highText}`;
  }

  function formatNumber(value) {
    return value.toFixed(2).replace(/\.?0+$/, "");
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
