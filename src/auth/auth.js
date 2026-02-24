/**
 * Supabase Auth (email/password). Safe when Supabase is not configured.
 */

import { getSupabase } from "../supabaseClient.js";

function notConfigured() {
  return { error: "Supabase not configured" };
}

export async function getSession() {
  const supabase = await getSupabase();
  if (!supabase) return { data: { session: null }, error: notConfigured() };
  return supabase.auth.getSession();
}

export async function getUser() {
  const supabase = await getSupabase();
  if (!supabase) return { data: { user: null }, error: notConfigured() };
  return supabase.auth.getUser();
}

export async function signUp(email, password) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  return supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
}

export async function signIn(email, password) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function signOut() {
  const supabase = await getSupabase();
  if (!supabase) return { error: notConfigured() };
  return supabase.auth.signOut();
}

/**
 * Subscribe to auth state changes. No-op if Supabase is not configured.
 * Returns an unsubscribe function (call it to remove the listener).
 */
export function onAuthStateChange(callback) {
  let subscription = null;
  getSupabase().then((supabase) => {
    if (supabase && supabase.auth) {
      const result = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
      subscription = result?.data?.subscription ?? null;
    }
  });
  return () => {
    if (subscription && typeof subscription.unsubscribe === "function") {
      subscription.unsubscribe();
    }
  };
}
