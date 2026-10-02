import { requireAdmin } from "./auth.js";
import { supabaseServiceRequest } from "./supabase.js";

// Capped so the admin page stays fast; add paging if the site outgrows this
const memberLimit = 500;
const membershipLimit = 1000;

export async function listMembers(request, response) {
  await requireAdmin(request, response);

  const [profiles, memberships] = await Promise.all([
    supabaseServiceRequest(`profiles?select=id,email,full_name,created_at&order=created_at.desc&limit=${memberLimit}`),
    supabaseServiceRequest(`memberships?select=user_id,access_until&limit=${membershipLimit}`)
  ]);

  const accessUntilByUser = new Map(
    (Array.isArray(memberships) ? memberships : []).map((row) => [row.user_id, row.access_until])
  );

  const members = (Array.isArray(profiles) ? profiles : []).map((profile) => {
    const accessUntil = accessUntilByUser.get(profile.id) || null;
    return {
      id: profile.id,
      name: profile.full_name || "",
      email: profile.email || "",
      joinedAt: profile.created_at || null,
      accessUntil,
      active: Boolean(accessUntil && Date.parse(accessUntil) > Date.now())
    };
  });

  return { members };
}
