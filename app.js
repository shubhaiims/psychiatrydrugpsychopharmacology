(function () {
  "use strict";

  const TOKEN_KEY = "psychrx.admin.token.v1";
  const today = new Date().toISOString().slice(0, 10);

  const els = {
    summaryMetrics: document.querySelector("#summaryMetrics"),
    libraryView: document.querySelector("#libraryView"),
    editorView: document.querySelector("#editorView"),
    viewTabs: document.querySelectorAll(".view-tab"),
    drugSearch: document.querySelector("#drugSearch"),
    classFilter: document.querySelector("#classFilter"),
    areaFilter: document.querySelector("#areaFilter"),
    riskFilter: document.querySelector("#riskFilter"),
    clearFilters: document.querySelector("#clearFilters"),
    resultCount: document.querySelector("#resultCount"),
    drugList: document.querySelector("#drugList"),
    drugDetail: document.querySelector("#drugDetail"),
    loginForm: document.querySelector("#loginForm"),
    adminPassword: document.querySelector("#adminPassword"),
    loginButton: document.querySelector("#loginButton"),
    logoutButton: document.querySelector("#logoutButton"),
    editorDrugSelect: document.querySelector("#editorDrugSelect"),
    newDrugButton: document.querySelector("#newDrugButton"),
    duplicateDrugButton: document.querySelector("#duplicateDrugButton"),
    exportJsonButton: document.querySelector("#exportJsonButton"),
    copyJsonButton: document.querySelector("#copyJsonButton"),
    importJsonInput: document.querySelector("#importJsonInput"),
    clearDataButton: document.querySelector("#clearDataButton"),
    editorStatus: document.querySelector("#editorStatus"),
    drugForm: document.querySelector("#drugForm"),
    editDrugId: document.querySelector("#editDrugId"),
    editorHeading: document.querySelector("#editorHeading"),
    deleteDrugButton: document.querySelector("#deleteDrugButton"),
    saveDrugButton: document.querySelector("#saveDrugButton"),
    fields: {
      name: document.querySelector("#fieldName"),
      brands: document.querySelector("#fieldBrands"),
      className: document.querySelector("#fieldClass"),
      riskLevel: document.querySelector("#fieldRisk"),
      therapeuticAreas: document.querySelector("#fieldAreas"),
      lastReviewed: document.querySelector("#fieldReviewed"),
      indications: document.querySelector("#fieldIndications"),
      mechanism: document.querySelector("#fieldMechanism"),
      adultDose: document.querySelector("#fieldDose"),
      titration: document.querySelector("#fieldTitration"),
      sideEffects: document.querySelector("#fieldSideEffects"),
      seriousWarnings: document.querySelector("#fieldWarnings"),
      monitoring: document.querySelector("#fieldMonitoring"),
      interactions: document.querySelector("#fieldInteractions"),
      cautions: document.querySelector("#fieldCautions"),
      counseling: document.querySelector("#fieldCounseling"),
      pearls: document.querySelector("#fieldPearls"),
      updateNotes: document.querySelector("#fieldUpdates")
    }
  };

  let drugs = [];
  let selectedId = "";
  let activeView = "library";
  let loading = true;
  let loadError = "";
  let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";
  let filters = {
    query: "",
    className: "all",
    area: "all",
    risk: "all"
  };

  bindEvents();
  render();
  loadDrugs();

  function bindEvents() {
    els.viewTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setView(tab.dataset.view || "library");
      });
    });

    els.drugSearch.addEventListener("input", () => {
      filters.query = els.drugSearch.value.trim().toLowerCase();
      renderLibrary();
    });

    els.classFilter.addEventListener("change", () => {
      filters.className = els.classFilter.value;
      renderLibrary();
    });

    els.areaFilter.addEventListener("change", () => {
      filters.area = els.areaFilter.value;
      renderLibrary();
    });

    els.riskFilter.addEventListener("change", () => {
      filters.risk = els.riskFilter.value;
      renderLibrary();
    });

    els.clearFilters.addEventListener("click", () => {
      filters = { query: "", className: "all", area: "all", risk: "all" };
      els.drugSearch.value = "";
      render();
    });

    els.drugList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-drug-id]");
      if (!card) return;
      selectedId = card.dataset.drugId;
      renderLibrary();
      renderDetail();
      renderEditorSelect();
      renderEditor();
    });

    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = els.adminPassword.value;
      if (!password) {
        setStatus("Enter the admin password.", true);
        return;
      }
      await login(password);
    });

    els.logoutButton.addEventListener("click", () => {
      adminToken = "";
      sessionStorage.removeItem(TOKEN_KEY);
      els.adminPassword.value = "";
      setStatus("Editor locked.");
      renderEditorLock();
    });

    els.editorDrugSelect.addEventListener("change", () => {
      selectedId = els.editorDrugSelect.value;
      renderEditor();
      renderLibrary();
      renderDetail();
    });

    els.newDrugButton.addEventListener("click", () => {
      if (!requireEditor()) return;
      selectedId = "";
      populateForm(createBlankDrug());
      setStatus("New record ready.");
    });

    els.duplicateDrugButton.addEventListener("click", async () => {
      if (!requireEditor()) return;
      const current = getSelectedDrug();
      if (!current) {
        setStatus("Select a drug to duplicate.", true);
        return;
      }
      const clone = structuredCloneSafe(current);
      clone.id = "";
      clone.name = `${clone.name} Copy`;
      clone.updatedAt = today;
      clone.lastReviewed = today;
      clone.updateNotes = [`Duplicated from ${current.name} on ${today}.`];
      await saveDrug(clone, false);
    });

    els.exportJsonButton.addEventListener("click", exportJson);
    els.copyJsonButton.addEventListener("click", copyJson);
    els.importJsonInput.addEventListener("change", importJson);

    els.clearDataButton.addEventListener("click", async () => {
      if (!requireEditor()) return;
      if (!window.confirm("Clear all drug records from the backend database?")) return;
      await replaceAllDrugs([]);
    });

    els.deleteDrugButton.addEventListener("click", async () => {
      if (!requireEditor()) return;
      const current = getSelectedDrug();
      if (!current) {
        populateForm(createBlankDrug());
        setStatus("Blank record cleared.");
        return;
      }
      if (!window.confirm(`Delete ${current.name} from the backend database?`)) return;
      await deleteDrug(current.id);
    });

    els.drugForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireEditor()) return;
      const record = formToDrug();
      if (!record.name || !record.className) {
        setStatus("Generic name and class are required.", true);
        return;
      }
      await saveDrug(record, Boolean(record.id));
    });
  }

  async function loadDrugs() {
    loading = true;
    loadError = "";
    render();
    try {
      const data = await api("/api/drugs");
      drugs = normalizeCollection(data.drugs || []);
      selectedId = drugs.some((drug) => drug.id === selectedId) ? selectedId : drugs[0]?.id || "";
    } catch (error) {
      loadError = error.message || "Unable to reach backend.";
      drugs = [];
      selectedId = "";
    } finally {
      loading = false;
      render();
      if (loadError) {
        setStatus(loadError, true);
      } else if (adminToken) {
        setStatus("Editor unlocked.");
      } else {
        setStatus("Editor locked. Enter the admin password to add or edit records.");
      }
    }
  }

  async function login(password) {
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: { password }
      });
      adminToken = data.token;
      sessionStorage.setItem(TOKEN_KEY, adminToken);
      els.adminPassword.value = "";
      setStatus("Editor unlocked.");
      renderEditorLock();
    } catch (error) {
      adminToken = "";
      sessionStorage.removeItem(TOKEN_KEY);
      setStatus(error.message || "Login failed.", true);
      renderEditorLock();
    }
  }

  async function saveDrug(record, isUpdate) {
    try {
      const data = await api(isUpdate ? `/api/drugs/${encodeURIComponent(record.id)}` : "/api/drugs", {
        method: isUpdate ? "PUT" : "POST",
        body: record
      });
      const saved = data.drug;
      await loadDrugs();
      selectedId = saved.id;
      render();
      setStatus("Drug record saved to backend.");
    } catch (error) {
      handleWriteError(error);
    }
  }

  async function deleteDrug(id) {
    try {
      await api(`/api/drugs/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadDrugs();
      selectedId = drugs[0]?.id || "";
      render();
      setStatus("Drug record deleted from backend.");
    } catch (error) {
      handleWriteError(error);
    }
  }

  async function replaceAllDrugs(records) {
    try {
      const data = await api("/api/drugs", {
        method: "PUT",
        body: records
      });
      drugs = normalizeCollection(data.drugs || []);
      selectedId = drugs[0]?.id || "";
      render();
      setStatus(records.length ? "Imported records saved to backend." : "All records cleared.");
    } catch (error) {
      handleWriteError(error);
    }
  }

  async function api(path, options = {}) {
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    };

    if (adminToken) {
      headers.Authorization = `Bearer ${adminToken}`;
    }

    const response = await fetch(path, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}.`);
    }
    return data;
  }

  function handleWriteError(error) {
    const message = error.message || "Backend write failed.";
    if (/token|unauthorized|expired/i.test(message)) {
      adminToken = "";
      sessionStorage.removeItem(TOKEN_KEY);
      renderEditorLock();
    }
    setStatus(message, true);
  }

  function requireEditor() {
    if (adminToken) return true;
    setStatus("Unlock the editor before changing drug records.", true);
    return false;
  }

  function setView(view) {
    activeView = view;
    els.libraryView.classList.toggle("is-hidden", view !== "library");
    els.editorView.classList.toggle("is-hidden", view !== "editor");
    els.viewTabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === view);
    });
    if (view === "editor") renderEditor();
  }

  function render() {
    renderFilters();
    renderSummary();
    renderLibrary();
    renderDetail();
    renderEditorSelect();
    renderEditor();
    renderEditorLock();
    setView(activeView);
  }

  function renderSummary() {
    const classes = new Set(drugs.map((drug) => drug.className).filter(Boolean));
    const highRisk = drugs.filter((drug) => drug.riskLevel === "high").length;
    const lastUpdate = drugs.reduce((latest, drug) => {
      if (!drug.updatedAt) return latest;
      return !latest || drug.updatedAt > latest ? drug.updatedAt : latest;
    }, "");

    els.summaryMetrics.innerHTML = [
      metric(drugs.length, "Drug records"),
      metric(classes.size, "Medication classes"),
      metric(highRisk, "High monitoring drugs"),
      metric(lastUpdate ? formatDate(lastUpdate) : "None", "Latest update")
    ].join("");
  }

  function metric(value, label) {
    return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function renderFilters() {
    const classOptions = ["all", ...uniqueSorted(drugs.map((drug) => drug.className))];
    const areaOptions = ["all", ...uniqueSorted(drugs.flatMap((drug) => drug.therapeuticAreas || []))];

    preserveSelect(els.classFilter, classOptions, filters.className, "All classes");
    preserveSelect(els.areaFilter, areaOptions, filters.area, "All areas");
    els.riskFilter.value = filters.risk;
  }

  function preserveSelect(select, values, selected, allLabel) {
    select.innerHTML = values
      .map((value) => {
        const label = value === "all" ? allLabel : value;
        return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
      })
      .join("");
    select.value = values.includes(selected) ? selected : "all";
  }

  function renderLibrary() {
    if (loading) {
      els.resultCount.textContent = "Loading";
      els.drugList.innerHTML = `<div class="empty-state">Loading drug records from the backend.</div>`;
      return;
    }

    if (loadError) {
      els.resultCount.textContent = "Unavailable";
      els.drugList.innerHTML = `<div class="empty-state">Backend is not responding. Start the server and refresh this page.</div>`;
      return;
    }

    const results = getFilteredDrugs();
    const label = results.length === 1 ? "1 drug" : `${results.length} drugs`;
    els.resultCount.textContent = label;

    if (!drugs.length) {
      els.drugList.innerHTML = `<div class="empty-state">No drug records yet. Open Editor, unlock it, and add your first reviewed drug.</div>`;
      return;
    }

    if (!results.length) {
      els.drugList.innerHTML = `<div class="empty-state">No drug records match the current filters.</div>`;
      return;
    }

    if (!results.some((drug) => drug.id === selectedId)) {
      selectedId = results[0].id;
    }

    els.drugList.innerHTML = results.map(renderDrugCard).join("");
  }

  function renderDrugCard(drug) {
    const active = drug.id === selectedId ? " is-active" : "";
    return `
      <button class="drug-card${active}" type="button" data-drug-id="${escapeAttr(drug.id)}">
        <span class="drug-card-inner">
          <span class="drug-title-row">
            <span>
              <strong>${escapeHtml(drug.name)}</strong>
              <span class="brand-list">${escapeHtml(formatBrands(drug.brands))}</span>
            </span>
            ${riskPill(drug.riskLevel)}
          </span>
          <span class="drug-class">${escapeHtml(drug.className)}</span>
          <span class="drug-uses">${escapeHtml((drug.therapeuticAreas || []).slice(0, 4).join(", "))}</span>
          <span class="tag-row">${(drug.therapeuticAreas || []).slice(0, 3).map(tag).join("")}</span>
        </span>
      </button>
    `;
  }

  function renderDetail() {
    const drug = getSelectedDrug();
    if (loading) {
      els.drugDetail.innerHTML = `<div class="empty-state">Loading selected drug details.</div>`;
      return;
    }

    if (loadError) {
      els.drugDetail.innerHTML = `<div class="empty-state">Dashboard needs the backend API to show drug details.</div>`;
      return;
    }

    if (!drug) {
      els.drugDetail.innerHTML = `<div class="empty-state">No drug selected. Add your first drug from the editor.</div>`;
      return;
    }

    els.drugDetail.innerHTML = `
      <div class="detail-hero">
        <div class="detail-hero-top">
          <div>
            <p class="eyebrow">${escapeHtml(drug.className)}</p>
            <h2 class="detail-title">${escapeHtml(drug.name)}</h2>
            <p class="detail-subtitle">${escapeHtml(formatBrands(drug.brands))}</p>
          </div>
          ${riskPill(drug.riskLevel)}
        </div>
        <div class="tag-row">
          ${(drug.therapeuticAreas || []).map(tag).join("")}
          ${tag(`Reviewed ${formatDate(drug.lastReviewed)}`)}
          ${tag(`Updated ${formatDate(drug.updatedAt)}`)}
        </div>
      </div>
      <div class="detail-grid">
        ${infoText("Indications", drug.indications)}
        ${infoText("Mechanism", drug.mechanism)}
        ${infoText("Adult Dosing Notes", drug.adultDose)}
        ${infoText("Titration", drug.titration)}
        ${infoList("Common Adverse Effects", drug.sideEffects)}
        ${infoList("Serious Warnings", drug.seriousWarnings)}
        ${infoList("Monitoring", drug.monitoring)}
        ${infoList("Interactions", drug.interactions)}
        ${infoList("Cautions", drug.cautions)}
        ${infoList("Patient Counseling", drug.counseling)}
        ${infoList("Clinical Pearls", drug.pearls, true)}
        ${infoList("Update Notes", drug.updateNotes, true)}
      </div>
    `;
  }

  function infoText(title, text) {
    return `
      <article class="info-section">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text || "No information added yet.")}</p>
      </article>
    `;
  }

  function infoList(title, items, wide = false) {
    const content = arrayFrom(items).length
      ? `<ul>${arrayFrom(items).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : `<p>No information added yet.</p>`;
    return `
      <article class="info-section${wide ? " wide" : ""}">
        <h3>${escapeHtml(title)}</h3>
        ${content}
      </article>
    `;
  }

  function renderEditorSelect() {
    if (!drugs.length) {
      els.editorDrugSelect.innerHTML = `<option value="">No records yet</option>`;
      els.editorDrugSelect.value = "";
      return;
    }

    els.editorDrugSelect.innerHTML = drugs
      .map((drug) => `<option value="${escapeAttr(drug.id)}">${escapeHtml(drug.name)}</option>`)
      .join("");
    if (selectedId && drugs.some((drug) => drug.id === selectedId)) {
      els.editorDrugSelect.value = selectedId;
    }
  }

  function renderEditor() {
    const drug = getSelectedDrug() || createBlankDrug();
    populateForm(drug);
  }

  function renderEditorLock() {
    const unlocked = Boolean(adminToken);
    const formControls = Object.values(els.fields);
    formControls.forEach((control) => {
      control.disabled = !unlocked;
    });
    [
      els.newDrugButton,
      els.duplicateDrugButton,
      els.deleteDrugButton,
      els.saveDrugButton,
      els.clearDataButton
    ].forEach((button) => {
      button.disabled = !unlocked;
    });
    els.importJsonInput.disabled = !unlocked;
    els.loginButton.disabled = unlocked;
    els.logoutButton.disabled = !unlocked;
    els.adminPassword.disabled = unlocked;
    els.editorView.classList.toggle("is-locked", !unlocked);
  }

  function populateForm(drug) {
    els.editDrugId.value = drug.id || "";
    els.editorHeading.textContent = drug.id ? `Edit ${drug.name}` : "Create drug";
    els.fields.name.value = drug.name || "";
    els.fields.brands.value = arrayFrom(drug.brands).join(", ");
    els.fields.className.value = drug.className || "";
    els.fields.riskLevel.value = drug.riskLevel || "standard";
    els.fields.therapeuticAreas.value = arrayFrom(drug.therapeuticAreas).join(", ");
    els.fields.lastReviewed.value = drug.lastReviewed || today;
    els.fields.indications.value = drug.indications || "";
    els.fields.mechanism.value = drug.mechanism || "";
    els.fields.adultDose.value = drug.adultDose || "";
    els.fields.titration.value = drug.titration || "";
    els.fields.sideEffects.value = arrayFrom(drug.sideEffects).join("\n");
    els.fields.seriousWarnings.value = arrayFrom(drug.seriousWarnings).join("\n");
    els.fields.monitoring.value = arrayFrom(drug.monitoring).join("\n");
    els.fields.interactions.value = arrayFrom(drug.interactions).join("\n");
    els.fields.cautions.value = arrayFrom(drug.cautions).join("\n");
    els.fields.counseling.value = arrayFrom(drug.counseling).join("\n");
    els.fields.pearls.value = arrayFrom(drug.pearls).join("\n");
    els.fields.updateNotes.value = arrayFrom(drug.updateNotes).join("\n");
  }

  function formToDrug() {
    return normalizeDrug({
      id: els.editDrugId.value,
      name: els.fields.name.value.trim(),
      brands: splitComma(els.fields.brands.value),
      className: els.fields.className.value.trim(),
      riskLevel: els.fields.riskLevel.value,
      therapeuticAreas: splitComma(els.fields.therapeuticAreas.value),
      indications: els.fields.indications.value.trim(),
      mechanism: els.fields.mechanism.value.trim(),
      adultDose: els.fields.adultDose.value.trim(),
      titration: els.fields.titration.value.trim(),
      sideEffects: splitLines(els.fields.sideEffects.value),
      seriousWarnings: splitLines(els.fields.seriousWarnings.value),
      monitoring: splitLines(els.fields.monitoring.value),
      interactions: splitLines(els.fields.interactions.value),
      cautions: splitLines(els.fields.cautions.value),
      counseling: splitLines(els.fields.counseling.value),
      pearls: splitLines(els.fields.pearls.value),
      updatedAt: today,
      lastReviewed: els.fields.lastReviewed.value || today,
      updateNotes: splitLines(els.fields.updateNotes.value)
    });
  }

  function getFilteredDrugs() {
    return drugs.filter((drug) => {
      const haystack = [
        drug.name,
        arrayFrom(drug.brands).join(" "),
        drug.className,
        arrayFrom(drug.therapeuticAreas).join(" "),
        drug.indications,
        drug.mechanism,
        drug.adultDose,
        drug.titration,
        arrayFrom(drug.sideEffects).join(" "),
        arrayFrom(drug.seriousWarnings).join(" "),
        arrayFrom(drug.monitoring).join(" "),
        arrayFrom(drug.interactions).join(" "),
        arrayFrom(drug.cautions).join(" "),
        arrayFrom(drug.counseling).join(" "),
        arrayFrom(drug.pearls).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      const queryMatch = !filters.query || haystack.includes(filters.query);
      const classMatch = filters.className === "all" || drug.className === filters.className;
      const areaMatch = filters.area === "all" || arrayFrom(drug.therapeuticAreas).includes(filters.area);
      const riskMatch = filters.risk === "all" || drug.riskLevel === filters.risk;
      return queryMatch && classMatch && areaMatch && riskMatch;
    });
  }

  function getSelectedDrug() {
    return drugs.find((drug) => drug.id === selectedId) || drugs[0] || null;
  }

  function createBlankDrug() {
    return {
      id: "",
      name: "",
      brands: [],
      className: "",
      riskLevel: "standard",
      therapeuticAreas: [],
      indications: "",
      mechanism: "",
      adultDose: "",
      titration: "",
      sideEffects: [],
      seriousWarnings: [],
      monitoring: [],
      interactions: [],
      cautions: [],
      counseling: [],
      pearls: [],
      updatedAt: today,
      lastReviewed: today,
      updateNotes: []
    };
  }

  function normalizeCollection(collection) {
    if (!Array.isArray(collection)) return [];
    return sortDrugs(collection.map(normalizeDrug).filter((drug) => drug.name));
  }

  function normalizeDrug(drug) {
    return {
      id: String(drug.id || "").trim(),
      name: String(drug.name || "").trim(),
      brands: arrayFrom(drug.brands),
      className: String(drug.className || "").trim(),
      riskLevel: ["standard", "watch", "high"].includes(drug.riskLevel) ? drug.riskLevel : "standard",
      therapeuticAreas: arrayFrom(drug.therapeuticAreas),
      indications: String(drug.indications || "").trim(),
      mechanism: String(drug.mechanism || "").trim(),
      adultDose: String(drug.adultDose || "").trim(),
      titration: String(drug.titration || "").trim(),
      sideEffects: arrayFrom(drug.sideEffects),
      seriousWarnings: arrayFrom(drug.seriousWarnings),
      monitoring: arrayFrom(drug.monitoring),
      interactions: arrayFrom(drug.interactions),
      cautions: arrayFrom(drug.cautions),
      counseling: arrayFrom(drug.counseling),
      pearls: arrayFrom(drug.pearls),
      updatedAt: String(drug.updatedAt || today).slice(0, 10),
      lastReviewed: String(drug.lastReviewed || today).slice(0, 10),
      updateNotes: arrayFrom(drug.updateNotes)
    };
  }

  function sortDrugs(collection) {
    return [...collection].sort((a, b) => a.name.localeCompare(b.name));
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function arrayFrom(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    return [];
  }

  function splitComma(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function splitLines(value) {
    return String(value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function formatBrands(brands) {
    const items = arrayFrom(brands);
    return items.length ? items.join(", ") : "No brand names added";
  }

  function formatDate(value) {
    if (!value) return "Not set";
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function riskPill(level) {
    const normalized = ["standard", "watch", "high"].includes(level) ? level : "standard";
    const label = normalized === "high" ? "High" : normalized === "watch" ? "Watch" : "Standard";
    return `<span class="risk-pill risk-${escapeAttr(normalized)}">${escapeHtml(label)}</span>`;
  }

  function tag(value) {
    return `<span class="tag">${escapeHtml(value)}</span>`;
  }

  function setStatus(message, danger = false) {
    els.editorStatus.textContent = message;
    els.editorStatus.classList.toggle("is-danger", danger);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(drugs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `psychrx-drugs-${today}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("JSON export created.");
  }

  async function copyJson() {
    const text = JSON.stringify(drugs, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("JSON copied to clipboard.");
    } catch (error) {
      console.warn("Clipboard copy failed.", error);
      setStatus("Clipboard copy failed. Use Export JSON instead.", true);
    }
  }

  async function importJson(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const imported = normalizeCollection(parsed);
      if (!Array.isArray(parsed)) {
        setStatus("Import file must contain a JSON array.", true);
        return;
      }
      if (!window.confirm(`Import ${imported.length} records and replace the backend database?`)) return;
      await replaceAllDrugs(imported);
    } catch (error) {
      console.error("Import failed.", error);
      setStatus("Import failed. Check that the file is valid JSON.", true);
    } finally {
      event.target.value = "";
    }
  }

  function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return map[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();

