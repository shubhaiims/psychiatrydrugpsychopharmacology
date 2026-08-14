import { loginUser } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(request);
    sendJson(response, 200, await loginUser(body, request, response, { adminOnly: true }));
  } catch (error) {
    sendError(response, error);
  }
}
