(function () {
  "use strict";

  const TOKEN_KEY = "psychrx.admin.token.v1";
  const today = new Date().toISOString().slice(0, 10);
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
  const medicationGroups = [
    "ADHD medications",
    "Antidepressants",
    "Antipsychotics",
    "Anxiolytic and hypnotic medications",
    "Dementia medications",
    "Mood stabilizers and Anticonvulsants",
    "Sexual dysfunction medications"
  ];
  const medicationGroupDrugNames = {
    "Antidepressants": [
      "Brexanolone",
      "Bupropion",
      "Citalopram",
      "Clomipramine",
      "Desvenlafaxine",
      "Duloxetine",
      "Escitalopram",
      "Esketamine",
      "Fluoxetine",
      "Fluvoxamine",
      "Ketamine",
      "Levomilnacipran",
      "Mirtazapine",
      "Nefazodone",
      "Paroxetine",
      "Selegeline",
      "Trazodone",
      "Tricyclic antidepressants",
      "Venlafaxine",
      "Vilazodone",
      "Vortioxetine",
      "Zuranolone"
    ]
  };

  const els = {
    summaryMetrics: document.querySelector("#summaryMetrics"),
    libraryView: document.querySelector("#libraryView"),
    editorView: document.querySelector("#editorView"),
    viewTabs: document.querySelectorAll(".view-tab"),
    medicationGroupSelect: document.querySelector("#medicationGroupSelect"),
    drugNameSelect: document.querySelector("#drugNameSelect"),
    outlineSelect: document.querySelector("#outlineSelect"),
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
      medicationGroup: document.querySelector("#fieldMedicationGroup"),
      classification: document.querySelector("#fieldClassification"),
      riskLevel: document.querySelector("#fieldRisk"),
      targetDose: document.querySelector("#fieldTargetDose"),
      maximumDose: document.querySelector("#fieldMaximumDose"),
      lastReviewed: document.querySelector("#fieldReviewed"),
      mechanismOfActionAndReceptorProfile: document.querySelector("#fieldMechanismOfActionAndReceptorProfile"),
      pharmacodynamics: document.querySelector("#fieldPharmacodynamics"),
      fdaApprovedAndOffLabelUses: document.querySelector("#fieldFdaApprovedAndOffLabelUses"),
      pharmacokineticsAndHalfLife: document.querySelector("#fieldPharmacokineticsAndHalfLife"),
      clinicalDosingOptimizationAndTargetDose: document.querySelector("#fieldClinicalDosingOptimizationAndTargetDose"),
      sideEffects: document.querySelector("#fieldSideEffects"),
      fdaBlackBoxWarning: document.querySelector("#fieldFdaBlackBoxWarning"),
      prescribingInSpecialPopulations: document.querySelector("#fieldPrescribingInSpecialPopulations"),
      drugInteractions: document.querySelector("#fieldDrugInteractions"),
      miscellaneous: document.querySelector("#fieldMiscellaneous")
    }
  };

  let drugs = [];
  let selectedGroup = "";
  let selectedId = "";
  let activeView = "library";
  let loading = true;
  let loadError = "";
  let adminToken = sessionStorage.getItem(TOKEN_KEY) || "";

  bindEvents();
  render();
  loadDrugs();

  function bindEvents() {
    els.viewTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setView(tab.dataset.view || "library");
      });
    });

    els.medicationGroupSelect.addEventListener("change", () => {
      selectedGroup = els.medicationGroupSelect.value;
      const groupOptions = getVisibleDrugOptions();
      selectedId = groupOptions[0]?.id || "";
      renderDrugNameSelect();
      renderDetail();
      renderOutlineSelect();
      renderEditorSelect();
      renderEditor();
    });

    els.drugNameSelect.addEventListener("change", () => {
      selectedId = els.drugNameSelect.value;
      renderDetail();
      renderOutlineSelect();
      renderEditorSelect();
      renderEditor();
    });

    els.outlineSelect.addEventListener("change", () => {
      const sectionKey = els.outlineSelect.value;
      if (!sectionKey) return;
      const section = document.getElementById(`section-${sectionKey}`);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
      const selectedDrug = getSelectedDrug();
      if (selectedDrug?.medicationGroup) {
        selectedGroup = selectedDrug.medicationGroup;
      }
      renderMedicationGroupSelect();
      renderDrugNameSelect();
      renderEditor();
      renderDetail();
      renderOutlineSelect();
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
      if (!record.name || !record.classification) {
        setStatus("Generic name and classification are required.", true);
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
      const groupOptions = getVisibleDrugOptions();
      selectedId = groupOptions.some((drug) => drug.id === selectedId) ? selectedId : groupOptions[0]?.id || "";
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
    renderMedicationGroupSelect();
    renderMedicationGroupField();
    renderDrugNameSelect();
    renderOutlineSelect();
    renderSummary();
    renderDetail();
    renderEditorSelect();
    renderEditor();
    renderEditorLock();
    setView(activeView);
  }

  function renderSummary() {
    const classifications = new Set(drugs.map((drug) => drug.classification).filter(Boolean));
    const blackBoxCount = drugs.filter((drug) => drug.fdaBlackBoxWarning.trim()).length;
    const lastUpdate = drugs.reduce((latest, drug) => {
      if (!drug.updatedAt) return latest;
      return !latest || drug.updatedAt > latest ? drug.updatedAt : latest;
    }, "");

    els.summaryMetrics.innerHTML = [
      metric(drugs.length, "Drug records"),
      metric(classifications.size, "Classifications"),
      metric(blackBoxCount, "Black box entries"),
      metric(lastUpdate ? formatDate(lastUpdate) : "None", "Latest update")
    ].join("");
  }

  function metric(value, label) {
    return `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function renderMedicationGroupSelect() {
    els.medicationGroupSelect.innerHTML = [
      `<option value="">Choose medication group</option>`,
      ...medicationGroups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`)
    ].join("");
    els.medicationGroupSelect.value = selectedGroup;
  }

  function renderMedicationGroupField() {
    els.fields.medicationGroup.innerHTML = [
      `<option value="">Not assigned yet</option>`,
      ...medicationGroups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`)
    ].join("");
  }

  function renderDrugNameSelect() {
    const groupDrugs = getVisibleDrugOptions();
    if (!selectedGroup) {
      els.drugNameSelect.innerHTML = `<option value="">Choose medication group first</option>`;
      els.drugNameSelect.value = "";
      return;
    }

    if (!groupDrugs.length) {
      els.drugNameSelect.innerHTML = `<option value="">No drugs in this group yet</option>`;
      els.drugNameSelect.value = "";
      return;
    }

    els.drugNameSelect.innerHTML = groupDrugs
      .map((drug) => `<option value="${escapeAttr(drug.id)}">${escapeHtml(drug.name)}</option>`)
      .join("");
    els.drugNameSelect.value = selectedId || groupDrugs[0].id;
  }

  function renderOutlineSelect() {
    if (!getSelectedDrug()) {
      els.outlineSelect.innerHTML = `<option value="">Choose drug first</option>`;
      els.outlineSelect.value = "";
      return;
    }

    els.outlineSelect.innerHTML = [
      `<option value="">Jump to section</option>`,
      ...sections.map((section) => `<option value="${escapeAttr(section.key)}">${escapeHtml(section.title)}</option>`)
    ].join("");
    els.outlineSelect.value = "";
  }

  function renderDetail() {
    const drug = getSelectedDrug();
    const selectedOption = getSelectedDrugOption();
    if (loading) {
      els.drugDetail.innerHTML = `<div class="empty-state">Loading selected drug details.</div>`;
      return;
    }

    if (loadError) {
      els.drugDetail.innerHTML = `<div class="empty-state">Dashboard needs the backend API to show drug details.</div>`;
      return;
    }

    if (!drug) {
      const message = selectedOption
        ? `Detailed information for ${selectedOption.name} has not been added yet.`
        : (selectedGroup
            ? "No drugs have been assigned to this medication group yet."
            : "Choose a medication group, then choose a drug.");
      els.drugDetail.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
      return;
    }

    els.drugDetail.innerHTML = `
      <div class="detail-hero">
        <div class="detail-hero-top">
          <div>
            <p class="eyebrow">${escapeHtml(drug.classification)}</p>
            <h2 class="detail-title">${escapeHtml(drug.name)}</h2>
            <p class="detail-subtitle">${escapeHtml(formatBrands(drug.brands))}</p>
          </div>
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
    const sectionId = `section-${section.key}`;
    const doseRows = section.key === "clinicalDosingOptimizationAndTargetDose"
      ? `
          <div class="dose-grid">
            <div><strong>Target dose</strong><span>${escapeHtml(drug.targetDose || "Not added")}</span></div>
            <div><strong>Maximum dose</strong><span>${escapeHtml(drug.maximumDose || "Not added")}</span></div>
          </div>
        `
      : "";
    return `
      <article class="info-section wide" id="${escapeAttr(sectionId)}">
        <h3>${escapeHtml(section.title)}</h3>
        ${doseRows}
        ${renderFormattedText(drug[section.key])}
      </article>
    `;
  }

  function renderFormattedText(value) {
    const lines = String(value || "")
      .split(/\r?\n/);

    if (!lines.some((line) => line.trim())) {
      return `<p>No information added yet.</p>`;
    }

    const html = [];
    let listOpen = false;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (listOpen) {
          html.push("</ul>");
          listOpen = false;
        }
        continue;
      }

      const heading = trimmed.match(/^(#{2,6})\s+(.+)$/);
      if (heading) {
        if (listOpen) {
          html.push("</ul>");
          listOpen = false;
        }
        const level = Math.min(heading[1].length + 2, 6);
        html.push(`<h${level} class="section-subheading">${formatInline(heading[2])}</h${level}>`);
        continue;
      }

      const bullet = rawLine.match(/^(\s*)\*\s+(.+)$/);
      if (bullet) {
        if (!listOpen) {
          html.push(`<ul class="section-list">`);
          listOpen = true;
        }
        const indent = Math.min(Math.floor(bullet[1].length / 2), 3);
        html.push(`<li class="indent-${indent}">${formatInline(bullet[2])}</li>`);
        continue;
      }

      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<p>${formatInline(trimmed)}</p>`);
    }

    if (listOpen) {
      html.push("</ul>");
    }

    return html.join("");
  }

  function renderEditorSelect() {
    if (!drugs.length) {
      els.editorDrugSelect.innerHTML = `<option value="">No records yet</option>`;
      els.editorDrugSelect.value = "";
      return;
    }

    els.editorDrugSelect.innerHTML = [
      `<option value="">Choose record</option>`,
      ...drugs.map((drug) => `<option value="${escapeAttr(drug.id)}">${escapeHtml(drug.name)}</option>`)
    ].join("");
    if (selectedId && drugs.some((drug) => drug.id === selectedId)) {
      els.editorDrugSelect.value = selectedId;
    } else {
      els.editorDrugSelect.value = "";
    }
  }

  function renderEditor() {
    const drug = getSelectedDrug() || createBlankDrug();
    populateForm(drug);
  }

  function renderEditorLock() {
    const unlocked = Boolean(adminToken);
    Object.values(els.fields).forEach((control) => {
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
    els.fields.medicationGroup.value = drug.medicationGroup || "";
    els.fields.classification.value = drug.classification || "";
    els.fields.riskLevel.value = drug.riskLevel || "standard";
    els.fields.targetDose.value = drug.targetDose || "";
    els.fields.maximumDose.value = drug.maximumDose || "";
    els.fields.lastReviewed.value = drug.lastReviewed || today;
    els.fields.mechanismOfActionAndReceptorProfile.value = drug.mechanismOfActionAndReceptorProfile || "";
    els.fields.pharmacodynamics.value = drug.pharmacodynamics || "";
    els.fields.fdaApprovedAndOffLabelUses.value = drug.fdaApprovedAndOffLabelUses || "";
    els.fields.pharmacokineticsAndHalfLife.value = drug.pharmacokineticsAndHalfLife || "";
    els.fields.clinicalDosingOptimizationAndTargetDose.value = drug.clinicalDosingOptimizationAndTargetDose || "";
    els.fields.sideEffects.value = drug.sideEffects || "";
    els.fields.fdaBlackBoxWarning.value = drug.fdaBlackBoxWarning || "";
    els.fields.prescribingInSpecialPopulations.value = drug.prescribingInSpecialPopulations || "";
    els.fields.drugInteractions.value = drug.drugInteractions || "";
    els.fields.miscellaneous.value = drug.miscellaneous || "";
  }

  function formToDrug() {
    return normalizeDrug({
      id: els.editDrugId.value,
      name: els.fields.name.value.trim(),
      brands: splitComma(els.fields.brands.value),
      medicationGroup: els.fields.medicationGroup.value,
      classification: els.fields.classification.value.trim(),
      riskLevel: els.fields.riskLevel.value,
      targetDose: els.fields.targetDose.value.trim(),
      maximumDose: els.fields.maximumDose.value.trim(),
      lastReviewed: els.fields.lastReviewed.value || today,
      mechanismOfActionAndReceptorProfile: els.fields.mechanismOfActionAndReceptorProfile.value.trim(),
      pharmacodynamics: els.fields.pharmacodynamics.value.trim(),
      fdaApprovedAndOffLabelUses: els.fields.fdaApprovedAndOffLabelUses.value.trim(),
      pharmacokineticsAndHalfLife: els.fields.pharmacokineticsAndHalfLife.value.trim(),
      clinicalDosingOptimizationAndTargetDose: els.fields.clinicalDosingOptimizationAndTargetDose.value.trim(),
      sideEffects: els.fields.sideEffects.value.trim(),
      fdaBlackBoxWarning: els.fields.fdaBlackBoxWarning.value.trim(),
      prescribingInSpecialPopulations: els.fields.prescribingInSpecialPopulations.value.trim(),
      drugInteractions: els.fields.drugInteractions.value.trim(),
      miscellaneous: els.fields.miscellaneous.value.trim(),
      updatedAt: today
    });
  }

  function getSelectedDrug() {
    return drugs.find((drug) => drug.id === selectedId) || null;
  }

  function getSelectedDrugOption() {
    return getVisibleDrugOptions().find((drug) => drug.id === selectedId) || null;
  }

  function getVisibleDrugOptions() {
    if (!selectedGroup) return [];
    const catalogNames = medicationGroupDrugNames[selectedGroup] || [];
    if (catalogNames.length) {
      return catalogNames.map((name) => {
        const record = findDrugByName(name);
        return {
          id: record?.id || `catalog:${slugifyName(name)}`,
          name,
          hasRecord: Boolean(record)
        };
      });
    }
    return drugs
      .filter((drug) => drug.medicationGroup === selectedGroup)
      .map((drug) => ({
        id: drug.id,
        name: drug.name,
        hasRecord: true
      }));
  }

  function findDrugByName(name) {
    const target = normalizeName(name);
    return drugs.find((drug) => normalizeName(drug.name) === target) || null;
  }

  function normalizeName(name) {
    return String(name || "").trim().toLowerCase();
  }

  function slugifyName(name) {
    return normalizeName(name)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "drug";
  }

  function createBlankDrug() {
    return {
      id: "",
      name: "",
      brands: [],
      medicationGroup: "",
      classification: "",
      riskLevel: "standard",
      targetDose: "",
      maximumDose: "",
      mechanismOfActionAndReceptorProfile: "",
      pharmacodynamics: "",
      fdaApprovedAndOffLabelUses: "",
      pharmacokineticsAndHalfLife: "",
      clinicalDosingOptimizationAndTargetDose: "",
      sideEffects: "",
      fdaBlackBoxWarning: "",
      prescribingInSpecialPopulations: "",
      drugInteractions: "",
      miscellaneous: "",
      updatedAt: today,
      lastReviewed: today
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
      medicationGroup: medicationGroups.includes(drug.medicationGroup || drug.category) ? drug.medicationGroup || drug.category : "",
      classification: textField(drug.classification || drug.className),
      riskLevel: ["standard", "watch", "high"].includes(drug.riskLevel) ? drug.riskLevel : "standard",
      targetDose: textField(drug.targetDose),
      maximumDose: textField(drug.maximumDose),
      mechanismOfActionAndReceptorProfile: textField(drug.mechanismOfActionAndReceptorProfile || drug.mechanismOfAction || drug.mechanism),
      pharmacodynamics: textField(drug.pharmacodynamics),
      fdaApprovedAndOffLabelUses: textField(drug.fdaApprovedAndOffLabelUses || drug.indication || drug.indications),
      pharmacokineticsAndHalfLife: textField(drug.pharmacokineticsAndHalfLife || drug.pharmacokinetics),
      clinicalDosingOptimizationAndTargetDose: textField(drug.clinicalDosingOptimizationAndTargetDose || drug.dosageAndTitration || joinLegacyDose(drug)),
      sideEffects: textField(drug.sideEffects || drug.sideEffect),
      fdaBlackBoxWarning: textField(drug.fdaBlackBoxWarning || drug.seriousWarnings),
      prescribingInSpecialPopulations: textField(drug.prescribingInSpecialPopulations || drug.specialPopulation || drug.cautions),
      drugInteractions: textField(drug.drugInteractions || drug.interactions),
      miscellaneous: textField(drug.miscellaneous || drug.pearls),
      updatedAt: String(drug.updatedAt || today).slice(0, 10),
      lastReviewed: String(drug.lastReviewed || today).slice(0, 10)
    };
  }

  function joinLegacyDose(drug) {
    return [drug.adultDose, drug.titration].map(textField).filter(Boolean).join("\n");
  }

  function sortDrugs(collection) {
    return [...collection].sort((a, b) => a.name.localeCompare(b.name));
  }

  function arrayFrom(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
  }

  function splitComma(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function textField(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || "").trimEnd()).filter((item) => item.trim()).join("\n");
    }
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
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function tag(value) {
    return `<span class="tag">${escapeHtml(value)}</span>`;
  }

  function formatInline(value) {
    return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
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
