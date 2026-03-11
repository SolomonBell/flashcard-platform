import { getSupabaseClient } from "./supabaseClient.js";

// Module-level cache — keeps getCurrentUser() synchronous
let _currentUser = null;

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
    if (session?.user) {
      const profile = await _fetchProfile(sb, session.user.id);
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
 * Creates a new account with Supabase Auth and upserts a user_profiles row.
 * Returns { success: true, user } or { success: false, error: string }.
 */
export async function createUser(email, password, role) {
  try {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.auth.signUp({ email, password });

    if (error) return { success: false, error: error.message };

    const authUser = data.user;
    if (!authUser) return { success: false, error: "Sign-up failed." };

    // Upsert profile with role
    const { error: profileErr } = await sb
      .from("user_profiles")
      .upsert({ id: authUser.id, email: authUser.email, role }, { onConflict: "id" });

    if (profileErr) return { success: false, error: profileErr.message };

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
 * Signs out. Clears the cache synchronously first so getCurrentUser()
 * returns null immediately — the async signOut fires in the background.
 */
export async function clearSession() {
  _currentUser = null;
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
