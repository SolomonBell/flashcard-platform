# KnowIt

Flashcards app: create cards, study in stages, remember longer. Vanilla JS, ES modules, optional Supabase backend.

## Local-only (no backend)

Run with a static server (e.g. `npx http-server -p 8080`). Auth and data use localStorage. No setup required.

## Supabase (Auth + Postgres + Storage)

1. Create a project at [supabase.com](https://supabase.com).
2. Copy `src/config.example.js` to `src/config.js` (do not commit `src/config.js`).
3. In `src/config.js`, set:
   - `SUPABASE_URL` — Project URL from Supabase dashboard (Settings → API).
   - `SUPABASE_ANON_KEY` — anon/public key from the same page.
4. Run the schema: in Supabase SQL Editor, run the contents of `supabase/schema.sql`.
5. In Supabase Auth settings, enable Email and the providers you want (Google, Azure). Set redirect URL to your app origin (e.g. `http://localhost:8080`).

Then run the app; if config is present, Supabase auth and storage are used. Without `src/config.js`, the app runs in local-only mode and logs a console warning.

- **Storage bucket**: Create a bucket named `pdfs` in Supabase Storage (Dashboard → Storage) for PDF uploads.
- **Profiles**: To show emails for co-teachers and org members, run the trigger in `supabase/schema.sql` (handle_new_user) so `public.profiles` is populated from `auth.users`.
- **PDF import**: The "Import from PDF" feature uses `pdfjs-dist`. If you serve the app with a static server (e.g. `npx http-server`), the browser may not resolve `node_modules`; use a dev server that resolves modules (e.g. Vite) or copy `node_modules/pdfjs-dist/build/pdf.mjs` and `pdf.worker.mjs` to a public path and add an import map.
