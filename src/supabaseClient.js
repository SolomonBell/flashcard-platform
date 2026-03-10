/**
 * Supabase JS client — lazy-initialized singleton.
 *
 * The SDK is fetched from the ESM CDN only when getSupabaseClient() is first
 * called.  In local mode (USE_SUPABASE = false in store/index.js) none of the
 * supabaseStore methods are ever invoked, so this function is never called and
 * zero extra network requests are made on page load.
 *
 * Once the client is created it is cached for the lifetime of the page.
 */

import { config } from "./config.js";

let _client = null;

/**
 * Returns the initialized Supabase client, creating it on first call.
 *
 * Throws a descriptive error if supabaseUrl or supabaseAnonKey are not
 * configured in src/config.js, so misconfiguration fails fast.
 *
 * @returns {Promise<object>} Supabase SupabaseClient instance
 */
export async function getSupabaseClient() {
  if (_client) return _client;

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase is not configured. Set config.supabaseUrl and config.supabaseAnonKey in src/config.js.");
  }

  // Dynamic import so the CDN fetch only happens when this function is called.
  // Using the pinned ESM bundle — update the version pin as needed.
  const { createClient } = await import(
    "https://esm.sh/@supabase/supabase-js@2"
  );

  _client = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return _client;
}
