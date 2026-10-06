// Adverse effects reference: system-wise index and topic pages.
// Content is embedded server-side as JSON in #aeData (see server/pages.js).
(function () {
  "use strict";

  const main = document.getElementById("aeMain");
  const dataNode = document.getElementById("aeData");
  if (!main || !dataNode) return;

  let data;
  try {
    data = JSON.parse(dataNode.textContent);
  } catch {
    main.innerHTML = '<p class="ae-empty">This page could not be loaded. Please refresh.</p>';
    return;
  }

  const MODE_KEY = "pme-ae-mode";
  const RISK_ORDER = ["high", "moderate", "low", "minimal", "loss"];
  const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // Inline markup used in content files: **bold** and numbered citations [1] or [1,2].
  function md(value) {
    return esc(value)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(\d+(?:,\d+)*)\]/g, (match, nums) =>
        '<sup class="cite">[' + nums.split(",").map((n) => `<a href="#ref-${n}" aria-label="Reference ${n}">${n}</a>`).join(",") + "]</sup>");
  }

  function list(items, plain) {
    return `<ul class="ae-list${plain ? " ae-list--plain" : ""}">` + items.map((item) => `<li>${md(item)}</li>`).join("") + "</ul>";
  }

  function table(head, rows, stack = true) {
    const labels = head;
    return `<div class="ae-table-wrap"><table class="ae-table${stack ? " ae-table--stack" : ""}"><thead><tr>` +
      head.map((h) => `<th scope="col">${md(h)}</th>`).join("") + "</tr></thead><tbody>" +
      rows.map((row) => "<tr>" + row.map((cell, i) => (i ? `<td data-label="${esc(labels[i])}">${md(cell)}</td>` : `<td>${md(cell)}</td>`)).join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }

  function section(id, title, sub, body) {
    return `<section class="ae-section" id="${id}" aria-labelledby="${id}-h"><h2 id="${id}-h">${esc(title)}</h2>` +
      (sub ? `<p class="ae-sub">${md(sub)}</p>` : "") + body + "</section>";
  }

  function systemName(id) {
    const system = data.systems.find((s) => s.id === id);
    return system ? system.name : "";
  }

  function titleCase(id) {
    return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (data.topic) {
    renderTopic(data.topic);
  } else {
    renderIndex();
  }

  // ===== Index =====
  function renderIndex() {
    document.title = "Adverse Effects | Psychiatry Made Easy";
    const published = data.topics.filter((t) => t.published).length;

    const systems = data.systems.map((system) => {
      const topics = data.topics.filter((t) => t.system === system.id)
        .sort((a, b) => Number(b.published) - Number(a.published) || a.name.localeCompare(b.name));
      return { system, topics };
    }).filter((group) => group.topics.length);

    const jump = systems.map(({ system, topics }) =>
      `<a href="#sys-${esc(system.id)}">${esc(system.name)}<span>${topics.length}</span></a>`).join("");

    const groups = systems.map(({ system, topics }) => {
      const ready = topics.filter((t) => t.published).length;
      const items = topics.map((t) => {
        const search = esc(`${t.name} ${system.name} ${t.summary || ""}`.toLowerCase());
        if (t.published) {
          return `<li class="ae-topic" data-search="${search}"><a href="/adverse-effects?topic=${encodeURIComponent(t.id)}">` +
            `<span class="ae-topic__name">${esc(t.name)}</span>` +
            (t.summary ? `<span class="ae-topic__sum">${esc(t.summary)}</span>` : "") +
            `<span class="ae-topic__go"><span>Read</span>${ARROW}</span></a></li>`;
        }
        return `<li class="ae-topic is-pending" data-search="${search}"><div><span class="ae-topic__name">${esc(t.name)}</span>` +
          '<span class="ae-topic__soon">In preparation</span></div></li>';
      }).join("");
      return `<section class="ae-system" id="sys-${esc(system.id)}" data-system><div class="ae-system__head"><h2>${esc(system.name)}</h2>` +
        `<p>${topics.length} topic${topics.length === 1 ? "" : "s"}${ready ? ` · ${ready} available` : ""}</p></div>` +
        `<ul class="ae-topics">${items}</ul></section>`;
    }).join("");

    main.innerHTML =
      '<header class="ae-hero"><div><p class="ae-eyebrow">Clinical reference</p><h1 class="ae-title">Adverse effects</h1>' +
      '<p class="ae-lead">Organised by body system. Each topic covers recognition, the drugs implicated, monitoring and management, with the mechanism and evidence behind it.</p></div>' +
      '<div class="ae-search"><label for="aeSearch">Find an adverse effect</label><div class="ae-search__field">' +
      '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="9" cy="9" r="6.5" stroke="currentColor" stroke-width="1.6"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<input id="aeSearch" type="search" placeholder="e.g. weight gain, QTc, prolactin" autocomplete="off" spellcheck="false" /></div>' +
      `<p class="ae-stats">${data.topics.length} topics across ${systems.length} body systems · ${published} available</p></div></header>` +
      (data.notFound ? '<p class="ae-notice">That topic is not available yet. Choose another from the list below.</p>' : "") +
      `<nav class="ae-jump" aria-label="Body systems">${jump}</nav>` +
      `<div id="aeGroups">${groups}</div>` +
      '<p class="ae-empty" id="aeNoResults" hidden>No adverse effect matches that search.</p>';

    const input = document.getElementById("aeSearch");
    const noResults = document.getElementById("aeNoResults");
    input.addEventListener("input", () => {
      const query = input.value.trim().toLowerCase();
      let shown = 0;
      document.querySelectorAll("[data-system]").forEach((group) => {
        let groupShown = 0;
        group.querySelectorAll(".ae-topic").forEach((item) => {
          const match = !query || item.dataset.search.includes(query);
          item.hidden = !match;
          if (match) groupShown += 1;
        });
        group.hidden = groupShown === 0;
        shown += groupShown;
      });
      noResults.hidden = shown !== 0;
    });
  }

  // ===== Topic =====
  function renderTopic(t) {
    document.title = `${t.title} | Adverse Effects | Psychiatry Made Easy`;
    const entry = data.topics.find((x) => x.id === t.id);
    const sysName = entry ? systemName(entry.system) : "";
    const reviewed = t.lastReviewed
      ? new Date(`${t.lastReviewed}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : "";

    const clinic = [
      ["keypoints", "Key points"],
      ["features", "Clinical features"],
      ["risk", "Risk factors"],
      ["drugs", "Drugs implicated"],
      ["monitoring", "Monitoring"],
      ["management", "Management"]
    ];
    const learn = [
      ["mechanism", "Mechanism"],
      ["differential", "Differential diagnosis"],
      ["evidence", "Key evidence"],
      ["exam", "Exam pearls"],
      ["selftest", "Self-test"]
    ];
    const rail = (items, folded) => `<ul${folded ? ' class="ae-learn-links"' : ""}>` + items.map(([id, label]) => `<li><a href="#${id}">${label}</a></li>`).join("") + "</ul>";

    main.innerHTML =
      `<nav class="ae-crumbs" aria-label="Breadcrumb"><a href="/adverse-effects">Adverse effects</a><span aria-hidden="true">/</span>` +
      (entry ? `<a href="/adverse-effects#sys-${esc(entry.system)}">${esc(sysName)}</a><span aria-hidden="true">/</span>` : "") +
      `<span aria-current="page">${esc(t.title)}</span></nav>` +
      '<header class="ae-head"><div>' +
      (sysName ? `<p class="ae-eyebrow"><a href="/adverse-effects#sys-${esc(entry.system)}">${esc(sysName)}</a></p>` : "") +
      `<h1 class="ae-title">${esc(t.title)}</h1>` + (t.summary ? `<p class="ae-lead">${esc(t.summary)}</p>` : "") +
      '<p class="ae-meta">' +
      (t.reviewer ? `<span>Reviewed by <b>${esc(t.reviewer)}</b></span>` : "") +
      (reviewed ? `<span>${esc(reviewed)}</span>` : "") +
      `<span>${t.references.length} references</span></p></div>` +
      '<div><div class="ae-mode" role="group" aria-label="Page emphasis">' +
      '<button type="button" data-mode="clinic" aria-pressed="true">Clinic</button>' +
      '<button type="button" data-mode="learn" aria-pressed="false">Learn</button></div>' +
      '<p class="ae-mode__hint" id="aeModeHint"></p></div></header>' +
      '<div class="ae-layout">' +
      `<nav class="ae-rail" aria-label="On this page"><div><h2>Use it</h2>${rail(clinic)}</div><div id="aeRailLearn"><h2>Understand it</h2>${rail(learn, true)}</div>` +
      `<div><h2>Sources</h2><ul><li><a href="#references">References</a></li></ul></div></nav>` +
      '<article class="ae-content">' +
      keyPoints(t) + features(t) + risk(t) + drugs(t) + monitoring(t) + management(t) +
      '<div class="ae-divider">Understand it</div>' +
      '<div class="ae-gate" id="aeGate"><div><strong>Mechanism, evidence and exam preparation</strong>' +
      '<p>Mechanism, differential diagnosis, key evidence, exam pearls and a self-test.</p></div>' +
      '<button type="button" class="ae-btn" id="aeGateOpen">Show these sections</button></div>' +
      '<div id="aeLearn">' + mechanism(t) + differential(t) + evidence(t) + exam(t) + selfTest(t) + "</div>" +
      references(t) +
      "</article></div>";

    wireTopic();
  }

  function keyPoints(t) {
    return '<section class="ae-keypoints" id="keypoints" aria-labelledby="keypoints-h"><h2 id="keypoints-h">Key points</h2><ol>' +
      t.keyPoints.map((k) => `<li><span>${md(k)}</span></li>`).join("") + "</ol></section>";
  }

  function features(t) {
    const cf = t.clinicalFeatures;
    const c = cf.course || {};
    return section("features", "Clinical features", "",
      `<p>${md(cf.definition)}</p>` +
      '<div class="ae-facts">' +
      `<div><span>Onset</span>${md(c.onset || "")}</div>` +
      `<div><span>Main driver</span>${md(c.driver || "")}</div>` +
      `<div><span>Reversible?</span>${md(c.reversible || "")}</div></div>` +
      `<p><strong>Consequences.</strong> ${md(cf.consequences)}</p>` +
      table(["Measure", "Threshold"], cf.thresholds.map((r) => [r.measure, r.value])));
  }

  function risk(t) {
    return section("risk", "Risk factors", "", list(t.riskFactors));
  }

  function drugs(t) {
    const classes = t.drugClasses || {};
    const body = Object.keys(classes).map((cls) => {
      const inClass = t.drugRatings.filter((r) => r.class === cls);
      if (!inClass.length) return "";
      const tiers = RISK_ORDER.map((level) => {
        const items = inClass.filter((r) => r.rating === level);
        if (!items.length) return "";
        const names = items.map((r) => {
          const group = r.group ? '<sup title="Rated as a group">G</sup>' : "";
          return r.drug
            ? `<a class="ae-drug" href="/library?drug=${encodeURIComponent(r.drug)}">${esc(titleCase(r.drug))}${group}</a>`
            : `<span class="ae-drug ae-drug--out">${esc(r.name)}</span>`;
        }).join("");
        return `<div class="ae-tier"><div class="ae-tier__label"><i class="ae-dot ae-dot--${level}"></i>${esc(t.ratingScale[level])}</div><div class="ae-tier__drugs">${names}</div></div>`;
      }).join("");
      return `<div class="ae-class"><h3>${esc(classes[cls])}</h3>${tiers}</div>`;
    }).join("");
    const notes = t.drugsImplicated || {};
    return section("drugs", "Drugs implicated", notes.note || "",
      body + `<p class="ae-note">Underlined drugs open their library page; grey names are not in the library.` +
      (notes.groupNote ? ` G: ${md(notes.groupNote)}` : "") + "</p>");
  }

  function monitoring(t) {
    const m = t.monitoring;
    return section("monitoring", "Monitoring", "Two published schedules",
      table(["Check", m.sources.maudsley, m.sources.adaapa], m.rows.map((r) => [r.check, r.maudsley, r.adaapa])) +
      `<p class="ae-note">${md(m.ifAbnormal)}</p>`);
  }

  function management(t) {
    const M = t.management;
    const steps = '<ol class="ae-steps">' + M.steps.map((s) =>
      `<li><div><h3>${esc(s.step)}</h3>${list(s.items, true)}</div></li>`).join("") + "</ol>";

    const F = M.flowchart;
    const colors = ["high", "moderate", "low", "loss"];
    const flow = `<h3 class="ae-h3" id="flowchart">When to start metformin</h3><p class="ae-note ae-note--lead">${md(F.appliesTo)}</p>` +
      '<div class="ae-flow">' + F.groups.map((g, i) =>
        `<div class="ae-flow__card ae-flow__card--${colors[i] || "low"}"><div class="ae-flow__risk">${esc(g.risk)}</div>` +
        `<div class="ae-flow__drugs">${esc(g.drugs)}</div><div class="ae-flow__if"><span>If</span>${md(g.condition)}</div>` +
        `<div class="ae-flow__act">${md(g.action)}</div></div>`).join("") + "</div>" +
      `<p class="ae-callout">${md(F.always)}</p>`;

    const met = M.metformin;
    const metformin = '<h3 class="ae-h3" id="metformin">Metformin</h3>' +
      `<p>${md(met.effect)} ${md(met.howItWorks)}</p><p><strong>Before starting.</strong> ${md(met.before)}</p>` +
      '<div class="ae-cols"><div><p class="ae-h4">Dose escalation</p>' +
      table(["Week", "Morning", "Evening"], met.titration.map((r) => [r.week, r.morning, r.evening]), false) +
      list(met.tips, true) + '</div><div><p class="ae-h4">Side effects</p>' +
      table(["Frequency", "Effects"], met.sideEffects.map((r) => [r.frequency, r.effects])) + "</div></div>" +
      '<div class="ae-cols ae-cols--3 ae-gap-top">' +
      `<div><p class="ae-h4">Avoid with</p>${list(met.avoid, true)}</div>` +
      `<div><p class="ae-h4">Monitor</p>${list(met.monitor, true)}</div>` +
      `<div><p class="ae-h4">When to stop</p>${list(met.stop, true)}</div></div>` +
      `<p class="ae-note">Source for this subsection: ${md(met.cite)}</p>`;

    const OM = M.obesityMedications;
    const meds = '<h3 class="ae-h3" id="obesity-meds">Obesity medications</h3>' + `<p>${md(OM.intro)}</p>` +
      table(["Drug", "Weight loss", "Dose", "Avoid with"], OM.rows.map((r) => [r.drug, r.loss, r.dose, r.avoid])) +
      list(OM.goals, true) +
      (M.otherOptions && M.otherOptions.length
        ? '<p class="ae-h4 ae-gap-top">Other options</p>' + table(["Option", "Evidence"], M.otherOptions.map((o) => [o.option, o.notes]))
        : "");

    const bmi = `<h3 class="ae-h3" id="bmi">Treatment by BMI class ${md(M.bmiClasses.cite)}</h3>` +
      table(["Class", "BMI (kg/m²)", "Recommended treatment"], M.bmiClasses.rows.map((r) => [r.cls, r.bmi, r.treatment]));

    return section("management", "Management", "In order", steps + flow + metformin + meds + bmi);
  }

  function mechanism(t) {
    const ME = t.mechanism;
    const node = (text, kind) => `<div class="ae-node${kind ? ` ae-node--${kind}` : ""}">${md(text)}</div>`;
    const arrow = '<div class="ae-arrow" aria-hidden="true"></div>';
    const diagrams = ME.diagrams.map((d) => {
      const branches = `<div class="ae-branches ae-branches--${d.branches.length}">` + d.branches.map((b) =>
        '<div class="ae-branch">' + node(b.head, b.uncertain ? "maybe" : "") +
        (b.items || []).map((item) => arrow + node(item, b.uncertain ? "maybe" : "")).join("") + "</div>").join("") + "</div>";
      const join = d.join.map((j, i) => arrow + node(j, d.joinUncertain ? "maybe" : i === d.join.length - 1 ? "end" : "")).join("");
      return `<figure class="ae-diagram"><figcaption>${esc(d.title)} ${md(d.cite)}</figcaption>` +
        (d.note ? `<p class="ae-dnote">${esc(d.note)}</p>` : "") +
        (d.context ? `<p class="ae-dctx">${md(d.context)}</p>` : '<p class="ae-dctx"></p>') +
        node(d.start, d.startUncertain ? "maybe" : "start") + arrow + branches + join + "</figure>";
    }).join("");
    return section("mechanism", "Mechanism", "",
      `<p>${md(ME.intro)}</p><div class="ae-diagrams">${diagrams}</div>` +
      `<p class="ae-note">Dashed boxes mark uncertain or possible links. ${md(ME.metformin)}</p>`);
  }

  function differential(t) {
    return section("differential", "Differential diagnosis", "Other causes to consider", list(t.differentialDiagnosis));
  }

  function evidence(t) {
    return section("evidence", "Key evidence", "", table(["Study", "Finding"], t.keyEvidence.map((e) => [e.study, e.finding])));
  }

  function exam(t) {
    return section("exam", "Exam pearls", "", list(t.examPearls));
  }

  function selfTest(t) {
    const q = t.selfTest;
    return section("selftest", "Self-test", "",
      `<p>${md(q.question)}</p><div class="ae-quiz" id="aeQuiz">` +
      q.options.map((o, i) => `<button type="button" data-ok="${o.correct ? 1 : 0}">${String.fromCharCode(65 + i)}. ${esc(o.text)}</button>`).join("") +
      `</div><p class="ae-quiz-exp" id="aeQuizExp" hidden>${md(q.explanation)}</p>`);
  }

  function references(t) {
    return `<section class="ae-section ae-section--last" id="references" aria-labelledby="references-h"><h2 id="references-h">References</h2>` +
      '<ol class="ae-refs">' + t.references.map((r, i) => `<li id="ref-${i + 1}">${md(r)}</li>`).join("") + "</ol></section>";
  }

  function wireTopic() {
    const learn = document.getElementById("aeLearn");
    const gate = document.getElementById("aeGate");
    const hint = document.getElementById("aeModeHint");
    const railLearn = document.getElementById("aeRailLearn");
    const buttons = document.querySelectorAll(".ae-mode button");

    function openLearn() {
      learn.hidden = false;
      gate.hidden = true;
      railLearn.classList.remove("is-folded");
    }

    function setMode(mode, remember) {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
      if (mode === "learn") {
        openLearn();
        hint.textContent = "All sections open, including mechanism and exam preparation.";
      } else {
        learn.hidden = true;
        gate.hidden = false;
        railLearn.classList.add("is-folded");
        hint.textContent = "Same page. Learn opens mechanism, evidence and exam sections.";
      }
      if (remember) {
        try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
      }
    }

    let saved = "clinic";
    try { if (localStorage.getItem(MODE_KEY) === "learn") saved = "learn"; } catch { /* storage unavailable */ }
    setMode(saved, false);
    buttons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode, true)));
    document.getElementById("aeGateOpen").addEventListener("click", () => {
      openLearn();
      document.getElementById("mechanism").scrollIntoView({ block: "start" });
    });

    // Links into folded sections open them first.
    main.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (target && learn.contains(target) && learn.hidden) {
        event.preventDefault();
        openLearn();
        target.scrollIntoView({ block: "start" });
      }
    });

    const quiz = document.getElementById("aeQuiz");
    quiz.addEventListener("click", (event) => {
      const choice = event.target.closest("button");
      if (!choice) return;
      quiz.querySelectorAll("button").forEach((b) => {
        b.classList.remove("is-right", "is-wrong");
        if (b.dataset.ok === "1") b.classList.add("is-right");
      });
      if (choice.dataset.ok !== "1") choice.classList.add("is-wrong");
      document.getElementById("aeQuizExp").hidden = false;
    });

    // Highlight the section in view.
    const links = Array.from(document.querySelectorAll(".ae-rail a"));
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => {
            const on = l.getAttribute("href") === `#${entry.target.id}`;
            l.classList.toggle("is-active", on);
            if (on && window.innerWidth <= 900) l.scrollIntoView({ block: "nearest", inline: "center" });
          });
        });
      }, { rootMargin: "-25% 0px -65% 0px" });
      links.forEach((l) => {
        const target = document.getElementById(l.getAttribute("href").slice(1));
        if (target) observer.observe(target);
      });
    }
  }
})();
