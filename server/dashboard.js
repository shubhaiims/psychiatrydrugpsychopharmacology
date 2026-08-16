import { listDrugs } from "./store.js";

export async function getDashboardData() {
  const drugs = (await listDrugs()).map(toDashboardDrug).filter((drug) => drug.id && drug.name);
  const classes = [...new Set(drugs.map((drug) => drug.medicationGroup).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  const recent = [...drugs]
    .sort((first, second) => String(second.updatedAt).localeCompare(String(first.updatedAt)))
    .slice(0, 5);

  return {
    stats: {
      totalDrugs: drugs.length,
      totalClasses: classes.length,
      lastUpdated: recent[0]?.updatedAt || ""
    },
    classes,
    recent,
    drugs
  };
}

function toDashboardDrug(drug = {}) {
  return {
    id: String(drug.id || ""),
    name: String(drug.name || ""),
    brands: Array.isArray(drug.brands) ? drug.brands.map(String).filter(Boolean) : [],
    medicationGroup: String(drug.medicationGroup || ""),
    classification: String(drug.classification || ""),
    updatedAt: String(drug.updatedAt || drug.lastReviewed || "").slice(0, 10)
  };
}
