import { pages, plain, drugDocuments, findMatches, excerpt } from "./search-index.js";

const query = (new URLSearchParams(location.search).get("q") || "").trim().slice(0, 200);
const input = document.querySelector("#query");
const status = document.querySelector("#status");
const notice = document.querySelector("#notice");
const results = document.querySelector("#results");
input.value = query;
if (query) search();
else status.textContent = "Enter a word or phrase to search.";

async function request(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok || new URL(response.url).pathname !== new URL(url, location.origin).pathname) {
    const error = new Error("Content unavailable");
    error.status = response.status;
    throw error;
  }
  return response;
}

function parse(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function pageDocuments(page, href, title) {
  page.querySelectorAll("script,style,nav,header,footer,[hidden]").forEach(node => node.remove());
  const main = page.querySelector("main") || page.body;
  const headings = [...main.querySelectorAll("h1,h2,h3")];
  if (!headings.length) return [{ page: title, title, text: plain(main.textContent), href }];
  return headings.map((heading, index) => {
    const range = page.createRange();
    range.setStartAfter(heading);
    if (headings[index + 1]) range.setEndBefore(headings[index + 1]);
    else range.setEnd(main, main.childNodes.length);
    const anchor = heading.id || heading.closest("[id]")?.id;
    const fragment = anchor ? `#${encodeURIComponent(anchor)}` :
      `#:~:text=${encodeURIComponent(plain(heading.textContent))}`;
    return { page: title, title: plain(heading.textContent), text: plain(range.toString()), href: href + fragment };
  });
}

async function adverseDocuments() {
  const page = parse(await (await request("/adverse-effects")).text());
  const data = JSON.parse(page.querySelector("#aeData")?.textContent || "{}");
  const documents = (data.topics || []).map(topic => ({
    page: "Adverse effects", title: topic.name, text: plain(topic.summary || topic.name),
    href: `/adverse-effects?topic=${encodeURIComponent(topic.id)}`
  }));
  // Topic content is already public on the adverse-effects page.
  const loaded = await Promise.all((data.topics || []).filter(topic => topic.published).map(async topic => {
    const href = `/adverse-effects?topic=${encodeURIComponent(topic.id)}`;
    const detail = parse(await (await request(href)).text());
    const payload = JSON.parse(detail.querySelector("#aeData")?.textContent || "{}");
    const anchors = {
      keyPoints: "keypoints", clinicalFeatures: "features", riskFactors: "risk",
      drugsImplicated: "drugs", drugClasses: "drugs", ratingScale: "drugs", drugRatings: "drugs",
      monitoring: "monitoring", management: "management", mechanism: "mechanism",
      differentialDiagnosis: "differential", keyEvidence: "evidence", examPearls: "exam",
      selfTest: "selftest", references: "references", title: "", summary: ""
    };
    return Object.entries(payload.topic || {}).filter(([key]) => key in anchors).map(([key, value]) => ({
      page: topic.name, title: (key[0].toUpperCase() + key.slice(1)).replace(/([a-z])([A-Z])/g, "$1 $2"),
      text: plain(value), href: href + (anchors[key] ? `#${anchors[key]}` : "")
    }));
  }));
  return documents.concat(loaded.flat());
}

async function search() {
  document.title = `Search: ${query} | Psychiatry Made Easy`;
  const documents = [];
  let restricted = false;
  const tasks = [
    ...pages.map(async ([href, title]) => documents.push(...pageDocuments(parse(await (await request(href)).text()), href, title))),
    (async () => documents.push(...await adverseDocuments()))(),
    (async () => {
      let data;
      try { data = await (await request("/api/drugs")).json(); }
      catch (error) {
        if (![401, 403, 503].includes(error.status)) throw error;
        restricted = true;
        data = await (await request("/api/dashboard")).json();
      }
      documents.push(...(data.drugs || []).flatMap(drugDocuments));
    })()
  ];
  const settled = await Promise.allSettled(tasks);
  const failed = settled.filter(item => item.status === "rejected").length;
  const matches = findMatches(documents, query);
  status.textContent = matches.length ? `${matches.length} matching sections for "${query}"` :
    `No matching sections for "${query}".`;
  for (const match of matches) {
    const row = document.createElement("li");
    const page = document.createElement("small");
    page.textContent = match.page;
    const link = document.createElement("a");
    link.href = match.href;
    link.textContent = match.title;
    const snippet = document.createElement("p");
    highlight(snippet, excerpt(match.text, query));
    row.append(page, link, snippet);
    results.append(row);
  }
  if (restricted || failed) {
    notice.hidden = false;
    notice.textContent = [
      restricted ? "Public content is shown. Sign in with an active membership to search full drug monographs." : "",
      failed ? "Some content could not be loaded. Reload this page to retry." : ""
    ].filter(Boolean).join(" ");
    if (restricted) {
      const link = document.createElement("a");
      link.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
      link.textContent = " Sign in";
      notice.append(link);
    }
  }
}

function highlight(element, text) {
  const words = query.split(/\s+/).filter(Boolean).sort((a,b) => b.length - a.length);
  const escaped = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp("(" + escaped.join("|") + ")", "gi");
  for (const part of text.split(pattern)) {
    if (words.some(word => word.toLocaleLowerCase() === part.toLocaleLowerCase())) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      element.append(mark);
    } else element.append(document.createTextNode(part));
  }
}
