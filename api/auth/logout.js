import { logoutUser } from "../../server/auth.js";
import { methodNotAllowed, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    sendJson(response, 200, await logoutUser(request, response));
  } catch (error) {
    sendError(response, error);
  }
}
