export const STORAGE_KEY = "flashcards_app_v1";

function getUserStorageKey(userId) {
  return `flashcards_app_v1_user_${userId}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isSupabaseId(id) {
  return typeof id === "string" && UUID_REGEX.test(id);
}

function migrateLegacyStateToUser(userId) {
  try {
    const legacyRaw = localStorage.getItem(STORAGE_KEY);
    if (!legacyRaw) return false;

    const userKey = getUserStorageKey(userId);
    // Only migrate if user doesn't already have state
    if (localStorage.getItem(userKey)) return false;

    const parsed = JSON.parse(legacyRaw);
    
    // Apply migration: ensure stage + stage3Mastered exist
    if (parsed?.cards?.length) {
      parsed.cards = parsed.cards.map(c => ({
        ...c,
        stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
        stage3Mastered: Boolean(c.stage3Mastered),
        longAnswer: Boolean(c.longAnswer), // Default to false if missing
      }));
    }

    // Save to user's storage
    localStorage.setItem(userKey, JSON.stringify(parsed));
    
    // Remove legacy key after successful migration
    localStorage.removeItem(STORAGE_KEY);
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Load state from datastore (Supabase when signed in + configured, else localStorage).
 * Returns { screen, cards, deckId [, deckTitle] } or null. Async.
 */
export async function loadStateForUser(userId) {
  if (!userId) return null;

  const { getActiveStore, withStoreFallback } = await import("./data/dataStore.js");
  const { store, isSupabase } = await getActiveStore();

  if (!isSupabase) {
    migrateLegacyStateToUser(userId);
    try {
      const userKey = getUserStorageKey(userId);
      const raw = localStorage.getItem(userKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.cards?.length) {
        parsed.cards = parsed.cards.map(c => ({
          ...c,
          stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
          stage3Mastered: Boolean(c.stage3Mastered),
          longAnswer: Boolean(c.longAnswer),
        }));
      }
      if (!parsed.deckId) parsed.deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return parsed;
    } catch {
      return null;
    }
  }

  return withStoreFallback("loadState", async (s) => {
    migrateLegacyStateToUser(userId);
    const decks = await s.listDecks();
    let deckId;
    let deckTitle = "My deck";
    if (decks.length === 0) {
      const created = await s.createDeck({ title: deckTitle });
      deckId = created?.id ?? null;
    } else {
      deckId = decks[0].id;
      deckTitle = decks[0].title ?? deckTitle;
    }
    if (!deckId) return null;
    const cards = (await s.listCards(deckId)) || [];
    return {
      screen: "create",
      cards,
      deckId,
      deckTitle,
    };
  }).catch(() => null);
}

/**
 * Save state to datastore. When using Supabase, may return updated state (e.g. new card ids).
 * Async.
 */
export async function saveStateForUser(userId, state) {
  if (!userId || !state) return undefined;

  const { getActiveStore, withStoreFallback } = await import("./data/dataStore.js");
  const { isSupabase } = await getActiveStore();

  if (!isSupabase) {
    const userKey = getUserStorageKey(userId);
    localStorage.setItem(userKey, JSON.stringify(state));
    return undefined;
  }

  return withStoreFallback("saveState", async (store) => {
    const deckId = state.deckId;
    if (!deckId) return undefined;

    await store.updateDeck({ id: deckId, title: state.deckTitle || "My deck" });

    const existing = await store.listCards(deckId);
    const existingIds = new Set((existing || []).map((c) => c.id));
    const stateIds = new Set((state.cards || []).map((c) => c.id));
    for (const id of existingIds) {
      if (!stateIds.has(id)) await store.deleteCard(id);
    }
    const updatedCards = [];
    for (const card of state.cards || []) {
      if (isSupabaseId(card.id)) {
        await store.updateCard(card);
        updatedCards.push(card);
      } else {
        const created = await store.createCard(deckId, card);
        if (created) updatedCards.push(created);
      }
    }
    return { ...state, cards: updatedCards };
  }).catch(() => undefined);
}

export function newStateForUser() {
  return {
    screen: "create", // "create" | "study" | "classes" | "sharedStudy"
    cards: [],
    deckId: `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Stable ID for analytics
  };
}

export async function resetAllForUser(userId, setStateAndRender) {
  if (!userId) return;
  const { getActiveStore, withStoreFallback } = await import("./data/dataStore.js");
  const { store, isSupabase } = await getActiveStore();
  if (!isSupabase) {
    const userKey = getUserStorageKey(userId);
    localStorage.removeItem(userKey);
    await setStateAndRender(newStateForUser());
    return;
  }
  try {
    const decks = await store.listDecks();
    for (const d of decks) await store.deleteDeck(d.id);
    const created = await store.createDeck({ title: "My deck" });
    const deckId = created?.id ?? `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await setStateAndRender({ ...newStateForUser(), deckId });
  } catch (err) {
    console.warn("[dataStore] Reset failed; falling back to local clear.", err);
    const userKey = getUserStorageKey(userId);
    localStorage.removeItem(userKey);
    await setStateAndRender(newStateForUser());
  }
}

// Legacy functions for backward compatibility (deprecated, but kept for safety)
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Migration: ensure stage + stage3Mastered exist
    if (parsed?.cards?.length) {
      parsed.cards = parsed.cards.map(c => ({
        ...c,
        stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
        stage3Mastered: Boolean(c.stage3Mastered),
        longAnswer: Boolean(c.longAnswer), // Default to false if missing
      }));
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function newState() {
  return {
    screen: "create", // "create" | "study"
    cards: [],
  };
}

export function resetAll(setStateAndRender) {
  localStorage.removeItem(STORAGE_KEY);
  setStateAndRender(newState());
}
