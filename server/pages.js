import { readdir, readFile } from "node:fs/promises";
import { requireAdmin } from "./auth.js";
import { requireMember } from "./billing.js";
import { sendError } from "./http.js";

const libraryPage = new URL("./library.html", import.meta.url);
const adminPage = new URL("./admin.html", import.meta.url);
const adverseEffectsPage = new URL("./adverse-effects.html", import.meta.url);
const adverseEffectsList = new URL("./data/adverse-effects.json", import.meta.url);
const adverseEffectsDir = new URL("./data/adverse-effects/", import.meta.url);
const topicIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function serveLibraryPage(request, response) {
  return serveProtectedPage(request, response, {
    authorize: requireMember,
    file: libraryPage,
    loginPath: "/login?next=%2Flibrary",
    paywallPath: "/subscribe"
  });
}

// Public while the section is being built; to move it behind the paywall,
// set authorize back to requireMember (login and paywall paths are kept for that).
const ADVERSE_EFFECTS_PUBLIC = true;

export async function serveAdverseEffectsPage(request, response) {
  return serveProtectedPage(request, response, {
    authorize: ADVERSE_EFFECTS_PUBLIC ? async () => {} : requireMember,
    file: adverseEffectsPage,
    loginPath: "/login?next=%2Fadverse-effects",
    paywallPath: "/subscribe",
    render: (html) => renderAdverseEffectsPage(html, request)
  });
}

// Embeds the topic index, plus the requested topic's content, as a non-executable
// JSON block so the page works under the site's script-src 'self' policy.
async function renderAdverseEffectsPage(html, request) {
  const list = JSON.parse(await readFile(adverseEffectsList, "utf8"));
  const published = new Set(
    (await readdir(adverseEffectsDir)).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5))
  );

  const topics = [];
  for (const topic of list.topics) {
    const entry = { id: topic.id, name: topic.name, system: topic.system, published: published.has(topic.id) };
    if (entry.published) {
      const content = await readTopic(topic.id);
      entry.summary = content.summary || "";
    }
    topics.push(entry);
  }

  const requested = new URL(request.url || "/", "http://localhost").searchParams.get("topic") || "";
  const payload = { systems: list.systems, topics };
  if (requested) {
    if (topicIdPattern.test(requested) && published.has(requested)) {
      payload.topic = await readTopic(requested);
    } else {
      payload.notFound = true;
    }
  }

  const data = JSON.stringify(payload).replace(/</g, "\\u003c");
  return html.replace("<!-- adverse-effects-data -->", `<script type="application/json" id="aeData">${data}</script>`);
}

async function readTopic(id) {
  return JSON.parse(await readFile(new URL(`${id}.json`, adverseEffectsDir), "utf8"));
}

export async function serveAdminPage(request, response) {
  return serveProtectedPage(request, response, {
    authorize: requireAdmin,
    file: adminPage,
    loginPath: "/admin/login"
  });
}

async function serveProtectedPage(request, response, options) {
  try {
    await options.authorize(request, response);
    let html = await readFile(options.file, "utf8");
    if (options.render) html = await options.render(html);
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    response.end(html);
  } catch (error) {
    if (error.status === 402 && options.paywallPath) {
      response.statusCode = 303;
      response.setHeader("Location", options.paywallPath);
      response.setHeader("Cache-Control", "no-store");
      response.end();
      return;
    }
    if ([401, 403].includes(error.status)) {
      response.statusCode = 303;
      response.setHeader("Location", options.loginPath);
      response.setHeader("Cache-Control", "no-store");
      response.end();
      return;
    }
    sendError(response, error);
  }
}
