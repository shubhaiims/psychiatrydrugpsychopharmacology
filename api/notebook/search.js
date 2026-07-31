import { requireDashboardAccess } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";
import { searchNotebook } from "../../server/notebook-store.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    requireDashboardAccess(request);
    const body = await readJsonBody(request);
    sendJson(response, 200, await searchNotebook(body.query));
  } catch (error) {
    sendError(response, error);
  }
}
