import { serveAdverseEffectsPage, serveLibraryPage } from "../../server/pages.js";
import { methodNotAllowed, sendJson } from "../../server/http.js";

// One function serves every protected page; Vercel's free plan caps the function count.
const pages = {
  library: serveLibraryPage,
  "adverse-effects": serveAdverseEffectsPage
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }
  const name = String(request.query?.page || new URL(request.url || "/", "http://localhost").pathname.split("/").filter(Boolean).pop() || "");
  const serve = Object.hasOwn(pages, name) ? pages[name] : null;
  if (!serve) {
    sendJson(response, 404, { error: "Page not found." });
    return;
  }
  await serve(request, response);
}
