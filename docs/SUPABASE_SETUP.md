# Supabase setup (Phase 2 – scaffolding only)

This app can run without Supabase (localStorage only). To enable Supabase later, follow these steps.

**No bundler:** The app is served with a static server (e.g. `python3 -m http.server`). An **import map** in `index.html` maps `@supabase/supabase-js` to ESM (esm.sh) so the browser can resolve the bare specifier. If you add a bundler later, you can remove the import map and rely on the bundler to resolve the package.

## 1. Copy the example config

From the project root:

```bash
cp src/config.js.example src/config.js
```

(`src/config.js` is in `.gitignore` and will not be committed.)

## 2. Get your Supabase URL and anon key

1. Open [Supabase](https://supabase.com) and sign in.
2. Create or open a project.
3. Go to **Project Settings** (gear) → **API**.
4. Copy:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")

## 3. Paste values into config.js

Edit `src/config.js` and replace the placeholders:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";
```

Paste your real URL and anon key.

## 4. Restart your local server

If the app is running, stop it and start again so the new config is loaded (e.g. `npx http-server -p 8080`).

## 5. Confirm Supabase is configured

In the browser console (after the app has loaded), run:

```js
import('./src/supabaseClient.js').then(async (m) => {
  const client = await m.getSupabase();
  console.log('isSupabaseConfigured:', m.isSupabaseConfigured(), 'client:', client);
});
```

Or from the app code you can:

- Call `await getSupabase()` – if it returns a client (truthy), Supabase is configured.
- Call `isSupabaseConfigured()` – returns `true` only after a client has been created (e.g. after at least one successful `getSupabase()`).

**Expected when configured:** `getSupabase()` resolves to a Supabase client object; `isSupabaseConfigured()` is `true` after that.

**Expected when not configured:** `getSupabase()` resolves to `null`; `isSupabaseConfigured()` is `false`. The app continues to use localStorage and does not crash.

---

## Auth (Phase 3B): Redirect URLs and OAuth

### 1. Add Redirect URLs in Supabase Dashboard

1. In Supabase, go to **Authentication** → **URL Configuration** (or **Auth** → **Settings**).
2. Under **Redirect URLs**, add every URL where your app runs, for example:
   - `http://localhost:8000`
   - `http://localhost:8080`
   - `https://your-production-domain.com`
3. Use the exact origin + path where the app is served. The app uses `window.location.origin + pathname` plus a hash marker (e.g. `#auth=callback`) for OAuth and password-reset callbacks.
4. Save.

### 2. Enable Google and Microsoft (OAuth) providers

1. Go to **Authentication** → **Providers** in the Supabase Dashboard.
2. **Google**
   - Enable **Google**.
   - In [Google Cloud Console](https://console.cloud.google.com/): create OAuth 2.0 credentials (Web application), set authorized redirect URI to:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Copy **Client ID** and **Client Secret** into Supabase Google provider settings.
3. **Microsoft (Azure)**
   - Enable **Microsoft** (or **Azure** if that’s the label).
   - In [Azure Portal](https://portal.azure.com/): App registrations → New registration; add a redirect URI:
     - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - Create a client secret; copy **Application (client) ID** and **Client secret** into Supabase Microsoft provider settings.
4. Save each provider.

### 3. Provider names used in code

The app calls Supabase OAuth with these provider IDs:

- **Google:** `"google"`
- **Microsoft/Azure:** `"azure"` (Supabase’s provider name for Microsoft is `azure` in `signInWithOAuth({ provider: "azure" })`)

If your Supabase or `supabase-js` version uses different names (e.g. `"microsoft"` instead of `"azure"`), change the provider string in `src/auth/authUI.js` where `signInWithOAuth("azure", ...)` is called.
