/**
 * Data normalization / mapping layer.
 *
 * Pure functions that convert raw records — either local camelCase objects
 * or Supabase snake_case rows — into the canonical camelCase shapes used
 * throughout the UI.
 *
 * Rules:
 *   • camelCase fields take priority; snake_case fields are the fallback.
 *   • Missing optional fields produce null / [] / "" rather than undefined.
 *   • No side-effects; each function returns a new object.
 */

// ── Primitives ───────────────────────────────────────────────────────────────

/**
 * Normalizes an email address: trims whitespace and lowercases.
 * Safe for null / undefined input.
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function normalizeEmail(email) {
  if (email == null) return null;
  return String(email).trim().toLowerCase();
}

/**
 * Converts a Unix timestamp (ms), ISO date string, or Date object to an
 * ISO 8601 string.  Returns null for falsy / invalid input.
 * @param {number|string|Date|null|undefined} dateOrTimestamp
 * @returns {string|null}
 */
export function toIsoString(dateOrTimestamp) {
  if (!dateOrTimestamp) return null;
  if (typeof dateOrTimestamp === "string") {
    const d = new Date(dateOrTimestamp);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof dateOrTimestamp === "number") {
    return new Date(dateOrTimestamp).toISOString();
  }
  if (dateOrTimestamp instanceof Date) {
    return isNaN(dateOrTimestamp.getTime()) ? null : dateOrTimestamp.toISOString();
  }
  return null;
}

// ── Entity mappers ───────────────────────────────────────────────────────────

/**
 * Maps a deck index entry to the canonical shape.
 * Accepts camelCase (local) or snake_case (Supabase) input.
 *
 * Example — snake_case Supabase row:
 *   { id: "d1", title: "Spanish", created_at: "2025-01-01T00:00:00Z", updated_at: "…" }
 *   → { id: "d1", title: "Spanish", createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "…" }
 *
 * @returns {{ id: string, title: string, createdAt: string|null, updatedAt: string|null }}
 */
export function mapDeck(input) {
  if (!input) return null;
  return {
    id: input.id,
    title: input.title ?? "",
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    updatedAt: toIsoString(input.updatedAt ?? input.updated_at),
  };
}

/**
 * Maps a card record to the canonical shape.
 * Preserves all study-state fields used by the spaced-repetition logic.
 * Accepts camelCase (local) or snake_case (Supabase) input.
 *
 * @returns {{
 *   id: string,
 *   deckId: string|undefined,
 *   front: string,
 *   back: string,
 *   stage: number,
 *   createdAt: string|null,
 *   lastSeenAt: string|null,
 *   stage3Mastered: boolean,
 *   longAnswer: boolean,
 * }}
 */
export function mapCard(input) {
  if (!input) return null;
  return {
    id: input.id,
    deckId: input.deckId ?? input.deck_id ?? undefined,
    front: input.front ?? "",
    back: input.back ?? "",
    stage: input.stage ?? 1,
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    lastSeenAt: toIsoString(input.lastSeenAt ?? input.last_seen_at),
    stage3Mastered: Boolean(input.stage3Mastered ?? input.stage3_mastered),
    longAnswer: Boolean(input.longAnswer ?? input.long_answer),
  };
}

/**
 * Maps a class record to the canonical shape.
 * Accepts camelCase (local) or snake_case (Supabase) input.
 *
 * Example — snake_case Supabase row:
 *   { id: "c1", teacher_id: "u1", name: "Period 1", created_at: "…" }
 *   → { id: "c1", teacherId: "u1", name: "Period 1", studentIds: [],
 *       invitedEmails: [], allowedDomains: [], createdAt: "…", updatedAt: null }
 *
 * @returns {{
 *   id: string,
 *   name: string,
 *   teacherId: string|null,
 *   studentIds: string[],
 *   invitedEmails: string[],
 *   allowedDomains: string[],
 *   createdAt: string|null,
 *   updatedAt: string|null,
 * }}
 */
export function mapClass(input) {
  if (!input) return null;
  return {
    id: input.id,
    name: input.name ?? "",
    teacherId: input.teacherId ?? input.teacher_id ?? null,
    studentIds: input.studentIds ?? input.student_ids ?? [],
    invitedEmails: input.invitedEmails ?? input.invited_emails ?? [],
    allowedDomains: input.allowedDomains ?? input.allowed_domains ?? [],
    createdAt: toIsoString(input.createdAt ?? input.created_at),
    updatedAt: toIsoString(input.updatedAt ?? input.updated_at),
  };
}

/**
 * Maps a shared-deck record to the canonical shape.
 * Accepts camelCase (local) or snake_case (Supabase) input.
 *
 * Example — snake_case Supabase row:
 *   { id: "sd1", class_id: "c1", shared_by: "u1", created_at: "…",
 *     deck_snapshot: { deckName: "Vocab", cards: [] } }
 *   → { id: "sd1", classId: "c1", teacherId: "u1",
 *       deckSnapshot: { deckName: "Vocab", cards: [] },
 *       sharedAt: "…", lastEditedAt: null }
 *
 * @returns {{
 *   id: string,
 *   classId: string|null,
 *   teacherId: string|null,
 *   deckSnapshot: { deckName: string, cards: any[] },
 *   sharedAt: string|null,
 *   lastEditedAt: string|null,
 * }}
 */
export function mapSharedDeck(input) {
  if (!input) return null;
  return {
    id: input.id,
    classId: input.classId ?? input.class_id ?? null,
    teacherId: input.teacherId ?? input.teacher_id ?? input.shared_by ?? null,
    deckSnapshot: input.deckSnapshot ?? input.deck_snapshot ?? { deckName: "", cards: [] },
    sharedAt: toIsoString(input.sharedAt ?? input.shared_at ?? input.created_at),
    lastEditedAt: toIsoString(input.lastEditedAt ?? input.last_edited_at),
  };
}
