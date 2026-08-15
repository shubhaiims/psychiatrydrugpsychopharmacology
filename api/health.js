import { isAuthConfigured } from "../server/auth.js";
import { methodNotAllowed, sendError, sendJson } from "../server/http.js";
import { hasSupabaseServiceConfig, supabaseServiceRequest } from "../server/supabase.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }

  try {
    if (!isAuthConfigured() || !hasSupabaseServiceConfig()) {
      sendJson(response, 503, { ok: false, auth: "unavailable", database: "unavailable" });
      return;
    }

    await supabaseServiceRequest("drugs?select=id&limit=1");
    sendJson(response, 200, { ok: true, auth: "ready", database: "ready" });
  } catch (error) {
    sendError(response, error);
  }
}
