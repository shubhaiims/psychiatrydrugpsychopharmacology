import { getDashboardData } from "../server/dashboard.js";
import { methodNotAllowed, sendError, sendJson } from "../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    sendJson(response, 200, await getDashboardData());
  } catch (error) {
    sendError(response, error);
  }
}
