// Supabase client. Uses src/config.js if present; otherwise placeholder for local-only mode.
let _client = null;
let _configured = false;

async function getConfig() {
  try {
    const mod = await import("./config.js");
    return {
      url: mod.SUPABASE_URL,
      anonKey: mod.SUPABASE_ANON_KEY,
    };
  } catch {
    return { url: null, anonKey: null };
  }
}

export async function getSupabase() {
  if (_client !== null) return _client;
  const { createClient } = await import("@supabase/supabase-js");
  const { url, anonKey } = await getConfig();
  if (!url || !anonKey) {
    if (typeof window !== "undefined" && window.__KNOWIT_SUPABASE_WARN !== true) {
      window.__KNOWIT_SUPABASE_WARN = true;
      console.warn("[KnowIt] SUPABASE_URL/SUPABASE_ANON_KEY not set. Running in local-only mode. Copy src/config.example.js to src/config.js and set keys for Supabase.");
    }
    _configured = false;
    _client = null;
    return null;
  }
  _client = createClient(url, anonKey);
  _configured = true;
  return _client;
}

export function isSupabaseConfigured() {
  return _configured && _client != null;
}

// Synchronous check: do we have config (config.js may export placeholders)
export function hasSupabaseConfig() {
  try {
    // Dynamic import is async; we cannot do sync. So we use a pattern: assume configured if client was ever set.
    return _client != null;
  } catch {
    return false;
  }
}
