/**
 * App configuration.
 *
 * IMPORTANT: This file contains sensitive keys.
 * Do not commit this file to a public repository.
 *
 * The Anthropic API key lives ONLY in the proxy server (server/aiProxy.js)
 * via the ANTHROPIC_API_KEY environment variable — never here.
 */

/**
 * Feature flags and service endpoints.
 *
 * useSupabase   — informational mirror; the live routing switch is
 *                 USE_SUPABASE in src/data/store/index.js.
 * supabaseUrl   — Supabase project URL.
 * supabaseAnonKey — Supabase publishable/anon key (safe to expose in browser code;
 *                   never put the service_role key here).
 * aiProxyUrl    — AI grading proxy endpoint. Override for production deployment.
 * proxySecret   — Shared secret sent as X-Proxy-Secret header to the proxy.
 *                 Must match the PROXY_SECRET env var on the server.
 */
export const config = {
  useSupabase: false,

  supabaseUrl:    "https://rdraxoojxpnmxenvklpl.supabase.co",
  supabaseAnonKey: "sb_publishable_VJRDQuY0H6CoVxUHbqXqmg_RYHdqbYI",

  aiProxyUrl:   "https://flashcard-platform-production.up.railway.app",
  proxySecret:  "48c17498849079f29f3830dc2b28e9a79db059bbcbe163cc0640de582697cb88",
};
