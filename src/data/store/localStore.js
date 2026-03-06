/**
 * localStore — async-wrapped aggregation of all localStorage-backed store modules.
 *
 * Every method returns a Promise so that screens written against this interface
 * work unchanged when the implementation is swapped to Supabase (which is
 * network-based and inherently async).
 *
 * No localStorage is accessed here directly; all calls delegate to the
 * existing store modules that own each data domain.
 */

import {
  listDecks, createDeck, getDeck, saveDeck, renameDeck, duplicateDeck, deleteDeck,
  getActiveDeckId, setActiveDeckId, migrateFromOldFormat,
} from "../deckStore.js";

import {
  loadUsers, saveUsers, getUserByEmail, createUser,
  getSession, setSession, clearSession, getCurrentUser,
} from "../../authStore.js";

import {
  getClassesByTeacher, getClassesByStudent, getClassById,
  createClass, updateClass, deleteClass,
  addStudentToClass, removeStudentFromClass,
  addInvitedEmail, removeInvitedEmail, validateEmailDomain,
} from "../../classes/classesStore.js";

import {
  getSharedDecksByClass, getSharedDecksByTeacher, getSharedDeckById,
  shareDeckToClass, deleteSharedDeck,
  getSharedDeckProgress, saveSharedDeckProgress, resetSharedDeckProgress,
  getAllSharedProgress,
} from "../../classes/sharedDecksStore.js";

/** Wraps a synchronous function so it returns a Promise. */
const wrap = fn => async (...args) => fn(...args);

export const localStore = {
  // ── Decks ──────────────────────────────────────────────────────────────
  listDecks:           wrap(listDecks),
  createDeck:          wrap(createDeck),
  getDeck:             wrap(getDeck),
  saveDeck:            wrap(saveDeck),
  renameDeck:          wrap(renameDeck),
  duplicateDeck:       wrap(duplicateDeck),
  deleteDeck:          wrap(deleteDeck),
  getActiveDeckId:     wrap(getActiveDeckId),
  setActiveDeckId:     wrap(setActiveDeckId),
  migrateFromOldFormat: wrap(migrateFromOldFormat),

  // ── Auth ───────────────────────────────────────────────────────────────
  loadUsers:           wrap(loadUsers),
  saveUsers:           wrap(saveUsers),
  getUserByEmail:      wrap(getUserByEmail),
  createUser:          wrap(createUser),
  getSession:          wrap(getSession),
  setSession:          wrap(setSession),
  clearSession:        wrap(clearSession),
  getCurrentUser:      wrap(getCurrentUser),

  // ── Classes ────────────────────────────────────────────────────────────
  getClassesByTeacher:    wrap(getClassesByTeacher),
  getClassesByStudent:    wrap(getClassesByStudent),
  getClassById:           wrap(getClassById),
  createClass:            wrap(createClass),
  updateClass:            wrap(updateClass),
  deleteClass:            wrap(deleteClass),
  addStudentToClass:      wrap(addStudentToClass),
  removeStudentFromClass: wrap(removeStudentFromClass),
  addInvitedEmail:        wrap(addInvitedEmail),
  removeInvitedEmail:     wrap(removeInvitedEmail),
  validateEmailDomain:    wrap(validateEmailDomain),

  // ── Shared Decks ───────────────────────────────────────────────────────
  getSharedDecksByClass:    wrap(getSharedDecksByClass),
  getSharedDecksByTeacher:  wrap(getSharedDecksByTeacher),
  getSharedDeckById:        wrap(getSharedDeckById),
  shareDeckToClass:         wrap(shareDeckToClass),
  deleteSharedDeck:         wrap(deleteSharedDeck),
  getSharedDeckProgress:    wrap(getSharedDeckProgress),
  saveSharedDeckProgress:   wrap(saveSharedDeckProgress),
  resetSharedDeckProgress:  wrap(resetSharedDeckProgress),
  getAllSharedProgress:      wrap(getAllSharedProgress),
};
