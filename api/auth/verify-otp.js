import { verifyUserOtp } from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "POST") {
    methodNotAllowed(response, ["POST"]);
    return;
  }

  try {
    const body = await readJsonBody(request);
    sendJson(response, 200, await verifyUserOtp(body));
  } catch (error) {
    sendError(response, error);
  }
}
