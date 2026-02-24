# Supabase setup (Phase 2 – scaffolding only)

This app can run without Supabase (localStorage only). To enable Supabase later, follow these steps.

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
