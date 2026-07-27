import { getCurrentUser } from "../../server/auth.js";
import { methodNotAllowed, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    sendJson(response, 200, await getCurrentUser(request));
  } catch (error) {
    sendError(response, error);
  }
}
