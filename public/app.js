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
      "Dextromethorphan/Bupropion",
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
      "Sertraline",
      "Selegeline",
      "Trazodone",
      "Tricyclic antidepressants",
      "Venlafaxine",
      "Vilazodone",
      "Vortioxetine",
      "Zuranolone"
    ],
    "Antipsychotics": [
      "Aripiprazole",
      "Asenapine",
      "Brexpiprazole",
      "Cariprazine",
      "Chlorpromazine",
      "Clozapine",
      "Fluphenazine",
      "Haloperidol",
      "Iloperidone",
      "Loxapine",
      "Lumateperone",
      "Lurasidone",
      "Molindone",
      "Olanzapine",
      "Paliperidone",
      "Perphenazine",
      "Pimavanserin",
      "Quetiapine",
      "Risperidone",
      "Thioridazine",
      "Thiothixene",
      "Trifluoperazine",
      "Ziprasidone"
    ]
  };

  const els = {
    medicationGroupSelect: document.querySelector("#medicationGroupSelect"),
    drugNameSelect: document.querySelector("#drugNameSelect"),
    outlineSelect: document.querySelector("#outlineSelect"),
    drugDetail: document.querySelector("#drugDetail")
  };

  let drugs = [];
  let selectedGroup = "";
  let selectedId = "";
  let loading = true;
  let loadError = "";

  bindEvents();
  render();
  loadDrugs();

  function bindEvents() {
    els.medicationGroupSelect.addEventListener("change", () => {
      selectedGroup = els.medicationGroupSelect.value;
      const options = getVisibleDrugOptions();
      selectedId = options[0]?.id || "";
      render();
    });

    els.drugNameSelect.addEventListener("change", () => {
      selectedId = els.drugNameSelect.value;
      renderDetail();
      renderOutlineSelect();
    });

    els.outlineSelect.addEventListener("change", () => {
      const sectionKey = els.outlineSelect.value;
      if (!sectionKey) return;
      const section = document.getElementById(`section-${sectionKey}`);
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  async function loadDrugs() {
    loading = true;
    loadError = "";
    render();
    try {
      const response = await fetch("/api/drugs", { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}.`);
      }
      drugs = normalizeCollection(data.drugs || []);
      const options = getVisibleDrugOptions();
      selectedId = options.some((drug) => drug.id === selectedId) ? selectedId : options[0]?.id || "";
    } catch (error) {
      loadError = error.message || "Unable to reach backend.";
      drugs = [];
      selectedId = "";
    } finally {
      loading = false;
      render();
    }
  }

  function render() {
    renderMedicationGroupSelect();
    renderDrugNameSelect();
    renderOutlineSelect();
    renderDetail();
  }

  function renderMedicationGroupSelect() {
    els.medicationGroupSelect.innerHTML = [
      `<option value="">Choose medication group</option>`,
      ...medicationGroups.map((group) => `<option value="${escapeAttr(group)}">${escapeHtml(group)}</option>`)
    ].join("");
    els.medicationGroupSelect.value = selectedGroup;
  }

  function renderDrugNameSelect() {
    const options = getVisibleDrugOptions();
    if (!selectedGroup) {
      els.drugNameSelect.innerHTML = `<option value="">Choose medication group first</option>`;
      els.drugNameSelect.value = "";
      return;
    }

    if (!options.length) {
      els.drugNameSelect.innerHTML = `<option value="">No drugs in this group yet</option>`;
      els.drugNameSelect.value = "";
      return;
    }

    els.drugNameSelect.innerHTML = options
      .map((drug) => `<option value="${escapeAttr(drug.id)}">${escapeHtml(drug.name)}</option>`)
      .join("");
    els.drugNameSelect.value = selectedId || options[0].id;
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
          name
        };
      });
    }
    return drugs
      .filter((drug) => drug.medicationGroup === selectedGroup)
      .map((drug) => ({ id: drug.id, name: drug.name }));
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
      updatedAt: String(drug.updatedAt || "").slice(0, 10),
      lastReviewed: String(drug.lastReviewed || "").slice(0, 10)
    };
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

  function arrayFrom(value) {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [];
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
