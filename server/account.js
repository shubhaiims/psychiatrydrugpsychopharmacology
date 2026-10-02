import { assertMutationRequest, isAdminUser, normalizeFullName, requireUser, toPublicUser } from "./auth.js";
import { getMembershipStatus } from "./billing.js";
import { readJsonBody } from "./http.js";
import { supabaseAuthRequest } from "./supabase.js";

export async function getAccount(request, response) {
  const session = await requireUser(request, response);
  const [admin, membership] = await Promise.all([
    isAdminUser(session.user.id),
    readMembership(session)
  ]);
  return {
    user: toAccountUser(session.user),
    role: admin ? "admin" : "user",
    membership
  };
}

export async function updateAccount(request, response) {
  assertMutationRequest(request);
  const session = await requireUser(request, response);
  const input = await readJsonBody(request);
  const fullName = normalizeFullName(input?.fullName);

  // The database trigger copies the new name into public.profiles
  const saved = await supabaseAuthRequest("user", {
    method: "PUT",
    accessToken: session.accessToken,
    body: { data: { full_name: fullName } }
  });

  return {
    ok: true,
    user: { ...toAccountUser(session.user), fullName, email: String(saved?.email || session.user.email || "") }
  };
}

// A missing payments setup should never break the account page
async function readMembership(session) {
  try {
    return await getMembershipStatus(session);
  } catch (error) {
    console.error("Account membership lookup failed.", error);
    return null;
  }
}

function toAccountUser(user) {
  const { id, fullName, email } = toPublicUser(user);
  return { id, fullName, email };
}
