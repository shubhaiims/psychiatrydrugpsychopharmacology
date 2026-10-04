const list = document.getElementById("researchList");
const status = document.getElementById("researchStatus");
const updated = document.getElementById("researchUpdated");
const filter = document.getElementById("researchFilter");
let items = [];

const safeLink = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)\//;

function formatDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).toUpperCase();
}

function render() {
  const term = filter.value.trim().toLowerCase();
  const visible = items.filter((item) => !term || `${item.title} ${item.journal}`.toLowerCase().includes(term));
  list.replaceChildren(...visible.map((item) => {
    const row = document.createElement("li");
    row.className = "research-item";
    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.textContent = item.title;
    if (safeLink.test(item.url)) {
      link.href = item.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    title.append(link);
    const meta = document.createElement("p");
    meta.className = "research-meta";
    const journal = document.createElement("strong");
    journal.textContent = item.journal;
    meta.append(journal, ` · ${formatDate(item.date)}`);
    row.append(title, meta);
    if (item.authors) {
      const authors = document.createElement("p");
      authors.className = "research-authors";
      authors.textContent = item.authors;
      row.append(authors);
    }
    return row;
  }));
  status.hidden = visible.length > 0;
  if (!visible.length) status.textContent = items.length ? "No articles match your filter." : "The first research update is on its way. Please check back soon.";
}

async function load() {
  try {
    const response = await fetch("/research.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    items = Array.isArray(data.items) ? data.items : [];
    if (data.updated) {
      const when = new Date(data.updated);
      if (!Number.isNaN(when.getTime())) updated.textContent = `Source: PubMed. Last updated ${when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`;
    }
    render();
  } catch {
    status.hidden = false;
    status.textContent = "Latest research could not be loaded. Please try again later.";
  }
}

filter.addEventListener("input", render);
load();
