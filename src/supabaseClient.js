/**
 * Supabase client scaffolding. Only creates a client when config is present and valid.
 * No part of the app should crash if Supabase is not configured.
 */

export let supabase = null;

export function isSupabaseConfigured() {
  return supabase != null;
}

/**
 * Returns the Supabase client if config is present and valid; otherwise null.
 * Uses safe dynamic import for config.js so missing file does not throw.
 */
export async function getSupabase() {
  if (supabase != null) return supabase;

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
}
