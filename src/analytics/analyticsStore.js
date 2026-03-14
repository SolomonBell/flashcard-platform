import { getSupabaseClient } from "../supabaseClient.js";

// Kept for any legacy imports that reference this constant.
export const STORAGE_ANALYTICS_KEY = "knowit_analytics_v1";

const MAX_HISTORY_ENTRIES = 50;

// ── In-memory session state ───────────────────────────────────────────────────

let currentSession = null;

function _newId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Public API (synchronous signatures preserved) ─────────────────────────────

export function startSession({ userId, deckContext, deckId }) {
  try {
    if (currentSession) endSession();
    currentSession = {
      id: _newId(),
      userId,
      deckContext: String(deckContext ?? ""),
      deckId,
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      interactions: { answersSubmitted: 0, correctCount: 0, incorrectCount: 0 },
    };
  } catch { /* fail silently */ }
}

export function endSession() {
  try {
    if (!currentSession) return;
    currentSession.endedAt = Date.now();
    currentSession.durationMs = currentSession.endedAt - currentSession.startedAt;
    // Snapshot before clearing so the async write captures the right values
    const session = {
      ...currentSession,
      interactions: { ...currentSession.interactions },
    };
    currentSession = null;
    _persistSession(session); // fire-and-forget
  } catch {
    currentSession = null;
  }
}

export function recordAnswer({ isCorrect }) {
  try {
    if (!currentSession) return;
    currentSession.interactions.answersSubmitted += 1;
    if (isCorrect) { currentSession.interactions.correctCount += 1; }
    else           { currentSession.interactions.incorrectCount += 1; }
  } catch { /* fail silently */ }
}

export function updateStageSnapshot({ cards }) {
  try {
    if (!currentSession) return;
    const { userId, deckId } = currentSession;
    const dist = {
      stage1Count:         cards.filter(c => c.stage === 1).length,
      stage2Count:         cards.filter(c => c.stage === 2).length,
      stage3Count:         cards.filter(c => c.stage === 3 && !c.stage3Mastered).length,
      stage3MasteredCount: cards.filter(c => c.stage === 3 &&  c.stage3Mastered).length,
    };
    _saveStageDistribution(userId, deckId, dist); // fire-and-forget
  } catch { /* fail silently */ }
}

// ── Read API (async — not currently called by UI, kept for future use) ────────

export async function getAnalyticsForUser(userId) {
  try {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("analytics_aggregates")
      .select("*")
      .eq("user_id", userId);
    const result = {};
    for (const row of (data ?? [])) {
      result[row.deck_id] = _mapAggregate(row);
    }
    return result;
  } catch {
    return {};
  }
}

export async function getSessionsForUser(userId) {
  try {
    const sb = await getSupabaseClient();
    const { data } = await sb
      .from("study_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false });
    return (data ?? []).map(_mapSession);
  } catch {
    return [];
  }
}

export async function getAllAnalytics() {
  try {
    const sb = await getSupabaseClient();
    const [{ data: sessions }, { data: aggs }] = await Promise.all([
      sb.from("study_sessions").select("*").order("started_at", { ascending: false }),
      sb.from("analytics_aggregates").select("*"),
    ]);
    const aggregates = {};
    for (const row of (aggs ?? [])) {
      if (!aggregates[row.user_id]) aggregates[row.user_id] = {};
      aggregates[row.user_id][row.deck_id] = _mapAggregate(row);
    }
    return { sessions: (sessions ?? []).map(_mapSession), aggregates };
  } catch {
    return { sessions: [], aggregates: {} };
  }
}

// ── Internal async writers (fire-and-forget, never throw) ────────────────────

async function _persistSession(session) {
  try {
    const sb = await getSupabaseClient();

    // 1. Record the completed session row
    await sb.from("study_sessions").insert({
      id:                 session.id,
      user_id:            session.userId,
      deck_id:            session.deckId,
      deck_context:       session.deckContext,
      started_at:         new Date(session.startedAt).toISOString(),
      ended_at:           new Date(session.endedAt).toISOString(),
      duration_ms:        session.durationMs,
      answers_submitted:  session.interactions.answersSubmitted,
      correct_count:      session.interactions.correctCount,
      incorrect_count:    session.interactions.incorrectCount,
    });

    // 2. Read current aggregate so we can add to running totals
    const { data: agg } = await sb
      .from("analytics_aggregates")
      .select("total_time_ms, total_sessions, answers_submitted, correct_count, incorrect_count, history")
      .eq("user_id", session.userId)
      .eq("deck_id", session.deckId)
      .single();

    const history = [...(agg?.history ?? [])];
    history.push({
      timestamp:   session.endedAt,
      durationMs:  session.durationMs,
      interactions: { ...session.interactions },
    });
    if (history.length > MAX_HISTORY_ENTRIES) {
      history.splice(0, history.length - MAX_HISTORY_ENTRIES);
    }

    await sb.from("analytics_aggregates").upsert({
      user_id:           session.userId,
      deck_id:           session.deckId,
      total_time_ms:     (agg?.total_time_ms      ?? 0) + session.durationMs,
      total_sessions:    (agg?.total_sessions      ?? 0) + 1,
      last_studied_at:   new Date(session.endedAt).toISOString(),
      answers_submitted: (agg?.answers_submitted   ?? 0) + session.interactions.answersSubmitted,
      correct_count:     (agg?.correct_count       ?? 0) + session.interactions.correctCount,
      incorrect_count:   (agg?.incorrect_count     ?? 0) + session.interactions.incorrectCount,
      history,
    }, { onConflict: "user_id,deck_id" });
  } catch {
    // Analytics must never crash the app
  }
}

/**
 * Upserts only the stage_distribution field.
 * On INSERT (no row yet): creates a minimal row with defaults for other columns.
 * On CONFLICT: updates only stage_distribution, leaves running totals intact.
 */
async function _saveStageDistribution(userId, deckId, distribution) {
  try {
    const sb = await getSupabaseClient();
    await sb.from("analytics_aggregates").upsert(
      { user_id: userId, deck_id: deckId, stage_distribution: distribution },
      { onConflict: "user_id,deck_id" }
    );
  } catch { /* fail silently */ }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function _mapSession(row) {
  return {
    userId:      row.user_id,
    deckContext: row.deck_context,
    deckId:      row.deck_id,
    startedAt:   new Date(row.started_at).getTime(),
    endedAt:     row.ended_at ? new Date(row.ended_at).getTime() : null,
    durationMs:  row.duration_ms,
    interactions: {
      answersSubmitted: row.answers_submitted,
      correctCount:     row.correct_count,
      incorrectCount:   row.incorrect_count,
    },
  };
}

function _mapAggregate(row) {
  return {
    totalTimeMs:    row.total_time_ms,
    totalSessions:  row.total_sessions,
    lastStudiedAt:  row.last_studied_at ? new Date(row.last_studied_at).getTime() : null,
    totals: {
      answersSubmitted: row.answers_submitted,
      correctCount:     row.correct_count,
      incorrectCount:   row.incorrect_count,
    },
    latestStageDistribution: row.stage_distribution ?? {},
    history: row.history ?? [],
  };
}

// ── Lifecycle: end session on page hide / unload ──────────────────────────────

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => { endSession(); });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && currentSession) endSession();
  });
}
