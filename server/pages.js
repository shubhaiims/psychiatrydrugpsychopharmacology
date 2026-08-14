import { readFile } from "node:fs/promises";
import { requireAdmin, requireUser } from "./auth.js";
import { sendError } from "./http.js";

const libraryPage = new URL("./library.html", import.meta.url);
const adminPage = new URL("./admin.html", import.meta.url);

export async function serveLibraryPage(request, response) {
  return serveProtectedPage(request, response, {
    authorize: requireUser,
    file: libraryPage,
    loginPath: "/login?next=%2Flibrary"
  });
}

export async function serveAdminPage(request, response) {
  return serveProtectedPage(request, response, {
    authorize: requireAdmin,
    file: adminPage,
    loginPath: "/admin/login"
  });
}

async function serveProtectedPage(request, response, options) {
  try {
    await options.authorize(request, response);
    const html = await readFile(options.file, "utf8");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "private, no-store");
    response.end(html);
  } catch (error) {
    if ([401, 403].includes(error.status)) {
      response.statusCode = 303;
      response.setHeader("Location", options.loginPath);
      response.setHeader("Cache-Control", "no-store");
      response.end();
      return;
    }
    sendError(response, error);
  }
}
