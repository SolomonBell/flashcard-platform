export const STORAGE_SHARED_DECKS_KEY = "knowit_shared_decks_v1";
export const STORAGE_SHARED_PROGRESS_KEY = "knowit_shared_deck_progress_v1";

// Shared deck structure: { id, teacherId, classId, deckSnapshot, sharedAt, lastEditedAt }
// deckSnapshot: { cards: [...], deckName: string }

export function loadSharedDecks() {
  try {
    const raw = localStorage.getItem(STORAGE_SHARED_DECKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSharedDecks(decks) {
  localStorage.setItem(STORAGE_SHARED_DECKS_KEY, JSON.stringify(decks));
}

export function getSharedDecksByClass(classId) {
  const decks = loadSharedDecks();
  return decks.filter(d => d.classId === classId);
}

export function getSharedDecksByTeacher(teacherId) {
  const decks = loadSharedDecks();
  return decks.filter(d => d.teacherId === teacherId);
}

export function getSharedDeckById(sharedDeckId) {
  const decks = loadSharedDecks();
  return decks.find(d => d.id === sharedDeckId) || null;
}

export function shareDeckToClass(teacherId, classId, deckSnapshot) {
  const decks = loadSharedDecks();
  
  // Check if this deck is already shared to this class
  const existing = decks.find(d => 
    d.teacherId === teacherId && 
    d.classId === classId &&
    d.deckSnapshot.deckName === deckSnapshot.deckName
  );
  
  if (existing) {
    // Update existing shared deck and reset all student progress
    existing.deckSnapshot = {
      cards: JSON.parse(JSON.stringify(deckSnapshot.cards)), // deep copy
      deckName: deckSnapshot.deckName || "Untitled Deck",
    };
    existing.lastEditedAt = Date.now();
    saveSharedDecks(decks);
    
    // Reset all student progress for this shared deck
    resetSharedDeckProgress(existing.id);
    
    return existing;
  }
  
  // Create new shared deck
  const newDeck = {
    id: `shared_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    teacherId,
    classId,
    deckSnapshot: {
      cards: JSON.parse(JSON.stringify(deckSnapshot.cards)), // deep copy
      deckName: deckSnapshot.deckName || "Untitled Deck",
    },
    sharedAt: Date.now(),
    lastEditedAt: Date.now(),
  };
  decks.push(newDeck);
  saveSharedDecks(decks);
  return newDeck;
}

export function deleteSharedDeck(sharedDeckId) {
  const decks = loadSharedDecks();
  const filtered = decks.filter(d => d.id !== sharedDeckId);
  saveSharedDecks(filtered);
  
  // Also delete all progress for this deck
  const progress = loadSharedProgress();
  const filteredProgress = progress.filter(p => p.sharedDeckId !== sharedDeckId);
  saveSharedProgress(filteredProgress);
  
  return filtered.length < decks.length;
}

// Progress tracking per student per shared deck
export function loadSharedProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_SHARED_PROGRESS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveSharedProgress(progress) {
  localStorage.setItem(STORAGE_SHARED_PROGRESS_KEY, JSON.stringify(progress));
}

export function getSharedDeckProgress(sharedDeckId, studentId) {
  const progress = loadSharedProgress();
  return progress.find(p => p.sharedDeckId === sharedDeckId && p.studentId === studentId) || null;
}

export function saveSharedDeckProgress(sharedDeckId, studentId, cards) {
  const progress = loadSharedProgress();
  const index = progress.findIndex(p => p.sharedDeckId === sharedDeckId && p.studentId === studentId);
  
  const progressEntry = {
    sharedDeckId,
    studentId,
    cards: JSON.parse(JSON.stringify(cards)), // deep copy
    lastStudiedAt: Date.now(),
  };
  
  if (index === -1) {
    progress.push(progressEntry);
  } else {
    progress[index] = progressEntry;
  }
  
  saveSharedProgress(progress);
}

export function resetSharedDeckProgress(sharedDeckId) {
  const progress = loadSharedProgress();
  const filtered = progress.filter(p => p.sharedDeckId !== sharedDeckId);
  saveSharedProgress(filtered);
}

export function getSharedDecksForStudent(studentId) {
  // Get all classes the student is enrolled in
  const classes = loadClasses();
  const classIds = classes.filter(c => c.studentIds && c.studentIds.includes(studentId)).map(c => c.id);
  
  // Get all shared decks for those classes
  const allSharedDecks = loadSharedDecks();
  return allSharedDecks.filter(d => classIds.includes(d.classId));
}

function loadClasses() {
  try {
    const raw = localStorage.getItem("knowit_classes_v1");
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
