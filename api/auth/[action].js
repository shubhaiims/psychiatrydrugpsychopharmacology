import { getAccount, updateAccount } from "../../server/account.js";
import {
  establishRedirectSession,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword
} from "../../server/auth.js";
import { methodNotAllowed, readJsonBody, sendError, sendJson } from "../../server/http.js";
import { listMembers } from "../../server/members.js";

// Also serves /api/account and /api/admin/members (see vercel.json) to stay within Vercel's 12-function limit
export default async function handler(request, response) {
  const action = getRouteAction(request);

  try {
    if (action === "register") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const body = await readJsonBody(request);
      sendJson(response, 201, await registerUser(body, request, response));
      return;
    }

    if (action === "login") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const body = await readJsonBody(request);
      sendJson(response, 200, await loginUser(body, request, response));
      return;
    }

    if (action === "logout") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      sendJson(response, 200, await logoutUser(request, response));
      return;
    }

    if (action === "forgot-password") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const body = await readJsonBody(request);
      sendJson(response, 200, await requestPasswordReset(body, request));
      return;
    }

    if (action === "reset-password") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const body = await readJsonBody(request);
      sendJson(response, 200, await resetPassword(body, request, response));
      return;
    }

    if (action === "session") {
      if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
      const body = await readJsonBody(request);
      sendJson(response, 200, await establishRedirectSession(body, request, response));
      return;
    }

    if (action === "me") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      sendJson(response, 200, await getCurrentUser(request, response));
      return;
    }

    if (action === "account") {
      if (request.method === "GET") {
        sendJson(response, 200, await getAccount(request, response));
        return;
      }
      if (request.method === "PATCH") {
        sendJson(response, 200, await updateAccount(request, response));
        return;
      }
      return methodNotAllowed(response, ["GET", "PATCH"]);
    }

    if (action === "members") {
      if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
      sendJson(response, 200, await listMembers(request, response));
      return;
    }

    sendJson(response, 404, { error: "Auth route not found." });
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
