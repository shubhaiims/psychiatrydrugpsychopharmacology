import { registerUser } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(request);
    sendJson(response, 201, await registerUser(body, request, response));
  } catch (error) {
    sendError(response, error);
  }
}
