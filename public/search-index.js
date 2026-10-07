export const pages = [
  ["/", "Psychiatry Made Easy"], ["/browse", "Drug library"],
  ["/formulas", "Formulas"], ["/alcohol-withdrawal", "Alcohol withdrawal calculator"],
  ["/qtc", "QTc calculator"],
  ["/benzodiazepine-equivalents", "Benzodiazepine equivalent dose calculator"],
  ["/subscribe", "Membership plans"], ["/contact", "Contact"],
  ["/terms", "Terms"], ["/privacy", "Privacy"], ["/refunds", "Refunds"]
];

export const drugSections = {
  classification: "Classification",
  mechanismOfActionAndReceptorProfile: "Mechanism of action and receptor profile",
  pharmacodynamics: "Pharmacodynamics",
  fdaApprovedAndOffLabelUses: "FDA approved and off-label uses",
  pharmacokineticsAndHalfLife: "Pharmacokinetics and half-life",
  clinicalDosingOptimizationAndTargetDose: "Clinical dosing, optimization, and target dose",
  sideEffects: "Side effects",
  fdaBlackBoxWarning: "FDA boxed warning",
  prescribingInSpecialPopulations: "Prescribing in special populations",
  drugInteractions: "Drug interactions",
  miscellaneous: "Miscellaneous"
};

export function plain(value) {
  if (Array.isArray(value)) return value.map(plain).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(plain).join(" ");
  return String(value ?? "").replace(/[#*_|`]/g, "").replace(/\s+/g, " ").trim();
}

export function drugDocuments(drug) {
  const content = { ...drug, clinicalDosingOptimizationAndTargetDose: [
    drug.clinicalDosingOptimizationAndTargetDose, drug.targetDose, drug.maximumDose
  ].filter(Boolean).join(" ") };
  return Object.entries(drugSections).filter(([key]) => plain(content[key])).map(([key, title]) => ({
    title, page: drug.name, text: plain(content[key]),
    href: `/library?drug=${encodeURIComponent(drug.id)}#section-${key}`
  }));
}

export function findMatches(documents, query) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return documents.filter(doc => words.every(word =>
    `${doc.page} ${doc.title} ${doc.text}`.toLocaleLowerCase().includes(word)
  )).sort((a, b) => Number(b.page.toLocaleLowerCase().includes(query.toLocaleLowerCase())) -
    Number(a.page.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
}

export function excerpt(text, query) {
  const lower = text.toLocaleLowerCase();
  const positions = query.trim().toLocaleLowerCase().split(/\s+/).map(word => lower.indexOf(word)).filter(i => i >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 90);
  const end = Math.min(text.length, start + 300);
  return `${start ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}
