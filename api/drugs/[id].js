import { requireAdmin, requireDashboardAccess } from "../../server/auth.js";
import { deleteDrug, listDrugs, updateDrug } from "../../server/store.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  const id = getRouteId(request);

  try {
    if (request.method === "GET") {
      requireDashboardAccess(request);
      const drug = (await listDrugs()).find((item) => item.id === id);
      if (!drug) {
        sendJson(response, 404, { error: "Drug record not found." });
        return;
      }
      sendJson(response, 200, { drug });
      return;
    }

    if (request.method === "PUT" || request.method === "PATCH") {
      requireAdmin(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { drug: await updateDrug(id, body) });
      return;
    }

    if (request.method === "DELETE") {
      requireAdmin(request);
      sendJson(response, 200, { drug: await deleteDrug(id) });
      return;
    }

    methodNotAllowed(response, ["GET", "PUT", "PATCH", "DELETE"]);
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
