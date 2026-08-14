import { assertMutationRequest, requireUser } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";
import { searchNotebook } from "../../server/notebook-store.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    assertMutationRequest(request);
    await requireUser(request, response);
    const body = await readJsonBody(request);
    sendJson(response, 200, await searchNotebook(body.query));
  } catch (error) {
    sendError(response, error);
  }
}
