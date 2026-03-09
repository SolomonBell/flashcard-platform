/**
 * Multi-deck store — all data in localStorage.
 *
 * Keys:
 *   knowit_decks_v1_{userId}          → [{ id, title, createdAt, updatedAt }]
 *   knowit_deck_v1_{userId}_{deckId}  → { id, title, cards, lastShownCardId }
 *   knowit_active_deck_v1_{userId}    → deckId string
 */
import { mapDeck } from "./mappers.js";

function indexKey(userId) { return `knowit_decks_v1_${userId}`; }
function dataKey(userId, deckId) { return `knowit_deck_v1_${userId}_${deckId}`; }
function activeKey(userId) { return `knowit_active_deck_v1_${userId}`; }

function loadIndex(userId) {
  try {
    const raw = localStorage.getItem(indexKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveIndex(userId, index) {
  localStorage.setItem(indexKey(userId), JSON.stringify(index));
}

function normalizeCards(cards) {
  return (cards || []).map(c => ({
    ...c,
    stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
    stage3Mastered: Boolean(c.stage3Mastered),
    longAnswer: Boolean(c.longAnswer),
  }));
}

export function listDecks(userId) {
  return loadIndex(userId).map(mapDeck);
}

export function createDeck(userId, title = "New Deck") {
  const id = `deck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();
  const trimmed = (title || "New Deck").trim() || "New Deck";
  const index = loadIndex(userId);
  index.push({ id, title: trimmed, createdAt: now, updatedAt: now });
  saveIndex(userId, index);
  localStorage.setItem(dataKey(userId, id), JSON.stringify({
    id, title: trimmed, cards: [], lastShownCardId: null,
  }));
  return id;
}

export function getDeck(userId, deckId) {
  try {
    const raw = localStorage.getItem(dataKey(userId, deckId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    parsed.cards = normalizeCards(parsed.cards);
    // Map top-level fields; preserve cards, lastShownCardId, and large-deck state unchanged
    return { ...mapDeck(parsed), cards: parsed.cards, lastShownCardId: parsed.lastShownCardId, largeDeckBacklog: parsed.largeDeckBacklog };
  } catch { return null; }
}

export function saveDeck(userId, deck) {
  if (!userId || !deck?.id) return;
  const now = Date.now();
  localStorage.setItem(dataKey(userId, deck.id), JSON.stringify(deck));
  const index = loadIndex(userId);
  const i = index.findIndex(e => e.id === deck.id);
  if (i !== -1) {
    index[i].title = deck.title || index[i].title;
    index[i].updatedAt = now;
  } else {
    index.push({ id: deck.id, title: deck.title || "My Deck", createdAt: now, updatedAt: now });
  }
  saveIndex(userId, index);
}

export function renameDeck(userId, deckId, newTitle) {
  const trimmed = (newTitle || "").trim();
  if (!trimmed) return;
  const index = loadIndex(userId);
  const i = index.findIndex(e => e.id === deckId);
  if (i !== -1) { index[i].title = trimmed; index[i].updatedAt = Date.now(); saveIndex(userId, index); }
  const deck = getDeck(userId, deckId);
  if (deck) { deck.title = trimmed; localStorage.setItem(dataKey(userId, deckId), JSON.stringify(deck)); }
}

export function duplicateDeck(userId, deckId) {
  const original = getDeck(userId, deckId);
  if (!original) return null;
  const origEntry = loadIndex(userId).find(e => e.id === deckId);
  const newTitle = `${origEntry?.title || original.title || "Deck"} Copy`;
  const newId = createDeck(userId, newTitle);
  if (original.cards?.length) {
    const deck = getDeck(userId, newId);
    if (deck) {
      deck.cards = original.cards.map(c => ({
        ...c,
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        stage: 1,
        stage3Mastered: false,
        lastSeenAt: null,
      }));
      deck.title = newTitle;
      localStorage.setItem(dataKey(userId, newId), JSON.stringify(deck));
    }
  }
  return newId;
}

export function deleteDeck(userId, deckId) {
  localStorage.removeItem(dataKey(userId, deckId));
  const index = loadIndex(userId);
  saveIndex(userId, index.filter(e => e.id !== deckId));
  if (getActiveDeckId(userId) === deckId) setActiveDeckId(userId, null);
}

export function getActiveDeckId(userId) {
  return localStorage.getItem(activeKey(userId)) || null;
}

export function setActiveDeckId(userId, deckId) {
  if (deckId) { localStorage.setItem(activeKey(userId), deckId); }
  else { localStorage.removeItem(activeKey(userId)); }
}

/**
 * One-time migration from old single-blob format
 * (flashcards_app_v1_user_{userId}) to multi-deck format.
 */
export function migrateFromOldFormat(userId) {
  const oldKey = `flashcards_app_v1_user_${userId}`;
  const raw = localStorage.getItem(oldKey);
  if (!raw) return false;
  try {
    if (loadIndex(userId).length > 0) {
      localStorage.removeItem(oldKey);
      return false;
    }
    const parsed = JSON.parse(raw);
    const deckId = parsed.deckId || `deck_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const title = parsed.deckTitle || "My Deck";
    const now = Date.now();
    saveIndex(userId, [{ id: deckId, title, createdAt: now, updatedAt: now }]);
    localStorage.setItem(dataKey(userId, deckId), JSON.stringify({
      id: deckId,
      title,
      cards: normalizeCards(parsed.cards),
      lastShownCardId: parsed.lastShownCardId || null,
    }));
    setActiveDeckId(userId, deckId);
    localStorage.removeItem(oldKey);
    return true;
  } catch { return false; }
}
