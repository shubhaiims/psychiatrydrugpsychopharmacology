const menuButton = document.querySelector(".side-menu-toggle");
const sidebar = document.querySelector("#homepageSidebar");
const backdrop = document.querySelector(".side-menu-backdrop");
const closeTargets = document.querySelectorAll("[data-sidebar-close]");
const sidebarLinks = document.querySelectorAll(".sidebar-nav a");
const calculator = document.querySelector("#benzodiazepineCalculator");
const alcoholVolume = document.querySelector("#alcoholVolume");
const alcoholPercentage = document.querySelector("#alcoholPercentage");
const baseAlcoholFactor = document.querySelector("#baseAlcoholFactor strong");
const chlordiazepoxideDose = document.querySelector("#chlordiazepoxideDose strong");
const diazepamDose = document.querySelector("#diazepamDose strong");
const lorazepamMaudsleyDose = document.querySelector("#lorazepamMaudsleyDose strong");
const lorazepamApaDose = document.querySelector("#lorazepamApaDose strong");

function setSidebarOpen(isOpen) {
  if (!menuButton || !sidebar || !backdrop) return;
  menuButton.setAttribute("aria-expanded", String(isOpen));
  sidebar.hidden = !isOpen;
  backdrop.hidden = !isOpen;
}

menuButton?.addEventListener("click", () => {
  const isOpen = menuButton.getAttribute("aria-expanded") === "true";
  setSidebarOpen(!isOpen);
});

closeTargets.forEach((target) => {
  target.addEventListener("click", () => setSidebarOpen(false));
});

sidebarLinks.forEach((link) => {
  link.addEventListener("click", () => setSidebarOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebarOpen(false);
  }
});

function formatDose(value) {
  if (!Number.isFinite(value)) return "-- mg";
  return `${value.toFixed(2).replace(/\.?0+$/, "")} mg`;
}

function updateBenzodiazepineDoses() {
  if (!alcoholVolume || !alcoholPercentage || !baseAlcoholFactor || !chlordiazepoxideDose || !diazepamDose || !lorazepamMaudsleyDose || !lorazepamApaDose) return;

  const volume = Number.parseFloat(alcoholVolume.value);
  const percentage = Number.parseFloat(alcoholPercentage.value);
  const hasValidInputs = Number.isFinite(volume) && Number.isFinite(percentage) && volume >= 0 && percentage >= 0 && percentage <= 100;
  const alcoholFactor = hasValidInputs ? (volume * percentage) / 1000 : Number.NaN;

  baseAlcoholFactor.textContent = Number.isFinite(alcoholFactor) ? alcoholFactor.toFixed(2).replace(/\.?0+$/, "") : "--";
  chlordiazepoxideDose.textContent = formatDose(alcoholFactor);
  diazepamDose.textContent = formatDose(0.4 * alcoholFactor);
  lorazepamMaudsleyDose.textContent = formatDose(0.04 * alcoholFactor);
  lorazepamApaDose.textContent = formatDose(0.08 * alcoholFactor);
}

calculator?.addEventListener("input", updateBenzodiazepineDoses);
calculator?.addEventListener("submit", (event) => event.preventDefault());
