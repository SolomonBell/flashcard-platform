/**
 * supabaseStore — stub implementation of the store interface backed by Supabase.
 *
 * Every method rejects immediately so that any accidental call while
 * USE_SUPABASE is true fails fast with a clear message.
 *
 * Replace each stub with a real Supabase client call when implementing.
 * Method signatures must remain identical to localStore.
 */

const NOT_IMPLEMENTED = "Supabase store not enabled/implemented yet";
const stub = () => Promise.reject(new Error(NOT_IMPLEMENTED));

export const supabaseStore = {
  // ── Decks ──────────────────────────────────────────────────────────────
  listDecks:            stub,
  createDeck:           stub,
  getDeck:              stub,
  saveDeck:             stub,
  renameDeck:           stub,
  duplicateDeck:        stub,
  deleteDeck:           stub,
  getActiveDeckId:      stub,
  setActiveDeckId:      stub,
  migrateFromOldFormat: stub,

  // ── Auth ───────────────────────────────────────────────────────────────
  loadUsers:            stub,
  saveUsers:            stub,
  getUserByEmail:       stub,
  createUser:           stub,
  getSession:           stub,
  setSession:           stub,
  clearSession:         stub,
  getCurrentUser:       stub,

  // ── Classes ────────────────────────────────────────────────────────────
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

  // ── Shared Decks ───────────────────────────────────────────────────────
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
