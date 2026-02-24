export const STORAGE_ANALYTICS_KEY = "knowit_analytics_v1";
const MAX_HISTORY_ENTRIES = 50;

// Analytics data structure:
// {
//   sessions: [{ userId, deckContext, deckId, startedAt, endedAt, durationMs, interactions }],
//   aggregates: { [userId]: { [deckId]: { totalTimeMs, totalSessions, lastStudiedAt, totals, latestStageDistribution, history } } }
// }

function loadAnalytics() {
  try {
    const raw = localStorage.getItem(STORAGE_ANALYTICS_KEY);
    if (!raw) return { sessions: [], aggregates: {} };
    return JSON.parse(raw);
  } catch {
    return { sessions: [], aggregates: {} };
  }
}

function saveAnalytics(data) {
  try {
    localStorage.setItem(STORAGE_ANALYTICS_KEY, JSON.stringify(data));
  } catch (err) {
    // Fail silently
  }
}

let currentSession = null;

export function startSession({ userId, deckContext, deckId }) {
  try {
    if (currentSession) {
      // End any existing session first
      endSession();
    }
    
    currentSession = {
      userId,
      deckContext,
      deckId,
      startedAt: Date.now(),
      endedAt: null,
      durationMs: null,
      interactions: {
        answersSubmitted: 0,
        correctCount: 0,
        incorrectCount: 0,
      },
    };
  } catch (err) {
    // Fail silently
  }
}

export function endSession() {
  try {
    if (!currentSession) return;
    
    currentSession.endedAt = Date.now();
    currentSession.durationMs = currentSession.endedAt - currentSession.startedAt;
    
    const analytics = loadAnalytics();
    
    // Add session to sessions array
    analytics.sessions.push({ ...currentSession });
    
    // Update aggregates
    const { userId, deckId } = currentSession;
    if (!analytics.aggregates[userId]) {
      analytics.aggregates[userId] = {};
    }
    if (!analytics.aggregates[userId][deckId]) {
      analytics.aggregates[userId][deckId] = {
        totalTimeMs: 0,
        totalSessions: 0,
        lastStudiedAt: null,
        totals: {
          answersSubmitted: 0,
          correctCount: 0,
          incorrectCount: 0,
        },
        latestStageDistribution: {
          stage1Count: 0,
          stage2Count: 0,
          stage3Count: 0,
          stage3MasteredCount: 0,
        },
        history: [],
      };
    }
    
    const aggregate = analytics.aggregates[userId][deckId];
    aggregate.totalTimeMs += currentSession.durationMs;
    aggregate.totalSessions += 1;
    aggregate.lastStudiedAt = currentSession.endedAt;
    aggregate.totals.answersSubmitted += currentSession.interactions.answersSubmitted;
    aggregate.totals.correctCount += currentSession.interactions.correctCount;
    aggregate.totals.incorrectCount += currentSession.interactions.incorrectCount;
    
    // Add snapshot to history (cap at MAX_HISTORY_ENTRIES)
    const snapshot = {
      timestamp: currentSession.endedAt,
      durationMs: currentSession.durationMs,
      interactions: { ...currentSession.interactions },
    };
    aggregate.history.push(snapshot);
    if (aggregate.history.length > MAX_HISTORY_ENTRIES) {
      aggregate.history = aggregate.history.slice(-MAX_HISTORY_ENTRIES);
    }
    
    saveAnalytics(analytics);
    currentSession = null;
  } catch (err) {
    // Fail silently
    currentSession = null;
  }
}

export function recordAnswer({ isCorrect }) {
  try {
    if (!currentSession) return;
    
    currentSession.interactions.answersSubmitted += 1;
    if (isCorrect) {
      currentSession.interactions.correctCount += 1;
    } else {
      currentSession.interactions.incorrectCount += 1;
    }
  } catch (err) {
    // Fail silently
  }
}

export function updateStageSnapshot({ cards }) {
  try {
    if (!currentSession) return;
    
    const analytics = loadAnalytics();
    const { userId, deckId } = currentSession;
    
    if (!analytics.aggregates[userId]) {
      analytics.aggregates[userId] = {};
    }
    if (!analytics.aggregates[userId][deckId]) {
      analytics.aggregates[userId][deckId] = {
        totalTimeMs: 0,
        totalSessions: 0,
        lastStudiedAt: null,
        totals: {
          answersSubmitted: 0,
          correctCount: 0,
          incorrectCount: 0,
        },
        latestStageDistribution: {
          stage1Count: 0,
          stage2Count: 0,
          stage3Count: 0,
          stage3MasteredCount: 0,
        },
        history: [],
      };
    }
    
    const aggregate = analytics.aggregates[userId][deckId];
    
    // Update stage distribution
    aggregate.latestStageDistribution = {
      stage1Count: cards.filter(c => c.stage === 1).length,
      stage2Count: cards.filter(c => c.stage === 2).length,
      stage3Count: cards.filter(c => c.stage === 3 && !c.stage3Mastered).length,
      stage3MasteredCount: cards.filter(c => c.stage === 3 && c.stage3Mastered).length,
    };
    
    saveAnalytics(analytics);
  } catch (err) {
    // Fail silently
  }
}

export function getAnalyticsForUser(userId) {
  try {
    const analytics = loadAnalytics();
    return analytics.aggregates[userId] || {};
  } catch {
    return {};
  }
}

export function getSessionsForUser(userId) {
  try {
    const analytics = loadAnalytics();
    return analytics.sessions.filter(s => s.userId === userId);
  } catch {
    return [];
  }
}

// Helper to read all analytics (for teacher dashboards)
export function getAllAnalytics() {
  return loadAnalytics();
}

// Clean up session on page unload/visibility change
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    endSession();
  });
  
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && currentSession) {
      endSession();
    }
  });
}
