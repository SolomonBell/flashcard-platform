/**
 * Data store abstraction: Supabase when configured + authed, else app uses localStorage (state.js, classesStore, sharedDecksStore) directly.
 * Call useSupabase() to decide which path to use; then call these functions only when Supabase is in use (or use getDeckStore() / getProgressStore()).
 */

import { getSupabase } from "./supabaseClient.js";

let _getCurrentUser = null;
export function setAuthGetter(getter) {
  _getCurrentUser = getter;
}

/** Returns true if Supabase is configured and user is authenticated. */
export async function useSupabase() {
  const sb = await getSupabase();
  if (!sb) return false;
  const user = _getCurrentUser ? _getCurrentUser() : null;
  return !!user;
}

/** Get the appropriate deck store: { getDecksForUser, saveDeck, loadDeck } — Supabase impl when useSupabase, else null (caller uses state.js). */
export async function getDeckStore() {
  if (!(await useSupabase())) return null;
  return supabaseDeckStore();
}

/** Get the appropriate progress store for shared decks: { loadProgress, saveProgress } — Supabase when useSupabase, else null (caller uses sharedDecksStore). */
export async function getProgressStore() {
  if (!(await useSupabase())) return null;
  return supabaseProgressStore();
}

// ---------- Supabase deck implementation ----------
function supabaseDeckStore() {
  return {
    async getDecksForUser(userId) {
      const sb = await getSupabase();
      if (!sb) return [];
      const { data, error } = await sb.from("decks").select("id, title, description, created_at, updated_at").eq("owner_user_id", userId).order("updated_at", { ascending: false });
      if (error) {
        console.warn("[dataStore] getDecksForUser", error);
        return [];
      }
      return (data || []).map((r) => ({ id: r.id, deckId: r.id, title: r.title || "Untitled Deck", description: r.description || "" }));
    },

    async loadDeck(userId, deckId) {
      const sb = await getSupabase();
      if (!sb) return null;
      const { data: deck, error: deckErr } = await sb.from("decks").select("id, title, description").eq("id", deckId).eq("owner_user_id", userId).single();
      if (deckErr || !deck) return null;
      const { data: rows, error: cardsErr } = await sb.from("cards").select("id, front, back, long_answer, stage, stage3_mastered, last_seen_at, created_at").eq("deck_id", deckId).order("created_at", { ascending: true });
      if (cardsErr) return { ...deck, cards: [] };
      const cards = (rows || []).map((c) => ({
        id: c.id,
        front: c.front || "",
        back: c.back || "",
        longAnswer: !!c.long_answer,
        stage: c.stage ?? 1,
        stage3Mastered: !!c.stage3_mastered,
        lastSeenAt: c.last_seen_at ? new Date(c.last_seen_at).getTime() : null,
        createdAt: c.created_at ? new Date(c.created_at).getTime() : Date.now(),
      }));
      return { id: deck.id, deckId: deck.id, title: deck.title, description: deck.description || "", cards };
    },

    async saveDeck(userId, deck) {
      const sb = await getSupabase();
      if (!sb) return null;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      let deckId = deck.deckId || deck.id;
      if (!deckId || !uuidRe.test(deckId)) {
        deckId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `deck_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      const { error: deckErr } = await sb.from("decks").upsert(
        {
          id: deckId,
          owner_user_id: userId,
          title: deck.title || "Untitled Deck",
          description: deck.description || "",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (deckErr) {
        console.warn("[dataStore] saveDeck deck", deckErr);
        return null;
      }
      const cards = (deck.cards || []).map((c) => ({
        id: (typeof c.id === "string" && uuidRe.test(c.id)) ? c.id : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : c.id),
        deck_id: deckId,
        front: c.front || "",
        back: c.back || "",
        long_answer: !!c.longAnswer,
        stage: c.stage ?? 1,
        stage3_mastered: !!c.stage3Mastered,
        last_seen_at: c.lastSeenAt ? new Date(c.lastSeenAt).toISOString() : null,
      }));
      for (const card of cards) {
        await sb.from("cards").upsert(card, { onConflict: "id" });
      }
      return { id: deckId };
    },
  };
}


// ---------- Supabase shared deck progress implementation ----------
function supabaseProgressStore() {
  return {
    async loadProgress(sharedDeckId, studentId) {
      const sb = await getSupabase();
      if (!sb) return null;
      const { data, error } = await sb.from("shared_deck_progress").select("progress_json").eq("shared_deck_id", sharedDeckId).eq("student_user_id", studentId).single();
      if (error || !data) return null;
      const p = data.progress_json;
      return p && p.cards ? p : null;
    },

    async saveProgress(sharedDeckId, studentId, progressData) {
      const sb = await getSupabase();
      if (!sb) return;
      await sb.from("shared_deck_progress").upsert(
        {
          shared_deck_id: sharedDeckId,
          student_user_id: studentId,
          progress_json: progressData || {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shared_deck_id,student_user_id" }
      );
    },
  };
}

export const dataStore = {
  useSupabase,
  getDeckStore,
  getProgressStore,
};
