/**
 * Supabase client scaffolding. Only creates a client once per page load (singleton).
 * No part of the app should crash if Supabase is not configured.
 * Prevents multiple GoTrueClient instances by resolving all callers to the same promise.
 */

export let supabase = null;

/** Single init promise so concurrent getSupabase() calls do not create multiple clients. */
let initPromise = null;

export function isSupabaseConfigured() {
  return supabase != null;
}

/**
 * Returns the Supabase client if config is present and valid; otherwise null.
 * Creates the client at most once per page load.
 */
export async function getSupabase() {
  if (supabase != null) return supabase;
  if (initPromise != null) return initPromise;

  initPromise = (async () => {
    let url, anonKey;
    try {
      const config = await import("./config.js");
      url = config.SUPABASE_URL;
      anonKey = config.SUPABASE_ANON_KEY;
    } catch {
      url = null;
      anonKey = null;
    }

    if (!url || !anonKey) {
      return null;
    }

    try {
      const { createClient } = await import("@supabase/supabase-js");
      supabase = createClient(url, anonKey);
      return supabase;
    } catch (err) {
      supabase = null;
      return null;
    }
  })();

  return initPromise;
}
