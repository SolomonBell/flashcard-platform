/**
 * supabaseStore — Supabase-backed implementation of the store interface.
 *
 * All deck, class, and shared-deck methods are fully implemented.
 * Auth methods are stubs — authentication is handled by authStore.js directly.
 * Method signatures and return shapes are identical to localStore.
 *
 * ── Required Supabase tables ──────────────────────────────────────────────────
 *
 * Run the following SQL in the Supabase SQL editor BEFORE flipping
 * USE_SUPABASE = true in src/data/store/index.js.
 *
 *   -- Lightweight deck index (one row per deck)
 *   CREATE TABLE IF NOT EXISTS decks (
 *     id          TEXT        PRIMARY KEY,
 *     user_id     TEXT        NOT NULL,
 *     title       TEXT        NOT NULL DEFAULT '',
 *     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS decks_user_id_idx ON decks (user_id);
 *
 *   -- Deck content: cards array + study-state metadata stored as JSONB
 *   CREATE TABLE IF NOT EXISTS deck_data (
 *     deck_id              TEXT    PRIMARY KEY
 *                            REFERENCES decks(id) ON DELETE CASCADE,
 *     cards                JSONB   NOT NULL DEFAULT '[]',
 *     last_shown_card_id   TEXT,
 *     large_deck_backlog   JSONB
 *   );
 *
 *   -- Per-user active-deck pointer (ON DELETE SET NULL clears it when deck is deleted)
 *   CREATE TABLE IF NOT EXISTS user_active_deck (
 *     user_id  TEXT PRIMARY KEY,
 *     deck_id  TEXT REFERENCES decks(id) ON DELETE SET NULL
 *   );
 *
 * NOTE on user_id: Stored as TEXT (auth.uid()::text) rather than UUID to avoid
 * a schema migration.  RLS policies use the ::text cast to match correctly.
 *
 * ── Row Level Security (applied) ─────────────────────────────────────────────
 *
 *   ALTER TABLE decks            ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE deck_data        ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE user_active_deck ENABLE ROW LEVEL SECURITY;
 *
 *   CREATE POLICY "owner" ON decks
 *     FOR ALL USING (user_id = auth.uid()::text);
 *   -- (matching policies on deck_data and user_active_deck)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSupabaseClient } from "../../supabaseClient.js";
import { mapDeck, mapClass, mapSharedDeck } from "../mappers.js";
import { getCurrentUser as _getAuthCurrentUser } from "../../authStore.js";

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Mirrors normalizeCards in deckStore.js.
 * Ensures card stage is always 1|2|3 and boolean flags are real booleans.
 * Applied to cards read from Supabase JSONB so the UI receives the same
 * shape it would from localStorage.
 */
function normalizeCards(cards) {
  return (cards || []).map(c => ({
    ...c,
    stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
    stage3Mastered: Boolean(c.stage3Mastered),
    longAnswer: Boolean(c.longAnswer),
  }));
}

