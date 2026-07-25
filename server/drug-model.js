export function normalizeCollection(collection) {
  if (!Array.isArray(collection)) return [];
  const used = new Set();
  return sortDrugs(collection.map((drug) => {
    const normalized = normalizeDrug(drug, { existingIds: used });
    used.add(normalized.id);
    return normalized;
  }));
}

const medicationGroups = [
  "ADHD medications",
  "Antidepressants",
  "Antipsychotics",
  "Anxiolytic and hypnotic medications",
  "Dementia medications",
  "Mood stabilizers and Anticonvulsants",
  "Sexual dysfunction medications"
];

export function normalizeDrug(input = {}, options = {}) {
  const existingIds = options.existingIds || new Set();
  const name = cleanString(input.name);
  const classification = textField(input.classification || input.className);

  if (!name) {
    throw httpError(400, "Generic name is required.");
  }
  if (!classification) {
    throw httpError(400, "Classification is required.");
  }

  const requestedId = cleanString(options.preserveId || input.id || slugify(name));
  const id = options.preserveId ? requestedId : uniqueId(slugify(requestedId || name), existingIds);

  return {
    id,
    name,
    brands: toArray(input.brands),
    medicationGroup: medicationGroups.includes(input.medicationGroup || input.category)
      ? input.medicationGroup || input.category
      : "",
    classification,
    riskLevel: ["standard", "watch", "high"].includes(input.riskLevel) ? input.riskLevel : "standard",
    targetDose: cleanString(input.targetDose),
    maximumDose: cleanString(input.maximumDose),
    mechanismOfActionAndReceptorProfile: textField(
      input.mechanismOfActionAndReceptorProfile || input.mechanismOfAction || input.mechanism
    ),
    pharmacodynamics: textField(input.pharmacodynamics),
    fdaApprovedAndOffLabelUses: textField(input.fdaApprovedAndOffLabelUses || input.indication || input.indications),
    pharmacokineticsAndHalfLife: textField(input.pharmacokineticsAndHalfLife || input.pharmacokinetics),
    clinicalDosingOptimizationAndTargetDose: textField(
      input.clinicalDosingOptimizationAndTargetDose || input.dosageAndTitration || joinLegacyDose(input)
    ),
    sideEffects: textField(input.sideEffects || input.sideEffect),
    fdaBlackBoxWarning: textField(input.fdaBlackBoxWarning || input.seriousWarnings),
    prescribingInSpecialPopulations: textField(
      input.prescribingInSpecialPopulations || input.specialPopulation || input.cautions
    ),
    drugInteractions: textField(input.drugInteractions || input.interactions),
    miscellaneous: textField(input.miscellaneous || input.pearls),
    lastReviewed: dateString(input.lastReviewed) || todayString(),
    updatedAt: dateString(input.updatedAt) || todayString()
  };
}

export function sortDrugs(drugs) {
  return [...drugs].sort((a, b) => a.name.localeCompare(b.name));
}

export function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => cleanString(item)).filter(Boolean);
  }
  return [];
}

export function textField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trimEnd()).filter((item) => item.trim()).join("\n");
  }
  return cleanString(value);
}

export function cleanString(value) {
  return String(value || "").trim();
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function joinLegacyDose(input) {
  return [input.adultDose, input.titration].map(textField).filter(Boolean).join("\n");
}

function dateString(value) {
  const candidate = cleanString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "drug";
}

function uniqueId(base, existingIds) {
  const root = slugify(base);
  let candidate = root;
  let count = 2;
  while (existingIds.has(candidate)) {
    candidate = `${root}-${count}`;
    count += 1;
  }
  return candidate;
}
