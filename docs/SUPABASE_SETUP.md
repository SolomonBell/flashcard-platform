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

---

## Phase 4A: Schema and datastore (decks + cards)

When Supabase is configured and the user is signed in (Account → Sign in), decks and cards are stored in Supabase. Otherwise the app uses localStorage. RLS ensures each user sees only their own data.

### 1. Run the schema in Supabase

1. In Supabase Dashboard, go to **SQL Editor**.
2. Open `supabase/schema.sql` from this repo (or copy its contents).
3. Run the full script. It creates:
   - **decks**: `id`, `user_id`, `title`, `created_at`, `updated_at`
   - **cards**: `id`, `deck_id`, `user_id`, `front`, `back`, `kind`, `metadata` (jsonb), `created_at`, `updated_at`
   - Indexes, `updated_at` triggers, **RLS enabled** on both tables, and policies so `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE.
4. RLS is enabled and policies are created by the script; no extra step is required.

### 2. Verify as an authenticated user

1. Run the schema (step 1).
2. In the app: sign in (main screen when Supabase is configured; see Phase 4B).
3. Create a deck (add cards and save). In Supabase **Table Editor**, check `decks` and `cards` for rows with your `user_id` (same as **Authentication** → **Users**).
4. Optionally in SQL Editor (while signed in the app, same browser): use the anon key in a request or run a query as the service role to confirm rows exist for your user.

### 3. Test steps (Phase 4A)

1. **Without Supabase config**  
   Remove or empty `src/config.js` (or use a build without it). Serve the app (e.g. `python3 -m http.server`). You will see the **local** sign-in screen (Create account / Sign in). Log in with local auth. Create/edit decks and cards. Everything works as before using localStorage only.

2. **With Supabase configured but signed out**  
   Add valid `src/config.js`. You will see the **Supabase** sign-in screen (Sign in / Sign up, no local login). Sign in with Supabase. Data is stored in Supabase (decks/cards tables). Sign out via header "Sign out"; you see the Supabase sign-in screen again.

3. **Signed in to Supabase**  
   Sign in on the main screen. Create a deck and at least one card, then save. In Supabase **Table Editor**, confirm a row in `decks` and one in `cards` for your user. Sign out; confirm you see the sign-in screen again and local data (if any) is separate.

4. **Sign out and local data**  
   After using Supabase for data, sign out. The app shows the sign-in screen again. If you later use the app without Supabase config, local auth and localStorage are used; local data was not overwritten by Supabase.

---

## Phase 4B: Supabase as the only auth (when configured)

When Supabase is configured, it is the **only** sign-in: the main screen shows Supabase sign-in/sign-up (and forgot password, OAuth). The legacy local auth screen is shown only when Supabase is **not** configured (e.g. development without config).

### Behaviour

- **Supabase configured**
  - Not signed in → main content area shows **Supabase sign-in** (Sign in / Sign up tabs, Forgot password, Google/Microsoft).
  - Signed in → app screens (Create, Study, Classes); header shows **Classes | your@email.com | Account | Sign out**. Sign out uses Supabase `signOut` and re-renders.
  - Auth state changes (sign-in/sign-out) trigger a re-render via `onAuthStateChange`.
- **Supabase not configured**
  - Not signed in → main content area shows **local** sign-in (Create account / Sign in with email and role).
  - Signed in → same app screens; header shows **Classes | Log out**. Log out clears local session.

### Manual test steps (Phase 4B)

1. **Supabase configured – one sign-in**
   - Ensure `src/config.js` has valid URL and anon key. Serve the app (e.g. `python3 -m http.server`).
   - Open the app. You should see **one** sign-in screen (Sign in / Sign up with Supabase). There is no separate "student login" or legacy form.
   - Sign in with email/password or OAuth. Header shows **Classes | your@email.com | Account | Sign out**. Create a deck and a card; confirm they persist after refresh.
   - Click **Sign out**. The main area shows the Supabase sign-in screen again. No duplicate sign-in UI.

2. **Supabase configured – header**
   - While signed in, confirm the header shows the current user email and a **Sign out** button. Optional **Account** opens the Account modal (profile / sign out / change password).
   - After sign-out, confirm the header nav is gone and only the sign-in content is visible.

3. **Supabase not configured – local fallback**
   - Remove or empty `src/config.js` (or rename it). Reload the app.
   - You should see the **local** sign-in screen (Create account / Sign in, with role selector). Sign in with a local account. Header shows **Classes | Log out**. App works with localStorage only. No crash, no "Supabase required" blocking.

4. **Recovery / set new password**
   - With Supabase configured, use "Forgot password?" and complete the email flow. After opening the reset link, the app should show a "Set new password" view (full-page or modal). Set a new password and sign in.
