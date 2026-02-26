/**
 * Supabase Auth (email/password, OAuth, forgot password, verification). Safe when Supabase is not configured.
 */

import { getSupabase } from "../supabaseClient.js";

function notConfigured() {
  return { error: "Supabase not configured" };
}

/**
 * Build redirect URL for password reset / OAuth callback. Uses current origin + pathname + hash marker.
 * Works on localhost and production without code changes.
 */
export function getDefaultRedirectTo() {
  if (typeof window === "undefined" || !window.location) return "";
  const base = `${window.location.origin}${window.location.pathname || ""}`.replace(/\/$/, "") || window.location.origin;
  return `${base}#auth=callback`;
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

export async function requestPasswordReset(email, _redirectTo) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  const url = typeof window !== "undefined" && window.location ? window.location.origin + "/" : getDefaultRedirectTo();
  const result = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: url });
  if (typeof window !== "undefined") console.log("[reset] sent with redirectTo", url);
  return result;
}

export async function updatePassword(newPassword) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  return supabase.auth.updateUser({ password: newPassword });
}

/**
 * Resend signup confirmation email. Best-effort; some supabase-js versions use different API.
 */
export async function resendSignupConfirmation(email, redirectTo) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  const url = redirectTo || getDefaultRedirectTo();
  try {
    if (typeof supabase.auth.resend === "function") {
      return await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: url },
      });
    }
  } catch (_) {}
  return { data: null, error: { message: "Resend confirmation is not available in this version." } };
}

export async function signInWithOAuth(provider, redirectTo) {
  const supabase = await getSupabase();
  if (!supabase) return { data: null, error: notConfigured() };
  const url = redirectTo || getDefaultRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: url },
  });
  if (error) return { data: null, error };
  if (data?.url) window.location.href = data.url;
  return { data, error: null };
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

/**
 * Detect Supabase recovery/password-reset redirect and optionally open auth panel in "Set new password" mode.
 * Call on app load. Does not throw if Supabase is not configured.
 * Returns a promise that resolves to { handled: boolean } (true if recovery was detected and panel opened).
 */
export async function maybeHandleAuthRedirect() {
  const hash = typeof window !== "undefined" ? window.location.hash || "" : "";
  const isRecovery =
    /type=recovery/i.test(hash) || /#auth=reset/i.test(hash) || /access_token=/.test(hash);

  if (!isRecovery) return { handled: false };

  const supabase = await getSupabase();
  if (!supabase) return { handled: false };

  try {
    const { openAuthPanel } = await import("/src/auth/authUI.js");
    await openAuthPanel({ initialView: "setNewPassword" });
    // Do NOT clear URL here: recovery code/tokens are in query or hash and are needed for ensureRecoverySession + updateUser.
    // URL is cleared only after successful password update (see supabaseAuthScreen.js).
    return { handled: true };
  } catch (_) {
    return { handled: false };
  }
}
