/**
 * Supabase Auth: email/password, OAuth (Google, Microsoft), email verification, forgot password.
 * Use when Supabase is configured; auth.js falls back to local auth when not.
 */

import { getSupabase } from "./supabaseClient.js";

export async function signUp(email, password) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { data, error } = await sb.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) return { success: false, error: error.message };
  return { success: true, user: data.user, session: data.session };
}

export async function signIn(email, password) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, user: data.user, session: data.session };
}

/** provider: "google" | "azure" */
export async function signInWithProvider(provider) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: provider === "azure" ? "azure" : "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) return { success: false, error: error.message };
  if (data?.url) window.location.href = data.url;
  return { success: true };
}

export async function signOut() {
  const sb = await getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function requestPasswordReset(email) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}#reset-password`,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Call after user lands on reset-password link (e.g. from hash). */
export async function updatePassword(newPassword) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getCurrentSessionUser() {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    email_confirmed: !!u.email_confirmed_at,
    role: u.user_metadata?.role || "student",
  };
}

export async function resendConfirmationEmail(email) {
  const sb = await getSupabase();
  if (!sb) return { success: false, error: "Supabase not configured." };
  const { error } = await sb.auth.resend({ type: "signup", email: email.trim().toLowerCase() });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
