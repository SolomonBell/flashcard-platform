/**
 * Store entry point.
 *
 * Set USE_SUPABASE = true to route all store calls through supabaseStore.
 * Set USE_SUPABASE = false to use localStore (localStorage).
 *
 * Named exports below are sourced from whichever store is active, so all
 * existing call sites (`import { listDecks } from "…/store/index.js"`) work
 * without changes regardless of which backend is selected.
 */

import { localStore }   from "./localStore.js";
import { supabaseStore } from "./supabaseStore.js";

// ── Feature flag ─────────────────────────────────────────────────────────────
const USE_SUPABASE = true;

/** The active store implementation. All screens import from here. */
export const store = USE_SUPABASE ? supabaseStore : localStore;

// ── Named re-exports from the active store ───────────────────────────────────
// Destructured from `store` so flipping USE_SUPABASE above is the only change
// needed to switch backends.

// Decks
export const listDecks            = (...a) => store.listDecks(...a);
export const createDeck           = (...a) => store.createDeck(...a);
export const getDeck              = (...a) => store.getDeck(...a);
export const saveDeck             = (...a) => store.saveDeck(...a);
export const renameDeck           = (...a) => store.renameDeck(...a);
export const duplicateDeck        = (...a) => store.duplicateDeck(...a);
export const deleteDeck           = (...a) => store.deleteDeck(...a);
export const getActiveDeckId      = (...a) => store.getActiveDeckId(...a);
export const setActiveDeckId      = (...a) => store.setActiveDeckId(...a);
export const migrateFromOldFormat = (...a) => store.migrateFromOldFormat(...a);

// Auth
export const loadUsers      = (...a) => store.loadUsers(...a);
export const saveUsers      = (...a) => store.saveUsers(...a);
export const getUserByEmail = (...a) => store.getUserByEmail(...a);
export const createUser     = (...a) => store.createUser(...a);
export const getSession     = (...a) => store.getSession(...a);
export const setSession     = (...a) => store.setSession(...a);
export const clearSession   = (...a) => store.clearSession(...a);
export const getCurrentUser = (...a) => store.getCurrentUser(...a);

// Classes
export const getClassesByTeacher    = (...a) => store.getClassesByTeacher(...a);
export const getClassesByStudent    = (...a) => store.getClassesByStudent(...a);
export const getClassById           = (...a) => store.getClassById(...a);
export const createClass            = (...a) => store.createClass(...a);
export const updateClass            = (...a) => store.updateClass(...a);
export const deleteClass            = (...a) => store.deleteClass(...a);
export const addStudentToClass      = (...a) => store.addStudentToClass(...a);
export const removeStudentFromClass = (...a) => store.removeStudentFromClass(...a);
export const addInvitedEmail        = (...a) => store.addInvitedEmail(...a);
export const removeInvitedEmail     = (...a) => store.removeInvitedEmail(...a);
export const validateEmailDomain    = (...a) => store.validateEmailDomain(...a);

// Shared Decks
export const getSharedDecksByClass   = (...a) => store.getSharedDecksByClass(...a);
export const getSharedDecksByTeacher = (...a) => store.getSharedDecksByTeacher(...a);
export const getSharedDeckById       = (...a) => store.getSharedDeckById(...a);
export const shareDeckToClass          = (...a) => store.shareDeckToClass(...a);
export const updateSharedDeckBadges   = (...a) => store.updateSharedDeckBadges(...a);
export const deleteSharedDeck         = (...a) => store.deleteSharedDeck(...a);
export const getSharedDeckProgress   = (...a) => store.getSharedDeckProgress(...a);
export const saveSharedDeckProgress  = (...a) => store.saveSharedDeckProgress(...a);
export const resetSharedDeckProgress = (...a) => store.resetSharedDeckProgress(...a);
export const getAllSharedProgress          = (...a) => store.getAllSharedProgress(...a);
export const getStudentProgressForClass   = (...a) => store.getStudentProgressForClass(...a);
export const getSessionsForSharedDecks    = (...a) => store.getSessionsForSharedDecks(...a);
export const upsertCardAttemptStat        = (...a) => store.upsertCardAttemptStat(...a);
export const getCardAttemptStatsForDeck   = (...a) => store.getCardAttemptStatsForDeck(...a);
