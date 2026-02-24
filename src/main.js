import { loadStateForUser, saveStateForUser, newStateForUser, resetAllForUser } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { renderClassesScreen } from "./classes/classes.js";
import { getCurrentUser, clearSession } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";
import { getSupabase } from "./supabaseClient.js";
import { getUser, signOut, onAuthStateChange } from "./auth/auth.js";
import { renderSupabaseAuthScreen } from "./auth/supabaseAuthScreen.js";
import { startSession, endSession, recordAnswer, updateStageSnapshot } from "./analytics/analyticsStore.js";

let state = null;
let currentUserId = null;

const appEl = document.getElementById("app");

/**
 * Effective user: Supabase user when Supabase is configured, else local (authStore) user.
 */
async function getEffectiveUser() {
  const supabase = await getSupabase();
  if (supabase) {
    const { data } = await getUser();
    return data?.user ?? null;
  }
  return getCurrentUser();
}

async function loadUserState() {
  const user = await getEffectiveUser();
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

function renderNavigation(currentUser, isSupabase) {
  const header = document.querySelector(".header");
  if (!header) return;

  const existingLogout = header.querySelector("#logoutBtn");
  if (existingLogout) existingLogout.remove();
  const existingNav = header.querySelector("#navButtons");
  if (existingNav) existingNav.remove();
  const existingAccount = header.querySelector("#accountBtn");
  if (existingAccount) existingAccount.remove();

  const navContainer = document.createElement("div");
  navContainer.id = "navButtons";
  navContainer.style.cssText = "margin-top:12px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap; align-items:center;";

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

  if (isSupabase && currentUser?.email) {
    const emailSpan = document.createElement("span");
    emailSpan.className = "small";
    emailSpan.style.cssText = "font-size:12px; color:var(--muted, #666);";
    emailSpan.textContent = currentUser.email;
    navContainer.appendChild(emailSpan);
    const accountBtn = document.createElement("button");
    accountBtn.id = "accountBtn";
    accountBtn.type = "button";
    accountBtn.className = "small";
    accountBtn.style.cssText = "padding:6px 10px; font-size:12px;";
    accountBtn.textContent = "Account";
    accountBtn.addEventListener("click", () => {
      import("./auth/authUI.js").then((m) => m.openAuthPanel());
    });
    navContainer.appendChild(accountBtn);
  }

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.textContent = isSupabase ? "Sign out" : "Log out";
  logoutBtn.className = "small";
  logoutBtn.style.cssText = "padding:6px 10px; font-size:12px;";
  logoutBtn.addEventListener("click", async () => {
    if (isSupabase) {
      await signOut();
      await loadUserState();
    } else {
      clearSession();
    }
    renderAll();
  });
  navContainer.appendChild(logoutBtn);

  header.appendChild(navContainer);
}

let previousScreen = null;

async function renderAll() {
  const supabaseConfigured = (await getSupabase()) != null;
  const currentUser = supabaseConfigured ? ((await getUser()).data?.user ?? null) : getCurrentUser();

  if (!currentUser) {
    endSession();
    const existingLogout = document.querySelector("#logoutBtn");
    if (existingLogout) existingLogout.remove();
    const existingNav = document.querySelector("#navButtons");
    if (existingNav) existingNav.remove();
    const existingAccount = document.querySelector("#accountBtn");
    if (existingAccount) existingAccount.remove();
    state = null;
    currentUserId = null;
    previousScreen = null;

    if (supabaseConfigured) {
      const isRecovery = /type=recovery/i.test(location.hash || "") || /#auth=reset/i.test(location.hash || "");
      renderSupabaseAuthScreen(appEl, isRecovery ? { initialView: "setNewPassword" } : {});
    } else {
      renderAuthScreen(appEl, async () => {
        await loadUserState();
        renderAll();
      });
    }
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
  
  renderNavigation(currentUser, supabaseConfigured);
  
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

// Auth state listener: re-render on Supabase sign-in/sign-out
(async () => {
  const supabase = await getSupabase();
  if (supabase) {
    onAuthStateChange(() => {
      renderAll();
    });
  }
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
