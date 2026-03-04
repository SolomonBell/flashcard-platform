/**
 * Supabase-backed Classes store: orgs, classes, memberships, assignments, assigned decks.
 * Throws if Supabase is not configured or user is not signed in.
 */

import { getSupabase } from "../supabaseClient.js";
import { getUser } from "../auth/auth.js";

/**
 * Returns a store object with async methods for orgs/classes/assignments.
 * @throws {Error} "Supabase not configured or not signed in" if no client or no user
 */
export async function getClassesStore() {
  const supabase = await getSupabase();
  if (!supabase) throw new Error("Supabase not configured or not signed in");

  const { data: userData } = await getUser();
  const user = userData?.user;
  if (!user) throw new Error("Supabase not configured or not signed in");

  const userId = user.id;

  return {
    isStub: false,
    async listMyOrgs() {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, created_by, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async createOrg(name) {
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name: String(name).trim(), created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async listOrgMemberships(orgId) {
      const { data, error } = await supabase
        .from("org_memberships")
        .select("org_id, user_id, role")
        .eq("org_id", orgId);
      if (error) throw error;
      return data ?? [];
    },

    async getMyRoleInOrg(orgId) {
      const { data, error } = await supabase
        .from("org_memberships")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data?.role ?? null;
    },

    async listClasses(orgId) {
      const { data, error } = await supabase
        .from("classes")
        .select("id, org_id, name, created_by, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async createClass(orgId, name) {
      const { data, error } = await supabase
        .from("classes")
        .insert({ org_id: orgId, name: String(name).trim(), created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async addStudentToClass(classId, studentUserId) {
      const { data, error } = await supabase
        .from("class_students")
        .insert({ class_id: classId, user_id: studentUserId })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return { error: "Student is already in this class." };
        throw error;
      }
      return data;
    },

    async listMyDecks() {
      const { data, error } = await supabase
        .from("decks")
        .select("id, title, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async assignDeckToClass(classId, deckId) {
      const { data, error } = await supabase
        .from("class_deck_assignments")
        .insert({ class_id: classId, deck_id: deckId, assigned_by: userId })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") return { error: "This deck is already assigned to this class." };
        throw error;
      }
      return data;
    },

    async listAssignedDecksForMe() {
      const { data, error } = await supabase
        .from("v_assigned_decks")
        .select("*")
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },

    async listCardsForDeck(deckId) {
      const { data, error } = await supabase
        .from("cards")
        .select("id, deck_id, user_id, front, back, kind, metadata, created_at, updated_at")
        .eq("deck_id", deckId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },

    async getDeck(deckId) {
      const { data, error } = await supabase
        .from("decks")
        .select("id, title, created_at")
        .eq("id", deckId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getSharedDeckProgress(sharedDeckId) {
      const { data, error } = await supabase
        .from("shared_deck_progress")
        .select("cards, last_studied_at")
        .eq("shared_deck_id", sharedDeckId)
        .eq("student_id", userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        sharedDeckId,
        studentId: userId,
        cards: data.cards ?? [],
        lastStudiedAt: data.last_studied_at ? new Date(data.last_studied_at).getTime() : null,
      };
    },

    async saveSharedDeckProgress(sharedDeckId, cards) {
      const { error } = await supabase
        .from("shared_deck_progress")
        .upsert(
          {
            shared_deck_id: sharedDeckId,
            student_id: userId,
            cards,
            last_studied_at: new Date().toISOString(),
          },
          { onConflict: "shared_deck_id,student_id" }
        );
      if (error) throw error;
    },
  };
}
