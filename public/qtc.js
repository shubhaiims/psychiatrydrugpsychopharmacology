const $ = (id) => document.getElementById(id);

const els = {
  sidebar: $("sidebar"),
  scrim: $("sidebarScrim"),
  menuBtn: $("menuBtn"),
  libraryToggle: $("libraryToggle"),
  librarySubgroup: $("librarySubgroup"),
  formulaToggle: $("formulaToggle"),
  formulaSubgroup: $("formulaSubgroup"),
  authArea: $("authArea"),
  hr: $("hrInput"),
  qt: $("qtInput"),
  qtToggle: $("qtUnitToggle"),
  hrError: $("hrError"),
  qtError: $("qtError"),
  resultValue: $("resultValue"),
  resultNote: $("resultNote"),
  adviceLine: $("adviceLine")
};

let qtUnit = "ms";

const FORMULAS = {
  bazett: { name: "Bazett", calc: (qt, rrS) => qt / Math.sqrt(rrS) },
  fridericia: { name: "Fridericia", calc: (qt, rrS) => qt / Math.cbrt(rrS) },
  framingham: { name: "Framingham", calc: (qt, rrS) => qt + 154 * (1 - rrS) },
  hodges: { name: "Hodges", calc: (qt, rrS, hr) => qt + 1.75 * (hr - 60) },
  rautaharju: { name: "Rautaharju", calc: (qt, rrS, hr) => (qt * (120 + hr)) / 180 }
};

bindEvents();
initializeAuthUi();
calculate();

function bindEvents() {
  els.menuBtn?.addEventListener("click", () => setSidebarOpen(!els.sidebar?.classList.contains("is-open")));
  els.scrim?.addEventListener("click", () => setSidebarOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSidebarOpen(false);
    }
  });

  els.libraryToggle?.addEventListener("click", () => toggleSubgroup(els.libraryToggle, els.librarySubgroup));
  els.formulaToggle?.addEventListener("click", () => toggleSubgroup(els.formulaToggle, els.formulaSubgroup));

  els.qtToggle.addEventListener("click", toggleQtUnit);

  document.querySelectorAll('input[name="paperSpeed"]').forEach((input) => {
    input.addEventListener("change", calculate);
  });

  document.querySelectorAll(".qtc-listbox__opt input, .qtc-seg__opt input").forEach((input) => {
    input.addEventListener("change", () => {
      input.closest(".qtc-listbox, .qtc-seg").querySelectorAll(".is-selected").forEach((option) => {
        option.classList.remove("is-selected");
      });
      input.closest("label").classList.add("is-selected");
      calculate();
    });
  });

  [els.hr, els.qt].forEach((input) => input.addEventListener("input", calculate));

  document.querySelectorAll(".qtc-acc__btn").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.nextElementSibling;
      const open = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!open));
      panel.hidden = open;
    });
  });

  document.querySelectorAll(".qtc-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".qtc-tab").forEach((item) => {
        item.classList.remove("is-active");
        item.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".qtc-panel").forEach((panel) => {
        panel.hidden = true;
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      $(`tab-${tab.dataset.tab}`).hidden = false;
    });
  });
}

