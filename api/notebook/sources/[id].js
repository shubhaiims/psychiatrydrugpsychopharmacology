import { requireAdmin } from "../../../server/auth.js";
import { methodNotAllowed, sendError, sendJson } from "../../../server/http.js";
import { deleteNotebookSource } from "../../../server/notebook-store.js";

export default async function handler(request, response) {
  try {
    if (request.method === "DELETE") {
      requireAdmin(request);
      sendJson(response, 200, { source: await deleteNotebookSource(getRouteId(request)) });
      return;
    }

    methodNotAllowed(response, ["DELETE"]);
  } catch (error) {
    sendError(response, error);
  }
}

function getRouteId(request) {
  if (request.query?.id) {
    return Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;
  }
  const url = new URL(request.url || "/", "http://localhost");
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
}
