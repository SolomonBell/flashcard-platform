export const STORAGE_KEY = "flashcards_app_v1";

function getUserStorageKey(userId) {
  return `flashcards_app_v1_user_${userId}`;
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

export function loadStateForUser(userId) {
  if (!userId) return null;
  
  // Try to migrate legacy state first (only if user has no state yet)
  migrateLegacyStateToUser(userId);
  
  try {
    const userKey = getUserStorageKey(userId);
    const raw = localStorage.getItem(userKey);
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

    // Migration: ensure deckId exists for analytics
    if (!parsed.deckId) {
      parsed.deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    if (parsed.lastShownCardId === undefined) {
      parsed.lastShownCardId = null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveStateForUser(userId, state) {
  if (!userId) return;
  const userKey = getUserStorageKey(userId);
  localStorage.setItem(userKey, JSON.stringify(state));
}

export function newStateForUser() {
  return {
    screen: "create", // "create" | "study" | "classes" | "sharedStudy"
    cards: [],
    deckId: `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Stable ID for analytics
    lastShownCardId: null, // Avoid showing same card twice in a row
  };
}

export function resetAllForUser(userId, setStateAndRender) {
  if (!userId) return;
  const userKey = getUserStorageKey(userId);
  localStorage.removeItem(userKey);
  setStateAndRender(newStateForUser());
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