function selected(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function msPerBox() {
  return selected("paperSpeed") === "50" ? 20 : 40;
}

function interpret(qtc) {
  if (qtc < 350) return "Short QT - confirm measurement accuracy; consider short QT syndrome.";
  if (qtc < 450) return "Normal (prolonged: >450 ms men, >470 ms women).";
  if (qtc < 500) return "Borderline - prolonged for men; review medications and electrolytes, repeat ECG.";
  return "High risk of torsades de pointes - stop/reduce offending agents, correct K+/Mg2+, cardiology review.";
}

function calculate() {
  const hrRaw = els.hr.value.trim();
  const qtRaw = els.qt.value.trim();
  setError(els.hrError, "");
  setError(els.qtError, "");

  if (!hrRaw || !qtRaw) {
    els.resultValue.textContent = "Please fill out required fields.";
    els.resultNote.hidden = true;
    els.adviceLine.textContent = "Enter values above to calculate the corrected QT interval.";
    return;
  }

  const hr = Number(hrRaw);
  let qtValue = Number(qtRaw);
  let valid = true;

  if (!Number.isFinite(hr) || hr < 20 || hr > 300) {
    setError(els.hrError, "Heart rate must be 20-300 beats/min.");
    valid = false;
  }

  if (!Number.isFinite(qtValue)) {
    setError(els.qtError, "QT interval is required.");
    valid = false;
  } else if (qtUnit === "boxes") {
    const minBoxes = 100 / msPerBox();
    const maxBoxes = 700 / msPerBox();
    if (qtValue < minBoxes || qtValue > maxBoxes) {
      setError(els.qtError, `QT must be ${formatNumber(minBoxes)}-${formatNumber(maxBoxes)} small boxes at this paper speed.`);
      valid = false;
    }
    qtValue *= msPerBox();
  } else if (qtValue < 100 || qtValue > 700) {
    setError(els.qtError, "QT interval must be 100-700 msec.");
    valid = false;
  }

  if (!valid) {
    els.resultValue.textContent = "Fix the highlighted fields.";
    els.resultNote.hidden = true;
    els.adviceLine.textContent = "Correct the highlighted fields to calculate the corrected QT interval.";
    return;
  }

  const rrS = 60 / hr;
  const formula = FORMULAS[selected("formula")];
  const qtc = Math.round(formula.calc(qtValue, rrS, hr));
  const interpretation = interpret(qtc);

  els.resultValue.innerHTML = `<strong>QTc ${qtc} ms</strong> (${formula.name})<br>${escapeHtml(interpretation)}`;
  els.adviceLine.textContent = `QTc ${qtc} ms by ${formula.name} - ${interpretation}`;

  if (formula === FORMULAS.bazett && (hr < 60 || hr > 90)) {
    els.resultNote.textContent = "Note: Bazett overcorrects at high heart rates and undercorrects at low ones - confirm with Fridericia or Framingham at this rate.";
    els.resultNote.hidden = false;
  } else {
    els.resultNote.hidden = true;
  }
}

function toggleQtUnit() {
  const value = Number(els.qt.value);
  if (qtUnit === "ms") {
    qtUnit = "boxes";
    els.qtToggle.textContent = "small boxes ⇄";
    if (Number.isFinite(value) && value > 0) {
      els.qt.value = formatNumber(value / msPerBox());
    }
  } else {
    qtUnit = "ms";
    els.qtToggle.textContent = "msec ⇄";
    if (Number.isFinite(value) && value > 0) {
      els.qt.value = String(Math.round(value * msPerBox()));
    }
  }
  calculate();
}

function setSidebarOpen(isOpen) {
  if (!els.sidebar || !els.scrim || !els.menuBtn) return;
  els.sidebar.classList.toggle("is-open", isOpen);
  els.scrim.hidden = !isOpen;
  els.menuBtn.setAttribute("aria-expanded", String(isOpen));
}

function toggleSubgroup(toggle, subgroup) {
  if (!toggle || !subgroup) return;
  const isOpen = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!isOpen));
  subgroup.hidden = isOpen;
}

async function initializeAuthUi() {
  try {
    const response = await fetch("/api/auth/me", {
      headers: { Accept: "application/json" },
      credentials: "same-origin"
    });
    if (!response.ok) throw new Error("Not signed in.");
    const session = await response.json();
    const name = session.user?.fullName || session.user?.email || "My account";
    if (els.authArea) {
      els.authArea.innerHTML = `<a href="/library" class="dashboard-btn dashboard-btn--ghost">${escapeHtml(name)}</a>`;
    }
    document.querySelectorAll("[data-requires-auth]").forEach((element) => {
      element.hidden = false;
    });
  } catch {
    document.querySelectorAll("[data-requires-auth]").forEach((element) => {
      element.hidden = true;
    });
  }
}

function setError(element, message) {
  element.textContent = message;
  element.hidden = !message;
}

function formatNumber(value) {
  return value.toFixed(1).replace(/\.0$/, "");
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
