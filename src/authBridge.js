/**
 * Single source for "current user" and auth mode: Supabase when configured, else local authStore.
 */

import { getSupabase } from "./supabaseClient.js";
import { getCurrentSessionUser } from "./authSupabase.js";
import { getCurrentUser } from "./authStore.js";

let _useSupabaseAuth = null;

/** Returns true if we are using Supabase for auth (config present and we've resolved). */
export async function useSupabaseAuth() {
  if (_useSupabaseAuth !== null) return _useSupabaseAuth;
  const sb = await getSupabase();
  _useSupabaseAuth = !!sb;
  return _useSupabaseAuth;
}

/** Current user: { id, email, emailConfirmed?, role } or null. Prefer Supabase session when Supabase is configured. */
export async function getCurrentAuthUser() {
  const useSupabase = await useSupabaseAuth();
  if (useSupabase) {
    const u = await getCurrentSessionUser();
    if (u) return { id: u.id, email: u.email, emailConfirmed: !!u.email_confirmed, role: u.role || "student" };
    return null;
  }
  const local = getCurrentUser();
  if (!local) return null;
  return { id: local.id, email: local.email, emailConfirmed: true, role: local.role || "student" };
}

/** Synchronous placeholder: returns null; use getCurrentAuthUser() for real check. Call setAuthMode(true/false) after first async resolution if you need sync checks. */
export function getCurrentAuthUserSync() {
  return null;
}

export function setAuthMode(useSupabase) {
  _useSupabaseAuth = useSupabase;
}
