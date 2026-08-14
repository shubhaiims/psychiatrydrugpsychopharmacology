(function () {
  "use strict";

  const today = new Date().toISOString().slice(0, 10);
  const medicationGroups = [
    "ADHD medications",
    "Antidepressants",
    "Antipsychotics",
    "Anxiolytic and hypnotic medications",
    "Dementia medications",
    "Mood stabilizers and Anticonvulsants",
    "Sexual dysfunction medications"
  ];

  const els = {
    adminIdentity: document.querySelector("#adminIdentity"),
    logoutButton: document.querySelector("#logoutButton"),
    editorDrugSelect: document.querySelector("#editorDrugSelect"),
    newDrugButton: document.querySelector("#newDrugButton"),
    duplicateDrugButton: document.querySelector("#duplicateDrugButton"),
    exportJsonButton: document.querySelector("#exportJsonButton"),
    copyJsonButton: document.querySelector("#copyJsonButton"),
    importJsonInput: document.querySelector("#importJsonInput"),
    clearDataButton: document.querySelector("#clearDataButton"),
    sourceForm: document.querySelector("#sourceForm"),
    sourceTitle: document.querySelector("#sourceTitle"),
    sourceFileInput: document.querySelector("#sourceFileInput"),
    sourceText: document.querySelector("#sourceText"),
    saveSourceButton: document.querySelector("#saveSourceButton"),
    sourceList: document.querySelector("#sourceList"),
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
  let sources = [];
  let selectedId = "";
  let adminReady = false;

  bindEvents();
  renderMedicationGroupField();
  renderEditorLock();
  initialize();

  function bindEvents() {
    els.logoutButton.addEventListener("click", async () => {
      els.logoutButton.disabled = true;
      try {
        await api("/api/auth/logout", { method: "POST" });
      } catch (error) {
        console.warn("Logout request failed; leaving the editor view.", error);
      }
      window.location.replace("/");
    });

    els.editorDrugSelect.addEventListener("change", () => {
      selectedId = els.editorDrugSelect.value;
      renderEditor();
    });

    els.newDrugButton.addEventListener("click", () => {
      if (!requireEditor()) return;
      selectedId = "";
      els.editorDrugSelect.value = "";
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
    els.sourceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireEditor()) return;
      await saveNotebookSource();
    });

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

  async function initialize() {
    try {
      const session = await api("/api/auth/me");
      if (session.role !== "admin") {
        window.location.replace("/admin/login");
        return;
      }
      adminReady = true;
      els.adminIdentity.textContent = session.user?.fullName || session.user?.email || "Authorized admin";
      renderEditorLock();
      await loadDrugs();
      await loadNotebookSources();
    } catch (error) {
      adminReady = false;
      renderEditorLock();
      if ([401, 403].includes(error.status)) {
        window.location.replace("/admin/login");
        return;
      }
      setStatus(error.message || "Unable to verify admin authorization.", true);
    }
  }

  async function loadDrugs() {
    try {
      const data = await api("/api/drugs");
      drugs = normalizeCollection(data.drugs || []);
      selectedId = drugs.some((drug) => drug.id === selectedId) ? selectedId : drugs[0]?.id || "";
      renderEditorSelect();
      renderEditor();
      setStatus("Editor ready. Changes are saved to the backend database.");
    } catch (error) {
      drugs = [];
      selectedId = "";
      renderEditorSelect();
      populateForm(createBlankDrug());
      setStatus(error.message || "Unable to reach backend.", true);
    }
  }

  async function loadNotebookSources() {
    if (!adminReady) {
      sources = [];
      renderSourceList();
      return;
    }

    try {
      const data = await api("/api/notebook/sources");
      sources = Array.isArray(data.sources) ? data.sources : [];
      renderSourceList();
    } catch (error) {
      sources = [];
      renderSourceList();
      setStatus(error.message || "Unable to load notebook sources.", true);
    }
  }

  async function saveNotebookSource() {
    const file = els.sourceFileInput.files && els.sourceFileInput.files[0];
    const title = els.sourceTitle.value.trim() || file?.name || "Notebook source";
    const text = els.sourceText.value.trim();
    if (!file && !text) {
      setStatus("Choose a PDF/text file or paste source text.", true);
      return;
    }

    try {
      els.saveSourceButton.disabled = true;
      const body = {
        title,
        text,
        fileName: file?.name || "",
        contentType: file?.type || ""
      };
      if (file) {
        body.dataBase64 = await readFileAsBase64(file);
      }
      await api("/api/notebook/sources", {
        method: "POST",
        body
      });
      els.sourceTitle.value = "";
      els.sourceFileInput.value = "";
      els.sourceText.value = "";
      await loadNotebookSources();
      setStatus("Notebook source added and indexed.");
    } catch (error) {
      setStatus(error.message || "Unable to add notebook source.", true);
    } finally {
      els.saveSourceButton.disabled = !adminReady;
    }
  }

  async function deleteNotebookSource(id) {
    if (!requireEditor()) return;
    const source = sources.find((item) => item.id === id);
    if (!window.confirm(`Delete ${source?.title || "this source"} from notebook search?`)) return;
    try {
      await api(`/api/notebook/sources/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadNotebookSources();
      setStatus("Notebook source deleted.");
    } catch (error) {
      setStatus(error.message || "Unable to delete notebook source.", true);
    }
  }

  async function saveDrug(record, isUpdate) {
    try {
      const data = await api(isUpdate ? `/api/drugs/${encodeURIComponent(record.id)}` : "/api/drugs", {
        method: isUpdate ? "PUT" : "POST",
        body: record
      });
      selectedId = data.drug.id;
      await loadDrugs();
      setStatus("Drug record saved to backend.");
    } catch (error) {
      handleWriteError(error);
    }
  }

  async function deleteDrug(id) {
    try {
      await api(`/api/drugs/${encodeURIComponent(id)}`, { method: "DELETE" });
      selectedId = "";
      await loadDrugs();
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
      renderEditorSelect();
      renderEditor();
      setStatus(records.length ? "Imported records saved to backend." : "All records cleared.");
    } catch (error) {
      handleWriteError(error);
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

  function handleWriteError(error) {
    const message = error.message || "Backend write failed.";
    if ([401, 403].includes(error.status)) {
      adminReady = false;
      renderEditorLock();
      window.location.replace("/admin/login");
      return;
    }
    setStatus(message, true);
  }

  function requireEditor() {
    if (adminReady) return true;
    setStatus("Admin authorization is required.", true);
    return false;
  }

  function renderMedicationGroupField() {
    els.fields.medicationGroup.innerHTML = [
      `<option value="">Not assigned yet</option>`,
      ...medicationGroups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`)
    ].join("");
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
    els.editorDrugSelect.value = selectedId && drugs.some((drug) => drug.id === selectedId) ? selectedId : "";
  }

  function renderEditor() {
    populateForm(getSelectedDrug() || createBlankDrug());
  }

  function renderEditorLock() {
    const unlocked = adminReady;
    Object.values(els.fields).forEach((control) => {
      control.disabled = !unlocked;
    });
    [
      els.newDrugButton,
      els.duplicateDrugButton,
      els.deleteDrugButton,
      els.saveDrugButton,
      els.clearDataButton,
      els.saveSourceButton
    ].forEach((button) => {
      button.disabled = !unlocked;
    });
    els.importJsonInput.disabled = !unlocked;
    els.sourceTitle.disabled = !unlocked;
    els.sourceText.disabled = !unlocked;
    els.sourceFileInput.disabled = !unlocked;
    els.logoutButton.disabled = !unlocked;
    document.body.classList.toggle("is-locked", !unlocked);
    if (!unlocked) {
      sources = [];
      renderSourceList();
    }
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

  function renderSourceList() {
    if (!adminReady) {
      els.sourceList.innerHTML = `<p class="source-empty">Admin authorization is required.</p>`;
      return;
    }
    if (!sources.length) {
      els.sourceList.innerHTML = `<p class="source-empty">No notebook sources added yet.</p>`;
      return;
    }
    els.sourceList.innerHTML = sources.map((source) => `
      <article class="source-list-item">
        <div>
          <strong>${escapeHtml(source.title)}</strong>
          <span>${escapeHtml(source.fileName || "Pasted text")} · ${Number(source.wordCount || 0).toLocaleString()} words</span>
        </div>
        <button class="danger-button" type="button" data-source-delete="${escapeAttr(source.id)}">Delete</button>
      </article>
    `).join("");
    els.sourceList.querySelectorAll("[data-source-delete]").forEach((button) => {
      button.addEventListener("click", () => deleteNotebookSource(button.dataset.sourceDelete));
    });
  }

  function normalizeCollection(collection) {
    if (!Array.isArray(collection)) return [];
    return [...collection].map(normalizeDrug).filter((drug) => drug.name).sort((a, b) => a.name.localeCompare(b.name));
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
      clinicalDosingOptimizationAndTargetDose: textField(drug.clinicalDosingOptimizationAndTargetDose || drug.dosageAndTitration),
      sideEffects: textField(drug.sideEffects || drug.sideEffect),
      fdaBlackBoxWarning: textField(drug.fdaBlackBoxWarning || drug.seriousWarnings),
      prescribingInSpecialPopulations: textField(drug.prescribingInSpecialPopulations || drug.specialPopulation || drug.cautions),
      drugInteractions: textField(drug.drugInteractions || drug.interactions),
      miscellaneous: textField(drug.miscellaneous || drug.pearls),
      updatedAt: String(drug.updatedAt || today).slice(0, 10),
      lastReviewed: String(drug.lastReviewed || today).slice(0, 10)
    };
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

  function setStatus(message, danger = false) {
    els.editorStatus.textContent = message;
    els.editorStatus.classList.toggle("is-danger", danger);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(drugs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `psychiatry-made-easy-drugs-${today}.json`;
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
      if (!Array.isArray(parsed)) {
        setStatus("Import file must contain a JSON array.", true);
        return;
      }
      const imported = normalizeCollection(parsed);
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

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.split(",").pop() : result);
      };
      reader.onerror = () => reject(reader.error || new Error("Unable to read file."));
      reader.readAsDataURL(file);
    });
  }

  function readCookie(name) {
    for (const part of document.cookie.split(";")) {
      const [cookieName, ...rest] = part.trim().split("=");
      if (cookieName === name) return decodeURIComponent(rest.join("="));
    }
    return "";
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
