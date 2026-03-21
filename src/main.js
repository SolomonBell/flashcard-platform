import { loadStateForUser, saveStateForUser, newStateForUser, resetAllForUser } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { getCurrentUser, clearSession, initAuth } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";
import { startSession, endSession, recordAnswer, updateStageSnapshot } from "./analytics/analyticsStore.js";

let state = null;
let currentUserId = null;

const appEl = document.getElementById("app");

let savedHideTimeout = null;

function setSyncStatus(type, message) {
  const header = document.querySelector(".header");
  let wrap = header?.querySelector("#syncStatusContainer");
  if (!header) return;
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "syncStatusContainer";
    wrap.className = "sync-status-wrap";
  }
  if (savedHideTimeout) {
    clearTimeout(savedHideTimeout);
    savedHideTimeout = null;
  }
  const text =
    type === "saving" ? "Saving…" :
    type === "saved" ? "Saved" :
    type === "error" ? (message ? `Error: ${String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}` : "Error") : "";
  const visible = type !== "idle" && text;
  wrap.innerHTML = visible
    ? `<span class="sync-status-pill sync-status-${type}">${text}</span>`
    : "";
  wrap.style.display = visible ? "block" : "none";
  if (type === "saved") {
    savedHideTimeout = setTimeout(() => {
      setSyncStatus("idle");
      savedHideTimeout = null;
    }, 1500);
  }
}

function getEffectiveUser() {
  return getCurrentUser();
}

async function loadUserState() {
  const user = getEffectiveUser();
  if (!user) {
    state = null;
    currentUserId = null;
    return;
  }
  currentUserId = user.id;
  state = (await loadStateForUser(currentUserId)) ?? newStateForUser();
}

function setScreen(screen) {
  if (!state) return;
  state.screen = screen;
}

async function save() {
  if (!state || !currentUserId) return;
  setSyncStatus("saving");
  try {
    await saveStateForUser(currentUserId, state);
    setSyncStatus("saved");
  } catch (err) {
    setSyncStatus("error", err?.message || "Save failed");
  }
}

async function setStateAndRender(nextState) {
  state = nextState;
  await save();
  renderAll();
}

function feedback(payload) {
  recordAnswer({ isCorrect: payload.correct, card: payload.current });
  renderFeedback(appEl, state, payload, {
    renderProgressBar,
    save,
    setScreen,
    renderAll,
    next: () => {
      if (state && state.cards) {
        updateStageSnapshot({ cards: state.cards });
      }
      renderAll();
    },
  });
}

function renderNavigation(currentUser) {
  const header = document.querySelector(".header");
  if (!header) return;

  const existingRow = header.querySelector(".header-nav-row");
  const existingSync = existingRow?.querySelector("#syncStatusContainer") ?? null;
  if (existingRow) existingRow.remove();

  const navContainer = document.createElement("div");
  navContainer.id = "navButtons";
  navContainer.style.cssText = "display:flex; gap:8px; justify-content:center; flex-wrap:wrap; align-items:center;";

  const syncStatusContainer = existingSync ?? document.createElement("div");
  syncStatusContainer.id = "syncStatusContainer";
  syncStatusContainer.className = "sync-status-wrap";

  const myDecksBtn = document.createElement("button");
  myDecksBtn.textContent = "Decks";
  myDecksBtn.className = "small";
  myDecksBtn.style.cssText = "padding:6px 10px; font-size:12px;";
  myDecksBtn.addEventListener("click", () => {
    if (state) {
      setScreen("decks");
      save();
      renderAll();
    }
  });
  navContainer.appendChild(myDecksBtn);

  const classesBtn = document.createElement("button");
  classesBtn.textContent = "Classes";
  classesBtn.className = "small";
  classesBtn.style.cssText = "padding:6px 10px; font-size:12px;";
  classesBtn.addEventListener("click", () => {
    if (state) {
      setScreen("classes");
      save();
      renderAll();
    }
  });
  navContainer.appendChild(classesBtn);

  if (currentUser.role === "teacher") {
    const analyticsBtn = document.createElement("button");
    analyticsBtn.textContent = "Analytics";
    analyticsBtn.className = "small";
    analyticsBtn.style.cssText = "padding:6px 10px; font-size:12px;";
    analyticsBtn.addEventListener("click", () => {
      if (state) {
        setScreen("analytics");
        save();
        renderAll();
      }
    });
    navContainer.appendChild(analyticsBtn);
  }

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.textContent = "Log out";
  logoutBtn.className = "small";
  logoutBtn.style.cssText = "padding:6px 10px; font-size:12px;";
  logoutBtn.addEventListener("click", () => {
    clearSession();
    renderAll();
  });
  navContainer.appendChild(logoutBtn);

  const leftSpacer = document.createElement("div");

  syncStatusContainer.style.cssText = "justify-self:end; min-width:80px; text-align:right;";

  const row = document.createElement("div");
  row.className = "header-nav-row";
  row.style.cssText = "display:grid; grid-template-columns:1fr auto 1fr; align-items:center; margin-top:12px;";
  row.appendChild(leftSpacer);
  row.appendChild(navContainer);
  row.appendChild(syncStatusContainer);
  header.appendChild(row);
}

