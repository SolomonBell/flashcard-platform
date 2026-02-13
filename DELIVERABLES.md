# KnowIt – Implementation Deliverables

## Changed / New Files

### New files
- `src/config.example.js` – Example Supabase config (copy to `src/config.js`)
- `src/supabaseClient.js` – Supabase client init (env/config)
- `src/authSupabase.js` – Supabase Auth (sign up/in, OAuth, forgot password, verify email)
- `src/authBridge.js` – Single source for current user (Supabase vs local)
- `src/dataStore.js` – Deck/progress abstraction (Supabase vs localStorage)
- `src/classes/classesSupabase.js` – Co-teachers + org members (Supabase)
- `src/create/importPdf.js` – PDF upload, text extraction, heuristic cards, AI stub
- `supabase/schema.sql` – Tables + RLS
- `.gitignore` – `src/config.js` ignored
- `DELIVERABLES.md` – This file

### Modified files
- `package.json` – Added `@supabase/supabase-js`, `pdfjs-dist`; `"type": "module"`
- `src/state.js` – `lastShownCardId` in state and migration
- `src/study/study.js` – No-repeat algorithm: `pickNextCard(cards, lastShownCardId)`, set `state.lastShownCardId` after showing card
- `src/main.js` – Shared state `lastShownCardId`; auth bridge; verify/reset-password screens; dataStore load/save when Supabase
- `src/auth.js` – Supabase auth UI (OAuth, forgot password, verify message); local auth unchanged
- `src/create/create.js` – “Import from PDF” button and flow; `renderImportPdfFlow` when `state.importPdf`
- `src/classes/classes.js` – Teachers section in class detail; Organization screen; org admin button when Supabase
- `README.md` – Supabase setup, config, storage bucket, profiles, PDF import note

---

## Manual Test Checklist

### Local-only (no `src/config.js`)
- [ ] App loads; auth is email/password (local).
- [ ] Sign up / sign in works (local).
- [ ] Create deck, add cards, study – no repeat: same card does not appear twice in a row (except when only one eligible).
- [ ] Classes: create class, add student (by email), share deck, student sees shared deck and can study.
- [ ] Co-teachers: “Teachers” section shows “Not available in local mode.”
- [ ] Organization: “Organization” button hidden or shows “Not available when using Supabase.”

### Supabase configured (`src/config.js` with valid URL + anon key)
- [ ] Auth: Sign up with email → “Check your email to verify” (and resend).
- [ ] Auth: Sign in with email/password after verify.
- [ ] Auth: “Forgot password?” → email → set new password via link (#reset-password).
- [ ] Auth: “Continue with Google” / “Continue with Microsoft” (if enabled in Supabase).
- [ ] After login, deck loads/saves from Supabase when useSupabase() is true.
- [ ] Study: no-repeat algorithm still works (personal and shared deck).
- [ ] Import from PDF: choose file → optional page range → extract → preview → “Generate cards (heuristic)” → add to deck. (PDF lib must load; see README.)
- [ ] Classes (if using Supabase for classes): Teachers section lists teachers, add by email, remove.
- [ ] Organization: If user is org admin, “Organization” shows; list members, set role (admin/member).

### Schema
- [ ] Run `supabase/schema.sql` in Supabase SQL Editor.
- [ ] Create Storage bucket `pdfs` in Dashboard.
- [ ] (Optional) Enable trigger for `profiles` from `auth.users` (see comments in schema).

---

## Schema

Full SQL: **`supabase/schema.sql`**

Includes:
- Tables: `organizations`, `org_memberships`, `classes`, `class_memberships`, `decks`, `cards`, `shared_decks`, `shared_deck_progress`, `analytics_sessions`, `analytics_aggregates`, `profiles`
- RLS policies for owner/teacher/org-admin/student access
- Indexes for common queries

Setup steps (see README):
1. Create Supabase project.
2. Run `supabase/schema.sql` in SQL Editor.
3. Create bucket `pdfs` in Storage.
4. (Optional) Add trigger to sync `profiles` from `auth.users`.
