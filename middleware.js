import { next } from "@vercel/functions";
import { filterRequest } from "./security/request-filter.js";

export default function middleware(request) {
  return filterRequest(request, process.env.APP_ORIGIN) || next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!assets/|api/drugs(?:/|$)|api/notebook/sources(?:/|$)).*)"]
};
