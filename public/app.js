(function () {
  "use strict";

  const sections = [
    { key: "classification", title: "Classification" },
    { key: "mechanismOfActionAndReceptorProfile", title: "Mechanism of Action and Receptor Profile" },
    { key: "pharmacodynamics", title: "Pharmacodynamics" },
    { key: "fdaApprovedAndOffLabelUses", title: "FDA Approved and Off-Label Uses" },
    { key: "pharmacokineticsAndHalfLife", title: "Pharmacokinetics and Half-Life" },
    { key: "clinicalDosingOptimizationAndTargetDose", title: "Clinical Dosing, Optimization, and Target Dose" },
    { key: "sideEffects", title: "Side Effects" },
    { key: "fdaBlackBoxWarning", title: "FDA Black Box Warning" },
    { key: "prescribingInSpecialPopulations", title: "Prescribing in Special Populations" },
    { key: "drugInteractions", title: "Drug Interactions" },
    { key: "miscellaneous", title: "Miscellaneous" }
  ];

  const els = {
    sessionIdentity: document.querySelector("#sessionIdentity"),
    adminEditorLink: document.querySelector("#adminEditorLink"),
    logoutButton: document.querySelector("#logoutButton"),
    medicationGroupSelect: document.querySelector("#medicationGroupSelect"),
    drugNameSelect: document.querySelector("#drugNameSelect"),
    outlineSelect: document.querySelector("#outlineSelect"),
    drugDetail: document.querySelector("#drugDetail"),
    notebookSearchForm: document.querySelector("#notebookSearchForm"),
    notebookQuery: document.querySelector("#notebookQuery"),
    notebookSearchButton: document.querySelector("#notebookSearchButton"),
    notebookAnswer: document.querySelector("#notebookAnswer")
  };

  let drugs = [];
  let medicationGroups = [];
  let selectedGroup = "";
  let selectedId = "";
  let loading = true;
  let loadError = "";

  bindEvents();
  initialize();

  function bindEvents() {
    els.logoutButton.addEventListener("click", logout);
    els.medicationGroupSelect.addEventListener("change", () => {
      selectedGroup = els.medicationGroupSelect.value;
      selectedId = getVisibleDrugs()[0]?.id || "";
      render();
    });
    els.drugNameSelect.addEventListener("change", () => {
      selectedId = els.drugNameSelect.value;
      renderDetail();
      renderOutlineSelect();
    });
    els.outlineSelect.addEventListener("change", () => {
      const section = document.querySelector(`#section-${CSS.escape(els.outlineSelect.value)}`);
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.notebookSearchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await searchNotebook();
    });
  }

  async function initialize() {
    try {
      const session = await api("/api/auth/me");
      const displayName = session.user?.fullName || session.user?.email || "Signed-in user";
      els.sessionIdentity.textContent = displayName;
      els.adminEditorLink.classList.toggle("is-hidden", session.role !== "admin");
      await loadDrugs();
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("/login?next=%2Flibrary");
        return;
      }
      loading = false;
      loadError = error.message || "Unable to load the protected library.";
      render();
    }
  }

  async function logout() {
    els.logoutButton.disabled = true;
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request failed; clearing the browser session view.", error);
    }
    window.location.replace("/");
  }

  async function loadDrugs() {
    loading = true;
    loadError = "";
    render();
    try {
      const data = await api("/api/drugs");
      drugs = normalizeCollection(data.drugs);
      medicationGroups = [...new Set(drugs.map((drug) => drug.medicationGroup).filter(Boolean))]
        .sort((first, second) => first.localeCompare(second));
      selectedGroup = medicationGroups.includes(selectedGroup) ? selectedGroup : medicationGroups[0] || "";
      selectedId = getVisibleDrugs().some((drug) => drug.id === selectedId)
        ? selectedId
        : getVisibleDrugs()[0]?.id || "";
    } catch (error) {
      if (error.status === 401) {
        window.location.replace("/login?next=%2Flibrary");
        return;
      }
      loadError = error.message || "Unable to reach the drug database.";
      drugs = [];
    } finally {
      loading = false;
      render();
    }
  }

  async function searchNotebook() {
    const query = els.notebookQuery.value.trim();
    if (!query) {
      renderNotebookAnswer("Ask a question before searching.", [], true);
      return;
    }

    els.notebookSearchButton.disabled = true;
    renderNotebookAnswer("Searching notebook sources...", []);
    try {
      const data = await api("/api/notebook/search", {
        method: "POST",
        body: { query }
      });
      renderNotebookAnswer(data.answer, data.results || []);
    } catch (error) {
      renderNotebookAnswer(error.message || "Notebook search failed.", [], true);
    } finally {
      els.notebookSearchButton.disabled = false;
    }
  }

  async function api(path, options = {}) {
    const method = options.method || "GET";
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(method !== "GET" ? { "X-CSRF-Token": readCookie("pme_csrf") } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
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

  function render() {
    renderMedicationGroupSelect();
    renderDrugNameSelect();
    renderOutlineSelect();
    renderDetail();
  }

  function renderMedicationGroupSelect() {
    els.medicationGroupSelect.disabled = loading || !medicationGroups.length;
    els.medicationGroupSelect.innerHTML = medicationGroups.length
      ? medicationGroups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`).join("")
      : `<option value="">No medication groups available</option>`;
    els.medicationGroupSelect.value = selectedGroup;
  }

  function renderDrugNameSelect() {
    const options = getVisibleDrugs();
    els.drugNameSelect.disabled = loading || !options.length;
    els.drugNameSelect.innerHTML = options.length
      ? options.map((drug) => `<option value="${escapeAttr(drug.id)}">${escapeHtml(drug.name)}</option>`).join("")
      : `<option value="">No drugs in this group</option>`;
    els.drugNameSelect.value = selectedId;
  }

  function renderOutlineSelect() {
    const drug = getSelectedDrug();
    els.outlineSelect.disabled = !drug;
    els.outlineSelect.innerHTML = drug
      ? [
          `<option value="">Jump to section</option>`,
          ...sections.map((section) => `<option value="${escapeAttr(section.key)}">${escapeHtml(section.title)}</option>`)
        ].join("")
      : `<option value="">Choose a drug first</option>`;
    els.outlineSelect.value = "";
  }

  function renderDetail() {
    if (loading) {
      els.drugDetail.innerHTML = `<div class="empty-state">Loading the protected drug library.</div>`;
      return;
    }
    if (loadError) {
      els.drugDetail.innerHTML = `<div class="empty-state">${escapeHtml(loadError)}</div>`;
      return;
    }

    const drug = getSelectedDrug();
    if (!drug) {
      els.drugDetail.innerHTML = `<div class="empty-state">No drug record is available for this selection.</div>`;
      return;
    }

    els.drugDetail.innerHTML = `
      <div class="detail-hero">
        <div>
          <p class="eyebrow">${escapeHtml(drug.medicationGroup || "Psychopharmacology")}</p>
          <h1 class="detail-title">${escapeHtml(drug.name)}</h1>
          <p class="detail-subtitle">${escapeHtml(formatBrands(drug.brands))}</p>
        </div>
        <div class="tag-row">
          ${tag(`Target ${drug.targetDose || "not added"}`)}
          ${tag(`Maximum ${drug.maximumDose || "not added"}`)}
          ${tag(`Reviewed ${formatDate(drug.lastReviewed)}`)}
          ${tag(`Updated ${formatDate(drug.updatedAt)}`)}
        </div>
      </div>
      <div class="detail-grid">
        ${sections.map((section) => renderSection(section, drug)).join("")}
      </div>
    `;
  }

  function renderSection(section, drug) {
    const doseRows = section.key === "clinicalDosingOptimizationAndTargetDose"
      ? `
          <div class="dose-grid">
            <div><strong>Target dose</strong><span>${escapeHtml(drug.targetDose || "Not added")}</span></div>
            <div><strong>Maximum dose</strong><span>${escapeHtml(drug.maximumDose || "Not added")}</span></div>
          </div>
        `
      : "";
    return `
      <article class="info-section wide" id="section-${escapeAttr(section.key)}">
        <h2>${escapeHtml(section.title)}</h2>
        ${doseRows}
        ${renderFormattedText(drug[section.key])}
      </article>
    `;
  }

  function renderFormattedText(value) {
    const lines = String(value || "").split(/\r?\n/);
    if (!lines.some((line) => line.trim())) return `<p>No information added yet.</p>`;
    const html = [];
    let listOpen = false;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (listOpen) html.push("</ul>");
        listOpen = false;
        continue;
      }
      const heading = trimmed.match(/^(#{2,6})\s+(.+)$/);
      if (heading) {
        if (listOpen) html.push("</ul>");
        listOpen = false;
        const level = Math.min(heading[1].length + 2, 6);
        html.push(`<h${level} class="section-subheading">${formatInline(heading[2])}</h${level}>`);
        continue;
      }
      const bullet = rawLine.match(/^(\s*)\*\s+(.+)$/);
      if (bullet) {
        if (!listOpen) html.push(`<ul class="section-list">`);
        listOpen = true;
        const indent = Math.min(Math.floor(bullet[1].length / 2), 3);
        html.push(`<li class="indent-${indent}">${formatInline(bullet[2])}</li>`);
        continue;
      }
      if (listOpen) html.push("</ul>");
      listOpen = false;
      html.push(`<p>${formatInline(trimmed)}</p>`);
    }
    if (listOpen) html.push("</ul>");
    return html.join("");
  }

  function renderNotebookAnswer(answer, results, danger = false) {
    els.notebookAnswer.classList.remove("is-hidden");
    els.notebookAnswer.classList.toggle("is-danger", danger);
    els.notebookAnswer.innerHTML = `
      <h3>${danger ? "Search issue" : "Notebook answer"}</h3>
      <div class="notebook-answer-text">${renderFormattedText(answer || "No answer returned.")}</div>
      ${renderNotebookResults(results)}
    `;
  }

  function renderNotebookResults(results) {
    if (!Array.isArray(results) || !results.length) return "";
    return `
      <div class="notebook-results">
        ${results.map((result) => `
          <article class="notebook-result">
            <strong>${escapeHtml(result.sourceTitle || "Notebook source")}</strong>
            <span>${escapeHtml(result.fileName || "Pasted source")} | match score ${Number(result.score || 0)}</span>
            <p>${escapeHtml(result.snippet || "")}</p>
          </article>
        `).join("")}
      </div>
    `;
  }

  function getVisibleDrugs() {
    return drugs.filter((drug) => drug.medicationGroup === selectedGroup);
  }

  function getSelectedDrug() {
    return drugs.find((drug) => drug.id === selectedId) || null;
  }

  function normalizeCollection(collection) {
    if (!Array.isArray(collection)) return [];
    return collection.map(normalizeDrug).filter((drug) => drug.id && drug.name).sort((a, b) => a.name.localeCompare(b.name));
  }

  function normalizeDrug(drug = {}) {
    return {
      id: String(drug.id || "").trim(),
      name: String(drug.name || "").trim(),
      brands: arrayFrom(drug.brands),
      medicationGroup: textField(drug.medicationGroup || drug.category),
      classification: textField(drug.classification || drug.className),
      targetDose: textField(drug.targetDose),
      maximumDose: textField(drug.maximumDose),
      mechanismOfActionAndReceptorProfile: textField(drug.mechanismOfActionAndReceptorProfile || drug.mechanismOfAction || drug.mechanism),
      pharmacodynamics: textField(drug.pharmacodynamics),
      fdaApprovedAndOffLabelUses: textField(drug.fdaApprovedAndOffLabelUses || drug.indication || drug.indications),
      pharmacokineticsAndHalfLife: textField(drug.pharmacokineticsAndHalfLife || drug.pharmacokinetics),
      clinicalDosingOptimizationAndTargetDose: textField(drug.clinicalDosingOptimizationAndTargetDose || drug.dosageAndTitration),
      sideEffects: textField(drug.sideEffects || drug.sideEffect),
      fdaBlackBoxWarning: textField(drug.fdaBlackBoxWarning || drug.seriousWarnings),
      prescribingInSpecialPopulations: textField(drug.prescribingInSpecialPopulations || drug.specialPopulation || drug.cautions),
      drugInteractions: textField(drug.drugInteractions || drug.interactions),
      miscellaneous: textField(drug.miscellaneous || drug.pearls),
      updatedAt: String(drug.updatedAt || "").slice(0, 10),
      lastReviewed: String(drug.lastReviewed || "").slice(0, 10)
    };
  }

  function readCookie(name) {
    for (const part of document.cookie.split(";")) {
      const [cookieName, ...rest] = part.trim().split("=");
      if (cookieName === name) return decodeURIComponent(rest.join("="));
    }
    return "";
  }

  function arrayFrom(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  }

  function textField(value) {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trimEnd()).filter((item) => item.trim()).join("\n");
    return String(value || "").trim();
  }

  function formatBrands(brands) {
    const items = arrayFrom(brands);
    return items.length ? items.join(", ") : "No brand names added";
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function tag(value) {
    return `<span class="tag">${escapeHtml(value)}</span>`;
  }

  function formatInline(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
