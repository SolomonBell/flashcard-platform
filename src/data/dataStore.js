/**
 * Datastore abstraction: localStorage vs Supabase.
 * Use getActiveStore() to get the store; use its async methods for decks/cards.
 * On Supabase errors, callers should fall back to localStore with a console warning.
 */

import { getSupabase } from "../supabaseClient.js";
import { getUser } from "../auth/auth.js";
import { getCurrentUser } from "../authStore.js";

const STORAGE_KEY_PREFIX = "flashcards_app_v1_user_";

function getLocalUserKey(userId) {
  return userId ? `${STORAGE_KEY_PREFIX}${userId}` : null;
}

function parseBlob(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeCard(c) {
  return {
    ...c,
    stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
    stage3Mastered: Boolean(c.stage3Mastered),
    longAnswer: Boolean(c.longAnswer),
  };
}

// --- localStore: one blob per user (same format as state.js) ---

export const localStore = {
  async listDecks() {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed) return [];
    const deckId = parsed.deckId || `deck_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    return [{ id: deckId, title: parsed.deckTitle || "My deck" }];
  },

  async createDeck({ title }) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return null;
    const deckId = `deck_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw) || { screen: "create", cards: [], deckId: null };
    parsed.deckId = deckId;
    parsed.deckTitle = title || "My deck";
    parsed.cards = parsed.cards || [];
    localStorage.setItem(key, JSON.stringify(parsed));
    return { id: deckId, title: title || "My deck" };
  },

  async updateDeck(deck) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key || !deck?.id) return;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || parsed.deckId !== deck.id) return;
    if (deck.title != null) parsed.deckTitle = deck.title;
    localStorage.setItem(key, JSON.stringify(parsed));
  },

  async deleteDeck(deckId) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || parsed.deckId !== deckId) return;
    parsed.deckId = `deck_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    parsed.cards = [];
    parsed.deckTitle = "My deck";
    localStorage.setItem(key, JSON.stringify(parsed));
  },

  async listCards(deckId) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || parsed.deckId !== deckId || !Array.isArray(parsed.cards)) return [];
    return (parsed.cards || []).map(normalizeCard);
  },

  async createCard(deckId, card) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || parsed.deckId !== deckId) return null;
    parsed.cards = parsed.cards || [];
    const c = { ...normalizeCard(card), id: card.id || `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` };
    parsed.cards.push(c);
    localStorage.setItem(key, JSON.stringify(parsed));
    return c;
  },

  async updateCard(card) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key || !card?.id) return;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || !Array.isArray(parsed.cards)) return;
    const idx = parsed.cards.findIndex((x) => x.id === card.id);
    if (idx === -1) return;
    parsed.cards[idx] = { ...parsed.cards[idx], ...normalizeCard(card) };
    localStorage.setItem(key, JSON.stringify(parsed));
  },

  async deleteCard(cardId) {
    const user = getCurrentUser();
    const key = getLocalUserKey(user?.id);
    if (!key) return;
    const raw = localStorage.getItem(key);
    const parsed = parseBlob(raw);
    if (!parsed || !Array.isArray(parsed.cards)) return;
    parsed.cards = parsed.cards.filter((x) => x.id !== cardId);
    if (parsed.cards.length === 0) parsed.cards.push({ id: `c-${Date.now()}`, front: "", back: "", stage: 1, stage3Mastered: false, longAnswer: false });
    localStorage.setItem(key, JSON.stringify(parsed));
  },
};

// --- supabaseStore: decks + cards tables, RLS scoped by auth.uid() ---

function rowToCard(row) {
  const meta = row.metadata || {};
  return {
    id: row.id,
    front: row.front ?? "",
    back: row.back ?? "",
    stage: [1, 2, 3].includes(meta.stage) ? meta.stage : 1,
    stage3Mastered: Boolean(meta.stage3Mastered),
    longAnswer: Boolean(meta.longAnswer),
    createdAt: meta.createdAt ?? null,
    lastSeenAt: meta.lastSeenAt ?? null,
  };
}

function cardToRow(card, userId, deckId) {
  const meta = {
    stage: [1, 2, 3].includes(card.stage) ? card.stage : 1,
    stage3Mastered: Boolean(card.stage3Mastered),
    longAnswer: Boolean(card.longAnswer),
    createdAt: card.createdAt ?? null,
    lastSeenAt: card.lastSeenAt ?? null,
  };
  return {
    deck_id: deckId,
    user_id: userId,
    front: card.front ?? "",
    back: card.back ?? "",
    kind: card.kind ?? "basic",
    metadata: meta,
  };
}

export function createSupabaseStore(supabase, userId) {
  return {
    async listDecks() {
      const { data, error } = await supabase.from("decks").select("id, title, created_at, updated_at").eq("user_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((r) => ({ id: r.id, title: r.title || "My deck" }));
    },

    async createDeck({ title }) {
      const { data, error } = await supabase.from("decks").insert({ user_id: userId, title: title || "My deck" }).select("id, title").single();
      if (error) throw error;
      return data;
    },

    async updateDeck(deck) {
      if (!deck?.id) return;
      const { error } = await supabase.from("decks").update({ title: deck.title }).eq("id", deck.id).eq("user_id", userId);
      if (error) throw error;
    },

    async deleteDeck(deckId) {
      const { error } = await supabase.from("decks").delete().eq("id", deckId).eq("user_id", userId);
      if (error) throw error;
    },

    async listCards(deckId) {
      const { data, error } = await supabase.from("cards").select("id, front, back, kind, metadata").eq("deck_id", deckId).eq("user_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToCard);
    },

    async createCard(deckId, card) {
      const row = cardToRow(card, userId, deckId);
      const { data, error } = await supabase.from("cards").insert(row).select("id, front, back, kind, metadata").single();
      if (error) throw error;
      return rowToCard(data);
    },

    async updateCard(card) {
      if (!card?.id) return;
      const meta = {
        stage: [1, 2, 3].includes(card.stage) ? card.stage : 1,
        stage3Mastered: Boolean(card.stage3Mastered),
        longAnswer: Boolean(card.longAnswer),
        createdAt: card.createdAt ?? null,
        lastSeenAt: card.lastSeenAt ?? null,
      };
      const { error } = await supabase.from("cards").update({ front: card.front, back: card.back, metadata: meta }).eq("id", card.id).eq("user_id", userId);
      if (error) throw error;
    },

    async deleteCard(cardId) {
      const { error } = await supabase.from("cards").delete().eq("id", cardId).eq("user_id", userId);
      if (error) throw error;
    },
  };
}

const FALLBACK_WARN = "[dataStore] Supabase request failed; using local storage. Data not synced.";

/**
 * Returns the active store: Supabase (when client + signed-in user) else localStorage.
 * If Supabase is used and a call fails, use localStore and log a warning (do not overwrite local data).
 */
export async function getActiveStore() {
  const supabase = await getSupabase();
  const { data: userData } = await getUser();
  const user = userData?.user;
  if (supabase && user) {
    return {
      store: createSupabaseStore(supabase, user.id),
      isSupabase: true,
      userId: user.id,
    };
  }
  return {
    store: localStore,
    isSupabase: false,
    userId: getCurrentUser()?.id ?? null,
  };
}

/**
 * Run a store operation; on Supabase failure, run the same operation with localStore and warn.
 * Returns the result of fn(store). On fallback to local, returns { value, fellBackToLocal: true }
 * so the UI can show "Saved locally (sync failed)".
 */
export async function withStoreFallback(operationName, fn) {
  const { store, isSupabase } = await getActiveStore();
  try {
    return await fn(store);
  } catch (err) {
    if (isSupabase && store !== localStore) {
      console.warn(FALLBACK_WARN, operationName, err);
      const localResult = await fn(localStore);
      return { value: localResult, fellBackToLocal: true };
    }
    throw err;
  }
}
