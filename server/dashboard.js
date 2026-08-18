import { listDrugs } from "./store.js";

export async function getDashboardData() {
  const drugs = (await listDrugs()).map(toDashboardDrug).filter((drug) => drug.id && drug.name);
  const classes = [...new Set(drugs.map((drug) => drug.medicationGroup).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));

  return {
    classes,
    drugs
  };
}

function toDashboardDrug(drug = {}) {
  return {
    id: String(drug.id || ""),
    name: String(drug.name || ""),
    brands: Array.isArray(drug.brands) ? drug.brands.map(String).filter(Boolean) : [],
    medicationGroup: String(drug.medicationGroup || ""),
    classification: String(drug.classification || "")
  };
}
