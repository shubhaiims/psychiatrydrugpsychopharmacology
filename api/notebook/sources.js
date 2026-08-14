import { assertMutationRequest, requireAdmin } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";
import { createNotebookSource, listNotebookSources } from "../../server/notebook-store.js";

export default async function handler(request, response) {
  try {
    if (request.method === "GET") {
      await requireAdmin(request, response);
      sendJson(response, 200, { sources: await listNotebookSources() });
      return;
    }

    if (request.method === "POST") {
      assertMutationRequest(request);
      await requireAdmin(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 201, { source: await createNotebookSource(body) });
      return;
    }

    methodNotAllowed(response, ["GET", "POST"]);
  } catch (error) {
    sendError(response, error);
  }
}
