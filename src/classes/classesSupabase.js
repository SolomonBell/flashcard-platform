/**
 * Classes/org operations via Supabase. When Supabase is not configured, APIs return empty or indicate "not available".
 */

import { getSupabase } from "../supabaseClient.js";

export async function useSupabaseClasses() {
  const sb = await getSupabase();
  return !!sb;
}

/** List teachers for a class (class_memberships where role_in_class = 'teacher'). Returns [{ user_id, email }]. */
export async function getClassTeachers(classId) {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data: memberships, error: mErr } = await sb
    .from("class_memberships")
    .select("user_id")
    .eq("class_id", classId)
    .eq("role_in_class", "teacher");
  if (mErr || !memberships?.length) return [];
  const list = [];
  for (const m of memberships) {
    const { data: profile } = await sb.from("profiles").select("email").eq("id", m.user_id).single();
    list.push({ user_id: m.user_id, email: profile?.email || m.user_id });
  }
  return list;
}

/** Add a teacher to the class by email. User must exist (profiles table or auth). */
export async function addTeacherToClass(classId, email) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const normalizedEmail = email.trim().toLowerCase();
  const { data: profile } = await sb.from("profiles").select("id").ilike("email", normalizedEmail).limit(1).single();
  const userId = profile?.id;
  if (!userId) return { success: false, error: "User not found. They must sign up first; ensure profiles is synced from auth." };
  const { error } = await sb.from("class_memberships").upsert(
    { class_id: classId, user_id: userId, role_in_class: "teacher" },
    { onConflict: "class_id,user_id" }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Remove a teacher from the class. */
export async function removeTeacherFromClass(classId, userId) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { error } = await sb.from("class_memberships").delete().eq("class_id", classId).eq("user_id", userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** List organizations the current user belongs to. Returns [{ id, name, role }]. */
export async function getOrganizationsForUser() {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];
  const { data: memberships } = await sb.from("org_memberships").select("org_id, role").eq("user_id", user.id);
  if (!memberships?.length) return [];
  const orgIds = [...new Set(memberships.map((m) => m.org_id))];
  const { data: orgs } = await sb.from("organizations").select("id, name").in("id", orgIds);
  const byId = (orgs || []).reduce((acc, o) => {
    acc[o.id] = o.name;
    return acc;
  }, {});
  return memberships.map((m) => ({ id: m.org_id, name: byId[m.org_id] || "Org", role: m.role }));
}

/** List org members. Returns [{ user_id, role, email? }]. */
export async function getOrgMembers(orgId) {
  const sb = await getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("org_memberships").select("user_id, role").eq("org_id", orgId);
  if (error || !data?.length) return data || [];
  const withEmail = [];
  for (const row of data) {
    const { data: p } = await sb.from("profiles").select("email").eq("id", row.user_id).single();
    withEmail.push({ ...row, email: p?.email || row.user_id });
  }
  return withEmail;
}

/** Set org member role (admin only). */
export async function setOrgMemberRole(orgId, userId, role) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { error } = await sb.from("org_memberships").update({ role }).eq("org_id", orgId).eq("user_id", userId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
