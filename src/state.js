import {
  getDeck, saveDeck, getActiveDeckId, setActiveDeckId,
  migrateFromOldFormat,
} from "./data/deckStore.js";

const USER_STATE_PREFIX = "knowit_user_state_v1_";

function userStateKey(userId) { return `${USER_STATE_PREFIX}${userId}`; }

function loadUserScreenState(userId) {
  try {
    const raw = localStorage.getItem(userStateKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveUserScreenState(userId, screen) {
  localStorage.setItem(userStateKey(userId), JSON.stringify({ screen }));
}

export async function loadStateForUser(userId) {
  if (!userId) return null;

  // One-time migration from old single-deck blob format
  migrateFromOldFormat(userId);

  const activeDeckId = getActiveDeckId(userId);
  if (!activeDeckId) {
    return { screen: "decks", cards: [], deckId: null, deckTitle: null, lastShownCardId: null };
  }

  const deck = getDeck(userId, activeDeckId);
  if (!deck) {
    setActiveDeckId(userId, null);
    return { screen: "decks", cards: [], deckId: null, deckTitle: null, lastShownCardId: null };
  }

  const userScreen = loadUserScreenState(userId);
  return {
    screen: userScreen.screen || "create",
    cards: deck.cards || [],
    deckId: activeDeckId,
    deckTitle: deck.title || "My Deck",
    lastShownCardId: deck.lastShownCardId || null,
    largeDeckBacklog: deck.largeDeckBacklog, // undefined if not yet initialized
  };
}

export async function saveStateForUser(userId, state) {
  if (!userId || !state) return;
  saveUserScreenState(userId, state.screen);
  if (state.deckId) {
    setActiveDeckId(userId, state.deckId);
    saveDeck(userId, {
      id: state.deckId,
      title: state.deckTitle || "My Deck",
      cards: state.cards || [],
      lastShownCardId: state.lastShownCardId || null,
      largeDeckBacklog: state.largeDeckBacklog,
    });
  }
}

export function newStateForUser() {
  return {
    screen: "decks",
    cards: [],
    deckId: null,
    deckTitle: null,
    lastShownCardId: null,
  };
}

export async function resetAllForUser(userId, setStateAndRender) {
  if (!userId) return;
  const activeDeckId = getActiveDeckId(userId);
  if (activeDeckId) {
    saveDeck(userId, {
      id: activeDeckId,
      title: "My Deck",
      cards: [],
      lastShownCardId: null,
    });
    await setStateAndRender({
      screen: "create",
      cards: [],
      deckId: activeDeckId,
      deckTitle: "My Deck",
      lastShownCardId: null,
    });
  } else {
    await setStateAndRender(newStateForUser());
  }
}
