import { serveAdminPage } from "../../server/pages.js";
import { methodNotAllowed } from "../../server/http.js";

export default async function handler(request, response) {
  if (request.method !== "GET") {
    methodNotAllowed(response, ["GET"]);
    return;
  }
  await serveAdminPage(request, response);
}
