import { assertMutationRequest, requireAdmin, requireUser } from "../server/auth.js";
import { createDrug, listDrugs, replaceDrugs } from "../server/store.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../server/http.js";

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      await requireUser(request, response);
      sendJson(response, 200, { drugs: await listDrugs() });
      return;
    }

    if (request.method === "POST") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 201, { drug: await createDrug(body) });
      return;
    }

    if (request.method === "PUT") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      if (!Array.isArray(body)) {
        sendJson(response, 400, { error: "Expected a JSON array of drug records." });
        return;
      }
      sendJson(response, 200, { drugs: await replaceDrugs(body) });
      return;
    }

    methodNotAllowed(response, ["GET", "POST", "PUT"]);
  } catch (error) {
    sendError(response, error);
  }
}