let previousScreen = null;

async function renderAll() {
  const currentUser = getEffectiveUser();

  if (!currentUser) {
    endSession();
    document.querySelector("#logoutBtn")?.remove();
    document.querySelector("#navButtons")?.remove();
    state = null;
    currentUserId = null;
    previousScreen = null;
    renderAuthScreen(appEl, async () => {
      await loadUserState();
      if (state && getEffectiveUser()?.role === "teacher") {
        state.screen = "decks";
      }
      renderAll();
    });
    return;
  }

  if (currentUser.id !== currentUserId) {
    endSession();
    await loadUserState();
    previousScreen = null;
  }

  if (!state) {
    await loadUserState();
  }

  if (previousScreen === "study" || previousScreen === "sharedStudy") {
    if (state.screen !== "study" && state.screen !== "sharedStudy") {
      endSession();
    }
  }

  if ((state.screen === "study" || state.screen === "sharedStudy") &&
      previousScreen !== "study" && previousScreen !== "sharedStudy") {
    if (state.screen === "study") {
      startSession({
        userId: currentUser.id,
        deckContext: "personal",
        deckId: state.deckId || `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
      if (!state.deckId) {
        state.deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        save();
      }
    } else if (state.screen === "sharedStudy") {
      startSession({
        userId: currentUser.id,
        deckContext: "shared",
        deckId: state.sharedDeckId,
      });
    }
  }

  renderNavigation(currentUser);

  if (state.screen === "decks") {
    const { renderDecksScreen } = await import("./screens/decksScreen.js");
    renderDecksScreen(appEl, { renderAll, save, state, currentUserId });
  } else if (state.screen === "create") {
    renderCreateScreen(appEl, state, {
      save,
      setScreen,
      renderAll,
      resetAll: () => resetAllForUser(currentUserId, setStateAndRender),
    });
  } else if (state.screen === "analytics") {
    const { renderAnalyticsScreen } = await import("./screens/analyticsScreen.js");
    renderAnalyticsScreen(appEl, { currentUserId });
  } else if (state.screen === "classes") {
    const { renderClassesScreen } = await import("./screens/classesScreen.js");
    const startAssignedDeckStudy = ({ deckId, cards }) => {
      state.cards = cards;
      state.deckId = deckId;
      state.screen = "study";
      renderAll();
    };
    await renderClassesScreen(appEl, { setScreen, renderAll, startAssignedDeckStudy, state });
  } else if (state.screen === "sharedStudy") {
    import("./data/store/index.js").then(async ({ getSharedDeckById, getSharedDeckProgress, saveSharedDeckProgress, upsertCardAttemptStat }) => {
      const sharedDeck = await getSharedDeckById(state.sharedDeckId);
      if (!sharedDeck) {
        state.sharedDeckId = null;
        state.screen = "classes";
        save();
        renderAll();
        return;
      }

      let progress = await getSharedDeckProgress(state.sharedDeckId, currentUser.id);
      if (!progress) {
        const initialCards = sharedDeck.deckSnapshot.cards.map(c => ({
          ...c,
          stage: 1,
          stage3Mastered: false,
          lastSeenAt: null,
        }));
        await saveSharedDeckProgress(state.sharedDeckId, currentUser.id, initialCards);
        progress = { cards: initialCards };
      }

      const sharedState = {
        screen: "sharedStudy",
        cards: progress.cards,
        sharedDeckId: state.sharedDeckId,
      };

      const sharedSave = async () => {
        await saveSharedDeckProgress(state.sharedDeckId, currentUser.id, sharedState.cards);
        updateStageSnapshot({ cards: sharedState.cards });
      };

      const sharedSetScreen = (screen) => {
        if (screen === "create" || screen === "classes") {
          state.sharedDeckId = null;
          state.screen = "classes";
        } else {
          state.screen = screen;
        }
        save();
      };

      const sharedFeedback = (payload) => {
        // Per-card cumulative tracking stored directly on the card object
        const answeredCard = sharedState.cards.find(c => c.id === payload.current?.id);
        if (answeredCard) {
          answeredCard.attempts = (answeredCard.attempts || 0) + 1;
          if (payload.correct) answeredCard.correctCount = (answeredCard.correctCount || 0) + 1;
          // Write absolute totals to the dedicated per-card stats table (fire-and-forget)
          if (answeredCard.id && sharedState.sharedDeckId && currentUser?.id) {
            upsertCardAttemptStat({
              sharedDeckId:  sharedState.sharedDeckId,
              studentId:     currentUser.id,
              cardId:        answeredCard.id,
              attempts:      answeredCard.attempts,
              correctCount:  answeredCard.correctCount || 0,
              incorrectCount: answeredCard.attempts - (answeredCard.correctCount || 0),
            });
          }
        }
        recordAnswer({ isCorrect: payload.correct, card: payload.current });
        renderFeedback(appEl, sharedState, payload, {
          renderProgressBar,
          save: sharedSave,
          setScreen: sharedSetScreen,
          renderAll,
          next: () => {
            sharedSave().then(() => {
              updateStageSnapshot({ cards: sharedState.cards });
              renderAll();
            });
          },
        });
      };

      renderStudyScreen(appEl, sharedState, {
        renderProgressBar,
        save: sharedSave,
        setScreen: sharedSetScreen,
        renderAll,
        feedback: sharedFeedback,
        onAnswerStats: ({ correct, current }) => {
          const answeredCard = sharedState.cards.find(c => c.id === current?.id);
          if (!answeredCard) return;
          answeredCard.attempts = (answeredCard.attempts || 0) + 1;
          if (correct) answeredCard.correctCount = (answeredCard.correctCount || 0) + 1;
          if (answeredCard.id && sharedState.sharedDeckId && currentUser?.id) {
            upsertCardAttemptStat({
              sharedDeckId:   sharedState.sharedDeckId,
              studentId:      currentUser.id,
              cardId:         answeredCard.id,
              attempts:       answeredCard.attempts,
              correctCount:   answeredCard.correctCount || 0,
              incorrectCount: answeredCard.attempts - (answeredCard.correctCount || 0),
            });
          }
        },
      });
    });
  } else if (state.screen === "study") {
    const studySave = () => {
      save();
      if (state && state.cards) {
        updateStageSnapshot({ cards: state.cards });
      }
    };
    renderStudyScreen(appEl, state, {
      renderProgressBar,
      save: studySave,
      setScreen,
      renderAll,
      feedback,
    });
  }

  previousScreen = state.screen;
}

// Initialize on load
(async () => {
  await initAuth();
  await loadUserState();
  await renderAll();
})();