/** Generates an ID in the same format as deckStore.js. */
function newDeckId() {
  return `deck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Stubs for methods not yet implemented ─────────────────────────────────────

const NOT_IMPLEMENTED = "Supabase store method not yet implemented";
const stub = () => Promise.reject(new Error(NOT_IMPLEMENTED));

// ── Store ─────────────────────────────────────────────────────────────────────

export const supabaseStore = {

  // ── Decks — implemented ───────────────────────────────────────────────────

  /**
   * Returns the deck index for a user, sorted by most-recently updated first.
   * Return shape: [{ id, title, createdAt, updatedAt }]
   *
   * @param {string} userId
   * @returns {Promise<Array<{id:string, title:string, createdAt:string|null, updatedAt:string|null}>>}
   */
  listDecks: async (userId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("decks")
      .select("id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(mapDeck);
  },

  /**
   * Creates a new empty deck and returns its ID string.
   * Inserts both the decks index row and an empty deck_data row.
   * Return shape: string (deck ID)
   *
   * @param {string} userId
   * @param {string} [title="New Deck"]
   * @returns {Promise<string>}
   */
  createDeck: async (userId, title = "New Deck") => {
    const sb = await getSupabaseClient();
    const id = newDeckId();
    const trimmed = (title || "New Deck").trim() || "New Deck";
    const now = new Date().toISOString();

    const { error: deckErr } = await sb
      .from("decks")
      .insert({ id, user_id: userId, title: trimmed, created_at: now, updated_at: now });
    if (deckErr) throw deckErr;

    const { error: dataErr } = await sb
      .from("deck_data")
      .insert({ deck_id: id, cards: [], last_shown_card_id: null, large_deck_backlog: null });
    if (dataErr) throw dataErr;

    return id;
  },

  /**
   * Returns the full deck record (index fields + cards blob + study state),
   * or null if the deck does not exist or belongs to a different user.
   * Return shape: { id, title, createdAt, updatedAt, cards[], lastShownCardId, largeDeckBacklog }
   *
   * @param {string} userId
   * @param {string} deckId
   * @returns {Promise<object|null>}
   */
  getDeck: async (userId, deckId) => {
    const sb = await getSupabaseClient();

    const { data: deckRow, error: deckErr } = await sb
      .from("decks")
      .select("id, title, created_at, updated_at")
      .eq("id", deckId)
      .eq("user_id", userId)
      .single();

    if (deckErr || !deckRow) return null;

    const { data: dataRow } = await sb
      .from("deck_data")
      .select("cards, last_shown_card_id, large_deck_backlog")
      .eq("deck_id", deckId)
      .single();

    return {
      ...mapDeck(deckRow),
      cards: normalizeCards(dataRow?.cards ?? []),
      lastShownCardId: dataRow?.last_shown_card_id ?? null,
      largeDeckBacklog: dataRow?.large_deck_backlog ?? undefined,
    };
  },

  /**
   * Upserts the deck index entry and its cards/study-state blob.
   * Creates both rows if they don't exist; updates them if they do.
   * Return shape: void
   *
   * @param {string} userId
   * @param {{ id:string, title?:string, cards?:any[], lastShownCardId?:string|null, largeDeckBacklog?:any }} deck
   * @returns {Promise<void>}
   */
  saveDeck: async (userId, deck) => {
    if (!userId || !deck?.id) return;

    const sb = await getSupabaseClient();
    const now = new Date().toISOString();

    const { error: deckErr } = await sb
      .from("decks")
      .upsert(
        { id: deck.id, user_id: userId, title: deck.title || "My Deck", updated_at: now },
        { onConflict: "id" }
      );
    if (deckErr) throw deckErr;

    const { error: dataErr } = await sb
      .from("deck_data")
      .upsert(
        {
          deck_id: deck.id,
          cards: deck.cards ?? [],
          last_shown_card_id: deck.lastShownCardId ?? null,
          large_deck_backlog: deck.largeDeckBacklog ?? null,
        },
        { onConflict: "deck_id" }
      );
    if (dataErr) throw dataErr;
  },

  /**
   * Renames a deck's title in both the index row and (implicitly) subsequent
   * getDeck calls, matching deckStore.renameDeck behaviour.
   * Return shape: void
   *
   * @param {string} userId
   * @param {string} deckId
   * @param {string} newTitle
   * @returns {Promise<void>}
   */
  renameDeck: async (userId, deckId, newTitle) => {
    const trimmed = (newTitle || "").trim();
    if (!trimmed) return;

    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("decks")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("user_id", userId);

    if (error) throw error;

    // Propagate the new title into any shared deck snapshots that came from this source deck
    const { data: affectedShared } = await sb
      .from("shared_decks")
      .select("id, deck_snapshot")
      .eq("source_deck_id", deckId);

    for (const row of (affectedShared || [])) {
      const updatedSnapshot = { ...row.deck_snapshot, deckName: trimmed };
      await sb
        .from("shared_decks")
        .update({ deck_snapshot: updatedSnapshot, last_edited_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  },

  /**
   * Copies a deck (index + cards) under a new ID with title "<original> Copy".
   * Copied cards get fresh IDs and are reset to stage 1 / not mastered,
   * matching deckStore.duplicateDeck behaviour exactly.
   * Return shape: string (new deck ID) or null if the original was not found.
   *
   * @param {string} userId
   * @param {string} deckId
   * @returns {Promise<string|null>}
   */
  duplicateDeck: async (userId, deckId) => {
    const sb = await getSupabaseClient();

    const { data: origRow, error: origErr } = await sb
      .from("decks")
      .select("id, title")
      .eq("id", deckId)
      .eq("user_id", userId)
      .single();

    if (origErr || !origRow) return null;

    const { data: origData } = await sb
      .from("deck_data")
      .select("cards")
      .eq("deck_id", deckId)
      .single();

    const newId = newDeckId();
    const newTitle = `${origRow.title || "Deck"} Copy`;
    const now = new Date().toISOString();

    // Reset each card: new ID, stage 1, not mastered, no lastSeenAt
    const copiedCards = (origData?.cards || []).map((c, idx) => ({
      ...c,
      id: `c-${Date.now() + idx}-${Math.random().toString(36).slice(2, 9)}`,
      stage: 1,
      stage3Mastered: false,
      lastSeenAt: null,
    }));

    const { error: deckErr } = await sb
      .from("decks")
      .insert({ id: newId, user_id: userId, title: newTitle, created_at: now, updated_at: now });
    if (deckErr) throw deckErr;

    const { error: dataErr } = await sb
      .from("deck_data")
      .insert({ deck_id: newId, cards: copiedCards, last_shown_card_id: null, large_deck_backlog: null });
    if (dataErr) throw dataErr;

    return newId;
  },

  /**
   * Deletes the deck index row (cascade removes deck_data automatically).
   * The user_active_deck row is cleared automatically by ON DELETE SET NULL.
   * Return shape: void
   *
   * @param {string} userId
   * @param {string} deckId
   * @returns {Promise<void>}
   */
  deleteDeck: async (userId, deckId) => {
    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("decks")
      .delete()
      .eq("id", deckId)
      .eq("user_id", userId);

    if (error) throw error;
    // deck_data is removed via ON DELETE CASCADE.
    // user_active_deck.deck_id is cleared via ON DELETE SET NULL.
  },

  /**
   * Returns the active deck ID for a user, or null if none is set.
   * Return shape: string | null
   *
   * @param {string} userId
   * @returns {Promise<string|null>}
   */
  getActiveDeckId: async (userId) => {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("user_active_deck")
      .select("deck_id")
      .eq("user_id", userId)
      .single();

    return data?.deck_id ?? null;
  },

  /**
   * Sets or clears the active deck pointer for a user.
   * Pass null/undefined deckId to clear it.
   * Return shape: void
   *
   * @param {string} userId
   * @param {string|null} deckId
   * @returns {Promise<void>}
   */
  setActiveDeckId: async (userId, deckId) => {
    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("user_active_deck")
      .upsert(
        { user_id: userId, deck_id: deckId || null },
        { onConflict: "user_id" }
      );

    if (error) throw error;
  },

  /**
   * No-op for Supabase — the old single-blob localStorage migration has no
   * equivalent in the Supabase schema.  Always returns false.
   *
   * @returns {Promise<false>}
   */
  migrateFromOldFormat: async () => false,

  // ── Auth — handled by authStore.js directly; stubs kept for interface parity ─

  loadUsers:            stub,
  saveUsers:            stub,
  getUserByEmail:       stub,
  createUser:           stub,
  getSession:           stub,
  setSession:           stub,
  clearSession:         stub,
  // Returns the in-memory cached user from authStore — not a real DB call.
  getCurrentUser:       () => Promise.resolve(_getAuthCurrentUser()),

  // ── Classes ───────────────────────────────────────────────────────────────

  /**
   * Returns all classes owned by a teacher.
   * @param {string} teacherId
   * @returns {Promise<Array>}
   */
  getClassesByTeacher: async (teacherId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("classes")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapClass);
  },

  /**
   * Returns all classes a student belongs to.
   * The UI passes currentUser.id (UUID); we resolve to email first because
   * student_ids stores normalized email strings (what teachers type).
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  getClassesByStudent: async (userId) => {
    const sb = await getSupabaseClient();
    const { data: profile } = await sb
      .from("user_profiles")
      .select("email")
      .eq("id", userId)
      .single();
    if (!profile?.email) return [];
    const email = profile.email.toLowerCase().trim();
    const { data, error } = await sb
      .from("classes")
      .select("*")
      .filter("student_ids", "cs", JSON.stringify([email]));
    if (error) throw error;
    return (data || []).map(mapClass);
  },

  /**
   * Returns a single class by ID, or null.
   * @param {string} classId
   * @returns {Promise<object|null>}
   */
  getClassById: async (classId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("classes")
      .select("*")
      .eq("id", classId)
      .single();
    if (error || !data) return null;
    return mapClass(data);
  },

  /**
   * Creates a new class and returns the mapped object.
   * @param {string} teacherId
   * @param {string} name
   * @param {string[]} [allowedDomains=[]]
   * @returns {Promise<object>}
   */
  createClass: async (teacherId, name, allowedDomains = []) => {
    const sb = await getSupabaseClient();
    const id = `class_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from("classes")
      .insert({
        id,
        teacher_id: teacherId,
        name: (name || "").trim(),
        allowed_domains: allowedDomains || [],
        student_ids: [],
        invited_emails: [],
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return mapClass(data);
  },

  /**
   * Generic update — merges camelCase updates into the row.
   * @param {string} classId
   * @param {object} updates  camelCase keys (name, studentIds, invitedEmails, etc.)
   * @returns {Promise<object|null>}
   */
  updateClass: async (classId, updates) => {
    const sb = await getSupabaseClient();
    const row = {};
    if ("name"           in updates) row.name            = updates.name;
    if ("studentIds"     in updates) row.student_ids     = updates.studentIds;
    if ("invitedEmails"  in updates) row.invited_emails  = updates.invitedEmails;
    if ("allowedDomains" in updates) row.allowed_domains = updates.allowedDomains;
    row.updated_at = new Date().toISOString();
    const { data, error } = await sb
      .from("classes")
      .update(row)
      .eq("id", classId)
      .select()
      .single();
    if (error || !data) return null;
    return mapClass(data);
  },

  /**
   * Deletes a class (shared_decks and progress cascade automatically).
   * @param {string} classId
   * @returns {Promise<boolean>}
   */
  deleteClass: async (classId) => {
    const sb = await getSupabaseClient();
    const { error } = await sb.from("classes").delete().eq("id", classId);
    if (error) throw error;
    return true;
  },

  /**
   * Adds a student (email string) to the class's student_ids array.
   * Normalises to lowercase; no-ops if already present.
   * @param {string} classId
   * @param {string} studentEmail  the email string the teacher typed
   * @returns {Promise<boolean>}
   */
  addStudentToClass: async (classId, studentEmail) => {
    const sb = await getSupabaseClient();
    const normalized = studentEmail.toLowerCase().trim();
    const { data } = await sb
      .from("classes")
      .select("student_ids")
      .eq("id", classId)
      .single();
    if (!data) return false;
    const ids = data.student_ids || [];
    if (ids.includes(normalized)) return false;
    ids.push(normalized);
    await sb
      .from("classes")
      .update({ student_ids: ids, updated_at: new Date().toISOString() })
      .eq("id", classId);
    return true;
  },

  /**
   * Removes a student (by the exact stored string) from student_ids.
   * @param {string} classId
   * @param {string} studentId  the exact string stored (email)
   * @returns {Promise<boolean>}
   */
  removeStudentFromClass: async (classId, studentId) => {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("classes")
      .select("student_ids")
      .eq("id", classId)
      .single();
    if (!data) return false;
    const ids = (data.student_ids || []).filter(id => id !== studentId);
    await sb
      .from("classes")
      .update({ student_ids: ids, updated_at: new Date().toISOString() })
      .eq("id", classId);
    return true;
  },

  /**
   * Adds a normalised email to invited_emails.
   * @param {string} classId
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  addInvitedEmail: async (classId, email) => {
    const sb = await getSupabaseClient();
    const normalized = email.toLowerCase().trim();
    const { data } = await sb
      .from("classes")
      .select("invited_emails")
      .eq("id", classId)
      .single();
    if (!data) return false;
    const emails = data.invited_emails || [];
    if (!emails.includes(normalized)) {
      emails.push(normalized);
      await sb
        .from("classes")
        .update({ invited_emails: emails, updated_at: new Date().toISOString() })
        .eq("id", classId);
    }
    return true;
  },

  /**
   * Removes an email from invited_emails (case-insensitive match).
   * @param {string} classId
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  removeInvitedEmail: async (classId, email) => {
    const sb = await getSupabaseClient();
    const normalized = email.toLowerCase().trim();
    const { data } = await sb
      .from("classes")
      .select("invited_emails")
      .eq("id", classId)
      .single();
    if (!data) return false;
    const emails = (data.invited_emails || []).filter(e => e.toLowerCase() !== normalized);
    await sb
      .from("classes")
      .update({ invited_emails: emails, updated_at: new Date().toISOString() })
      .eq("id", classId);
    return true;
  },

  /**
   * Pure logic — no DB call.  Returns true if the email's domain is in
   * allowedDomains, or if allowedDomains is empty (no restriction).
   * @param {string} email
   * @param {string[]} allowedDomains
   * @returns {boolean}
   */
  validateEmailDomain: (email, allowedDomains) => {
    if (!allowedDomains || allowedDomains.length === 0) return true;
    const domain = email.toLowerCase().trim().split("@")[1];
    if (!domain) return false;
    return allowedDomains.some(d => domain === d.toLowerCase().trim());
  },

  // ── Shared Decks ──────────────────────────────────────────────────────────

  /**
   * Returns all shared decks for a class.
   * @param {string} classId
   * @returns {Promise<Array>}
   */
  getSharedDecksByClass: async (classId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("shared_decks")
      .select("*")
      .eq("class_id", classId)
      .order("shared_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapSharedDeck);
  },

  /**
   * Returns all shared decks created by a teacher.
   * @param {string} teacherId
   * @returns {Promise<Array>}
   */
  getSharedDecksByTeacher: async (teacherId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("shared_decks")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("shared_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(mapSharedDeck);
  },

  /**
   * Returns a single shared deck by ID, or null.
   * @param {string} sharedDeckId
   * @returns {Promise<object|null>}
   */
  getSharedDeckById: async (sharedDeckId) => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb
      .from("shared_decks")
      .select("*")
      .eq("id", sharedDeckId)
      .single();
    if (error || !data) return null;
    return mapSharedDeck(data);
  },

  /**
   * Shares a deck to a class.  If a shared deck with the same teacher,
   * class, and deckName already exists it is updated and student progress
   * is reset; otherwise a new row is inserted.
   * @param {string} teacherId
   * @param {string} classId
   * @param {{ deckName: string, cards: any[] }} deckSnapshot
   * @returns {Promise<object>}
   */
  shareDeckToClass: async (teacherId, classId, deckSnapshot) => {
    const sb = await getSupabaseClient();
    const deckName = deckSnapshot.deckName || "Untitled Deck";
    const sourceDeckId = deckSnapshot.deckId || null;
    const now = new Date().toISOString();
    const snapshot = {
      deckName,
      cards: JSON.parse(JSON.stringify(deckSnapshot.cards)),
    };

    // Fetch all shared decks for this teacher + class
    const { data: existing_list } = await sb
      .from("shared_decks")
      .select("id, deck_snapshot, source_deck_id")
      .eq("teacher_id", teacherId)
      .eq("class_id", classId);

    // Primary identity: stable source_deck_id (set once the UI passes deckId)
    // Fallback: title match for legacy rows that predate this fix
    let existing = null;
    if (sourceDeckId) {
      existing = (existing_list || []).find(d => d.source_deck_id === sourceDeckId);
    }
    if (!existing) {
      existing = (existing_list || []).find(
        d => !d.source_deck_id && d.deck_snapshot?.deckName === deckName
      );
    }

    if (existing) {
      // Update snapshot (picks up any rename) + backfill source_deck_id, then reset progress.
      // Preserve teacher-assigned badges so re-sharing a deck doesn't wipe them.
      const updatedSnapshot = { ...snapshot, badges: existing.deck_snapshot?.badges || [] };
      const { data, error } = await sb
        .from("shared_decks")
        .update({ deck_snapshot: updatedSnapshot, last_edited_at: now, source_deck_id: sourceDeckId })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      await sb.from("shared_deck_progress").delete().eq("shared_deck_id", existing.id);
      return { ...mapSharedDeck(data), isNew: false };
    }

    const id = `shared_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const { data, error } = await sb
      .from("shared_decks")
      .insert({
        id,
        teacher_id: teacherId,
        class_id: classId,
        source_deck_id: sourceDeckId,
        deck_snapshot: snapshot,
        shared_at: now,
        last_edited_at: now,
      })
      .select()
      .single();
    if (error) throw error;
    return { ...mapSharedDeck(data), isNew: true };
  },

  /**
   * Saves teacher-assigned badges onto a shared deck's snapshot.
   * @param {string} sharedDeckId
   * @param {Array<{label:string, color:string}>} badges  — max 2 items, enforced here
   * @returns {Promise<object>} mapped shared deck
   */
  updateSharedDeckBadges: async (sharedDeckId, badges) => {
    const sb = await getSupabaseClient();
    const { data: current, error: fetchError } = await sb
      .from("shared_decks")
      .select("deck_snapshot")
      .eq("id", sharedDeckId)
      .single();
    if (fetchError) throw fetchError;
    const safeBadges = (badges || []).slice(0, 2).map(b => ({
      label: String(b.label || "").trim().slice(0, 20),
      color: String(b.color || "#3b82f6"),
    }));
    const updatedSnapshot = { ...(current.deck_snapshot || {}), badges: safeBadges };
    const { data, error } = await sb
      .from("shared_decks")
      .update({ deck_snapshot: updatedSnapshot, last_edited_at: new Date().toISOString() })
      .eq("id", sharedDeckId)
      .select()
      .single();
    if (error) throw error;
    return mapSharedDeck(data);
  },

  /**
   * Deletes a shared deck.  Progress rows are removed by ON DELETE CASCADE.
   * @param {string} sharedDeckId
   * @returns {Promise<boolean>}
   */
  deleteSharedDeck: async (sharedDeckId) => {
    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("shared_decks")
      .delete()
      .eq("id", sharedDeckId);
    if (error) throw error;
    return true;
  },

  /**
   * Returns a student's progress on a shared deck, or null if none.
   * Shape: { sharedDeckId, studentId, cards, lastStudiedAt }
   * @param {string} sharedDeckId
   * @param {string} studentId
   * @returns {Promise<object|null>}
   */
  getSharedDeckProgress: async (sharedDeckId, studentId) => {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("shared_deck_progress")
      .select("*")
      .eq("shared_deck_id", sharedDeckId)
      .eq("student_id", studentId)
      .single();
    if (!data) return null;
    return {
      sharedDeckId: data.shared_deck_id,
      studentId: data.student_id,
      cards: data.cards || [],
      lastStudiedAt: data.last_studied_at
        ? new Date(data.last_studied_at).getTime()
        : Date.now(),
    };
  },

  /**
   * Upserts a student's progress on a shared deck.
   * @param {string} sharedDeckId
   * @param {string} studentId
   * @param {any[]} cards
   * @returns {Promise<void>}
   */
  saveSharedDeckProgress: async (sharedDeckId, studentId, cards) => {
    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("shared_deck_progress")
      .upsert(
        {
          shared_deck_id: sharedDeckId,
          student_id: studentId,
          cards: JSON.parse(JSON.stringify(cards)),
          last_studied_at: new Date().toISOString(),
        },
        { onConflict: "shared_deck_id,student_id" }
      );
    if (error) throw error;
  },

  /**
   * Deletes all progress rows for a shared deck (called on re-share).
   * @param {string} sharedDeckId
   * @returns {Promise<void>}
   */
  resetSharedDeckProgress: async (sharedDeckId) => {
    const sb = await getSupabaseClient();
    const { error } = await sb
      .from("shared_deck_progress")
      .delete()
      .eq("shared_deck_id", sharedDeckId);
    if (error) throw error;
  },

  /**
   * Returns all progress rows for a class with student UUIDs resolved to emails.
   * Shape: [{ studentEmail, studentId, sharedDeckId, cards, lastStudiedAt }]
   * @param {string} classId
   * @returns {Promise<Array>}
   */
  getStudentProgressForClass: async (classId) => {
    try {
      const sb = await getSupabaseClient();
      const { data: sharedDecks } = await sb
        .from("shared_decks")
        .select("id")
        .eq("class_id", classId);
      if (!sharedDecks || sharedDecks.length === 0) return [];

      const sharedDeckIds = sharedDecks.map(d => d.id);
      const { data: progressRows } = await sb
        .from("shared_deck_progress")
        .select("*")
        .in("shared_deck_id", sharedDeckIds);
      if (!progressRows || progressRows.length === 0) return [];

      // Resolve student UUIDs → emails via user_profiles
      const studentUuids = [...new Set(progressRows.map(p => p.student_id))];
      const { data: profiles, error: profilesError } = await sb
        .from("user_profiles")
        .select("id, email")
        .in("id", studentUuids);
      console.log("[analytics debug] user_profiles query:", {
        studentUuids,
        profilesReturned: profiles?.length ?? 0,
        profilesError: profilesError?.message ?? null,
      });
      const emailByUuid = {};
      for (const p of (profiles || [])) emailByUuid[p.id] = (p.email || "").toLowerCase();

      return progressRows.map(p => ({
        studentEmail: emailByUuid[p.student_id] ?? p.student_id,
        studentId: p.student_id,
        sharedDeckId: p.shared_deck_id,
        cards: p.cards || [],
        lastStudiedAt: p.last_studied_at ? new Date(p.last_studied_at).getTime() : null,
      }));
    } catch { return []; }
  },

  /**
   * Returns study sessions for a set of shared deck IDs.
   * Gracefully returns [] if the study_sessions table does not yet exist.
   * Shape: [{ studentId, sharedDeckId, startedAt, answersSubmitted, correctCount, incorrectCount }]
   * @param {string[]} sharedDeckIds
   * @returns {Promise<Array>}
   */
  getSessionsForSharedDecks: async (sharedDeckIds) => {
    if (!sharedDeckIds || sharedDeckIds.length === 0) return [];
    try {
      const sb = await getSupabaseClient();
      const { data, error } = await sb
        .from("study_sessions")
        .select("user_id, deck_id, started_at, answers_submitted, correct_count, incorrect_count")
        .in("deck_id", sharedDeckIds)
        .eq("deck_context", "shared");
      if (error) return [];
      return (data || []).map(r => ({
        studentId: r.user_id,
        sharedDeckId: r.deck_id,
        startedAt: r.started_at,
        answersSubmitted: r.answers_submitted || 0,
        correctCount: r.correct_count || 0,
        incorrectCount: r.incorrect_count || 0,
      }));
    } catch { return []; }
  },

  /**
   * Upserts per-card attempt stats for a student on a shared deck.
   * Writes absolute cumulative totals — caller maintains running counts in
   * memory (sharedState.cards) before calling this.
   * Safe to fire-and-forget; errors are logged but not thrown.
   * @param {{ sharedDeckId:string, studentId:string, cardId:string, attempts:number, correctCount:number, incorrectCount:number }}
   * @returns {Promise<void>}
   */
  upsertCardAttemptStat: async ({ sharedDeckId, studentId, cardId, attempts, correctCount, incorrectCount }) => {
    try {
      const sb = await getSupabaseClient();
      const now = new Date().toISOString();
      const { error } = await sb
        .from("card_attempt_stats")
        .upsert(
          {
            shared_deck_id:   sharedDeckId,
            student_id:       studentId,
            card_id:          cardId,
            attempts:         attempts,
            correct_count:    correctCount,
            incorrect_count:  incorrectCount,
            last_answered_at: now,
            updated_at:       now,
          },
          { onConflict: "shared_deck_id,student_id,card_id" }
        );
      if (error) console.error("card_attempt_stats upsert failed:", error.message);
    } catch (e) { console.error("card_attempt_stats upsert exception:", e); }
  },

  /**
   * Returns card attempt stats for a shared deck, optionally filtered to
   * specific student UUIDs (pass null for all students = class scope).
   * Shape: [{ cardId, studentId, attempts, correctCount, incorrectCount }]
   * @param {{ sharedDeckId: string, studentIds?: string[]|null }}
   * @returns {Promise<Array>}
   */
  getCardAttemptStatsForDeck: async ({ sharedDeckId, studentIds = null }) => {
    try {
      const sb = await getSupabaseClient();
      let query = sb
        .from("card_attempt_stats")
        .select("card_id, student_id, attempts, correct_count, incorrect_count")
        .eq("shared_deck_id", sharedDeckId);
      if (studentIds) {
        query = query.in("student_id", studentIds);
      }
      const { data, error } = await query;
      if (error) return [];
      return (data || []).map(r => ({
        cardId:        r.card_id,
        studentId:     r.student_id,
        attempts:      r.attempts      || 0,
        correctCount:  r.correct_count || 0,
        incorrectCount: r.incorrect_count || 0,
      }));
    } catch { return []; }
  },

  /**
   * Returns all shared deck progress rows (used by teacher analytics).
   * Shape: [{ sharedDeckId, studentId, cards, lastStudiedAt }]
   * @returns {Promise<Array>}
   */
  getAllSharedProgress: async () => {
    const sb = await getSupabaseClient();
    const { data, error } = await sb.from("shared_deck_progress").select("*");
    if (error) throw error;
    return (data || []).map(p => ({
      sharedDeckId: p.shared_deck_id,
      studentId: p.student_id,
      cards: p.cards || [],
      lastStudiedAt: p.last_studied_at
        ? new Date(p.last_studied_at).getTime()
        : Date.now(),
    }));
  },
};
