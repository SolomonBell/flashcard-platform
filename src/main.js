import { loadStateForUser, saveStateForUser, newStateForUser, resetAllForUser } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { renderClassesScreen } from "./classes/classes.js";
import { getCurrentUser, clearSession } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";
import { startSession, endSession, recordAnswer, updateStageSnapshot } from "./analytics/analyticsStore.js";

let state = null;
let currentUserId = null;

const appEl = document.getElementById("app");

async function loadUserState() {
  const user = getCurrentUser();
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
  if (!state || !currentUserId) return undefined;
  const updated = await saveStateForUser(currentUserId, state);
  if (updated) state = updated;
  return updated;
}

async function setStateAndRender(nextState) {
  state = nextState;
  await save();
  renderAll();
}

function feedback(payload) {
  // Record answer in analytics (pass card if available)
  recordAnswer({ isCorrect: payload.correct, card: payload.current });
  
  renderFeedback(appEl, state, payload, {
    renderProgressBar,
    save,
    setScreen,
    renderAll,
    next: () => {
      // Update stage snapshot after answer
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
  
  // Remove existing navigation elements if present
  const existingLogout = header.querySelector("#logoutBtn");
  if (existingLogout) {
    existingLogout.remove();
  }
  const existingNav = header.querySelector("#navButtons");
  if (existingNav) {
    existingNav.remove();
  }
  
  // Create navigation container
  const navContainer = document.createElement("div");
  navContainer.id = "navButtons";
  navContainer.style.cssText = "margin-top:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;";
  
  // Add Classes button for teachers and students
  if (currentUser) {
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
  }
  
  // Add logout button
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
  
  header.appendChild(navContainer);
}

let previousScreen = null;

async function renderAll() {
  const currentUser = getCurrentUser();
  
  // If not logged in, show auth screen
  if (!currentUser) {
    // End any active session
    endSession();
    
    // Remove navigation elements if present
    const existingLogout = document.querySelector("#logoutBtn");
    if (existingLogout) {
      existingLogout.remove();
    }
    const existingNav = document.querySelector("#navButtons");
    if (existingNav) {
      existingNav.remove();
    }
    
    state = null;
    currentUserId = null;
    previousScreen = null;
    
    renderAuthScreen(appEl, async () => {
      await loadUserState();
      renderAll();
    });
    return;
  }
  
  // Check if user changed (switched accounts)
  if (currentUser.id !== currentUserId) {
    endSession();
    await loadUserState();
    previousScreen = null;
  }
  
  // Ensure state is loaded
  if (!state) {
    await loadUserState();
  }
  
  // Handle session lifecycle: end session when leaving study screens
  if (previousScreen === "study" || previousScreen === "sharedStudy") {
    if (state.screen !== "study" && state.screen !== "sharedStudy") {
      endSession();
    }
  }
  
  // Start session when entering study screens
  if ((state.screen === "study" || state.screen === "sharedStudy") && 
      previousScreen !== "study" && previousScreen !== "sharedStudy") {
    if (state.screen === "study") {
      // Personal deck
      startSession({
        userId: currentUser.id,
        deckContext: "personal",
        deckId: state.deckId || `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
      // Ensure deckId is saved
      if (!state.deckId) {
        state.deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        save();
      }
    } else if (state.screen === "sharedStudy") {
      // Shared deck
      startSession({
        userId: currentUser.id,
        deckContext: "shared",
        deckId: state.sharedDeckId,
      });
    }
  }
  
  // User is logged in - show navigation
  renderNavigation(currentUser);
  
  if (state.screen === "create") {
    renderCreateScreen(appEl, state, {
      save,
      setScreen,
      renderAll,
      resetAll: () => resetAllForUser(currentUserId, setStateAndRender),
    });
  } else if (state.screen === "classes") {
    renderClassesScreen(appEl, {
      currentUser,
      state,
      setScreen,
      save,
      renderAll,
    });
  } else if (state.screen === "sharedStudy") {
    // Handle shared deck study
    import("./classes/sharedDecksStore.js").then(({ getSharedDeckById, getSharedDeckProgress, saveSharedDeckProgress }) => {
      const sharedDeck = getSharedDeckById(state.sharedDeckId);
      if (!sharedDeck) {
        // Shared deck not found, go back to classes
        state.sharedDeckId = null;
        state.screen = "classes";
        save();
        renderAll();
        return;
      }

      // Load or create student progress
      let progress = getSharedDeckProgress(state.sharedDeckId, currentUser.id);
      if (!progress) {
        // Create initial progress from shared deck snapshot
        const initialCards = sharedDeck.deckSnapshot.cards.map(c => ({
          ...c,
          stage: 1,
          stage3Mastered: false,
          lastSeenAt: null,
        }));
        saveSharedDeckProgress(state.sharedDeckId, currentUser.id, initialCards);
        progress = { cards: initialCards };
      }

      // Create a temporary in-memory state for studying shared deck
      const sharedState = {
        screen: "sharedStudy",
        cards: progress.cards,
        sharedDeckId: state.sharedDeckId,
      };

      // Custom save function for shared deck progress
      const sharedSave = () => {
        saveSharedDeckProgress(state.sharedDeckId, currentUser.id, sharedState.cards);
        // Update stage snapshot after save
        updateStageSnapshot({ cards: sharedState.cards });
      };

      // Custom setScreen that handles going back to classes
      const sharedSetScreen = (screen) => {
        if (screen === "create" || screen === "classes") {
          state.sharedDeckId = null;
          state.screen = "classes";
        } else {
          state.screen = screen;
        }
        save();
      };

      // Custom feedback wrapper for shared study
      const sharedFeedback = (payload) => {
        recordAnswer({ isCorrect: payload.correct, card: payload.current });
        renderFeedback(appEl, sharedState, payload, {
          renderProgressBar,
          save: sharedSave,
          setScreen: sharedSetScreen,
          renderAll,
          next: () => {
            updateStageSnapshot({ cards: sharedState.cards });
            renderAll();
          },
        });
      };

      renderStudyScreen(appEl, sharedState, {
        renderProgressBar,
        save: sharedSave,
        setScreen: sharedSetScreen,
        renderAll,
        feedback: sharedFeedback,
      });
    });
  } else if (state.screen === "study") {
    // Wrap save to update stage snapshot
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
  
  // Update previous screen for next render
  previousScreen = state.screen;
}

// Account button (Supabase auth panel) – always visible in header
(function setupAccountButton() {
  const header = document.querySelector(".header");
  if (!header || document.getElementById("accountBtn")) return;
  const btn = document.createElement("button");
  btn.id = "accountBtn";
  btn.type = "button";
  btn.className = "small auth-account-btn";
  btn.textContent = "Account";
  btn.addEventListener("click", () => {
    import("/src/auth/authUI.js").then((m) => m.openAuthPanel());
  });
  header.appendChild(btn);
})();

// Initialize on load (async so state is ready before first render)
(async () => {
  await loadUserState();
  await renderAll();
})();

// If URL indicates Supabase recovery/password-reset redirect, open auth panel in "Set new password" mode
import("/src/auth/auth.js")
  .then((m) => m.maybeHandleAuthRedirect())
  .catch(() => {});

// Development: log Supabase connection status after load
import("./supabaseClient.js")
  .then((m) => m.getSupabase())
  .then((client) => console.log(client ? "Supabase connected" : "Supabase NOT configured"))
  .catch(() => console.log("Supabase NOT configured"));
