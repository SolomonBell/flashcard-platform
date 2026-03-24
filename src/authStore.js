import { getSupabaseClient } from "./supabaseClient.js";

// Module-level cache — keeps getCurrentUser() synchronous
let _currentUser = null;
let _pendingPasswordReset = false;

/**
 * Maps a Supabase auth user + profile row into the app's user shape:
 * { id, email, role }
 */
function buildUser(authUser, profile) {
  return {
    id: authUser.id,
    email: authUser.email,
    role: profile?.role || "student",
  };
}

/**
 * Call once at app startup (before the first renderAll).
 * Restores any existing session and subscribes to future auth changes.
 */
export async function initAuth() {
  const sb = await getSupabaseClient();

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    const profile = await _fetchProfile(sb, session.user.id);
    _currentUser = buildUser(session.user, profile);
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      // User arrived via a password-reset email link.
      // Hold in recovery mode — do not set _currentUser — until they
      // successfully call updatePassword().
      _pendingPasswordReset = true;
      _currentUser = null;
      return;
    }
    if (session?.user) {
      const profile = await _ensureAndFetchProfile(sb, session.user);
      _currentUser = buildUser(session.user, profile);
    } else {
      _currentUser = null;
    }
  });
}

async function _fetchProfile(sb, userId) {
  const { data } = await sb
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return data;
}

/**
 * Fetches the user_profiles row for the given auth user.
 * Profile creation is handled automatically by the `on_auth_user_created`
 * database trigger — no frontend insert is needed or safe here.
 */
async function _ensureAndFetchProfile(sb, authUser) {
  return _fetchProfile(sb, authUser.id);
}

/**
 * Creates a new account with Supabase Auth and upserts a user_profiles row.
 * Returns:
 *   { success: true, user }                     — logged in (email confirm OFF)
 *   { success: true, needsEmailConfirmation: true } — confirm email first
 *   { success: false, error: string }            — failure
 */
export async function createUser(email, password, role) {
  try {
    const sb = await getSupabaseClient();

    // Pass role in user metadata so the `on_auth_user_created` database
    // trigger can write it to user_profiles automatically and safely.
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });

    if (error) return { success: false, error: error.message };

    const authUser = data.user;
    if (!authUser) return { success: false, error: "Sign-up failed." };

    // If Supabase email confirmation is ON, session is null until confirmed.
    // The trigger already created the profile row — nothing else to do here.
    if (!data.session) {
      return { success: true, needsEmailConfirmation: true };
    }

    const user = buildUser(authUser, { role });
    _currentUser = user;
    return { success: true, user };
  } catch (err) {
    return { success: false, error: err.message || "Sign-up failed." };
  }
}

/**
 * Signs in with email + password via Supabase Auth.
 * Returns { success: true, user } or { success: false, error: string }.
 */
export async function signInWithPassword(email, password) {
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) return { success: false, error: error.message };

    const authUser = data.user;
    const profile = await _fetchProfile(sb, authUser.id);
    const user = buildUser(authUser, profile);
    _currentUser = user;
    return { success: true, user };
  } catch (err) {
    return { success: false, error: err.message || "Sign-in failed." };
  }
}

/**
 * Sends a password reset email.  The redirectTo URL brings the user back to
 * this same page so the PASSWORD_RECOVERY onAuthStateChange event fires.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function sendPasswordResetEmail(email) {
  try {
    const sb = await getSupabaseClient();
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Failed to send reset email." };
  }
}

/**
 * Updates the authenticated user's password after a PASSWORD_RECOVERY flow.
 * On success, clears the recovery flag and sets the cached user.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function updatePassword(newPassword) {
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    _pendingPasswordReset = false;
    const profile = await _fetchProfile(sb, data.user.id);
    _currentUser = buildUser(data.user, profile);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Failed to update password." };
  }
}

/** Returns true while waiting for the user to complete a password-reset flow. */
export function isPendingPasswordReset() {
  return _pendingPasswordReset;
}

/**
 * Initiates Google OAuth sign-in via Supabase.
 * The browser is redirected to Google; on return, onAuthStateChange fires
 * and populates _currentUser automatically.
 * Returns { success: false, error } only if the redirect itself fails to
 * launch; otherwise the tab navigates away and this never resolves.
 */
export async function signInWithGoogle() {
  try {
    const sb = await getSupabaseClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + window.location.pathname },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Google sign-in failed." };
  }
}

export async function signInWithMicrosoft() {
  try {
    const sb = await getSupabaseClient();
    const { error } = await sb.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin + window.location.pathname,
        scopes: "email",
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || "Microsoft sign-in failed." };
  }
}

/**
 * Signs out. Clears the cache synchronously first so getCurrentUser()
 * returns null immediately — the async signOut fires in the background.
 */
export async function clearSession() {
  _currentUser = null;
  _pendingPasswordReset = false;
  try {
    const sb = await getSupabaseClient();
    await sb.auth.signOut();
  } catch {
    // Ignore — cache is already cleared
  }
}

/** Synchronous — returns the cached user object or null. */
export function getCurrentUser() {
  return _currentUser;
}

// ── Legacy no-ops (kept so nothing breaks if still imported) ──────────────────
export const loadUsers = () => [];
export const saveUsers = () => {};
export const getUserByEmail = () => null;
export const getSession = () => null;
export const setSession = () => {};
