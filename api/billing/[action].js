import { assertMutationRequest, requireUser } from "../../server/auth.js";
import { createOrder, getMembershipStatus, getPublicBillingInfo, verifyPayment } from "../../server/billing.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";

export default async function handler(request, response) {
  const action = getRouteAction(request);

  try {
    if (action === "plans") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      sendJson(response, 200, getPublicBillingInfo());
      return;
    }

    if (action === "status") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      const session = await requireUser(request, response);
      sendJson(response, 200, await getMembershipStatus(session));
      return;
    }

    if (action === "order") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      assertMutationRequest(request);
      const session = await requireUser(request, response);
      sendJson(response, 201, await createOrder(session));
      return;
    }

    if (action === "verify") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      assertMutationRequest(request);
      const session = await requireUser(request, response);
      const body = await readJsonBody(request);
      sendJson(response, 200, await verifyPayment(session, body));
      return;
    }

    sendJson(response, 404, { error: "Billing route not found." });
  } catch (error) {
    sendError(response, error);
  }
}

function getRouteAction(request) {
  if (request.query?.action) {
    return Array.isArray(request.query.action) ? request.query.action[0] : request.query.action;
  }
  const url = new URL(request.url || "/", "http://localhost");
  return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
}
