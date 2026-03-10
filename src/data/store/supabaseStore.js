/**
 * supabaseStore — Supabase-backed implementation of the store interface.
 *
 * Methods that are fully implemented return real data from Supabase.
 * Methods not yet implemented call `stub`, which rejects with a clear error.
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
 * NOTE on user_id: TEXT for now to stay decoupled from Supabase Auth UUIDs
 * while auth is not yet wired.  After auth integration, migrate user_id columns
 * to UUID and add a foreign key to auth.users, then enable RLS policies.
 *
 * ── Row Level Security (add AFTER auth is wired) ─────────────────────────────
 *
 *   ALTER TABLE decks            ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE deck_data        ENABLE ROW LEVEL SECURITY;
 *   ALTER TABLE user_active_deck ENABLE ROW LEVEL SECURITY;
 *
 *   CREATE POLICY "owner" ON decks
 *     FOR ALL USING (user_id = auth.uid()::text);
 *   -- (add matching policies for deck_data and user_active_deck)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { getSupabaseClient } from "../../supabaseClient.js";
import { mapDeck } from "../mappers.js";

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

  // ── Auth — not yet implemented ────────────────────────────────────────────

  loadUsers:            stub,
  saveUsers:            stub,
  getUserByEmail:       stub,
  createUser:           stub,
  getSession:           stub,
  setSession:           stub,
  clearSession:         stub,
  getCurrentUser:       stub,

  // ── Classes — not yet implemented ─────────────────────────────────────────

  getClassesByTeacher:    stub,
  getClassesByStudent:    stub,
  getClassById:           stub,
  createClass:            stub,
  updateClass:            stub,
  deleteClass:            stub,
  addStudentToClass:      stub,
  removeStudentFromClass: stub,
  addInvitedEmail:        stub,
  removeInvitedEmail:     stub,
  validateEmailDomain:    stub,

  // ── Shared Decks — not yet implemented ────────────────────────────────────

  getSharedDecksByClass:   stub,
  getSharedDecksByTeacher: stub,
  getSharedDeckById:       stub,
  shareDeckToClass:        stub,
  deleteSharedDeck:        stub,
  getSharedDeckProgress:   stub,
  saveSharedDeckProgress:  stub,
  resetSharedDeckProgress: stub,
  getAllSharedProgress:     stub,
};
