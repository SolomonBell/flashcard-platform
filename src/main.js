import { loadStateForUser, saveStateForUser, newStateForUser, resetAllForUser } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { renderClassesScreen } from "./classes/classes.js";
import { getCurrentUser, clearSession } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";
import { startSession, endSession, recordAnswer, updateStageSnapshot } from "./analytics/analyticsStore.js";
import { getCurrentAuthUser } from "./authBridge.js";
import { setAuthGetter } from "./dataStore.js";
import * as authSupabase from "./authSupabase.js";

let state = null;
let currentUserId = null;
let currentAuthUser = null;

const appEl = document.getElementById("app");

setAuthGetter(() => currentAuthUser);

async function loadUserState() {
  const user = await getCurrentAuthUser();
  currentAuthUser = user;
  if (!user) {
    state = null;
    currentUserId = null;
    return;
  }
  currentUserId = user.id;
  const useSupabase = await import("./dataStore.js").then(m => m.useSupabase());
  if (useSupabase) {
    const store = await import("./dataStore.js").then(m => m.getDeckStore());
    if (store) {
      const decks = await store.getDecksForUser(user.id);
      if (decks.length) {
        const first = await store.loadDeck(user.id, decks[0].id);
        state = first;
        state.screen = state.screen || "create";
        state.deckId = state.deckId || state.id;
        state.lastShownCardId = state.lastShownCardId ?? null;
      } else {
        state = newStateForUser();
      }
    } else {
      state = loadStateForUser(currentUserId) ?? newStateForUser();
    }
  } else {
    state = loadStateForUser(currentUserId) ?? newStateForUser();
  }
}

function setScreen(screen) {
  if (!state) return;
  state.screen = screen;
}

async function save() {
  if (!state || !currentUserId) return;
  const useSupabase = await import("./dataStore.js").then(m => m.useSupabase());
  if (useSupabase) {
    const store = await import("./dataStore.js").then(m => m.getDeckStore());
    if (store) {
      const payload = { deckId: state.deckId || state.id, id: state.deckId || state.id, title: "My Deck", description: "", cards: state.cards || [] };
      const result = await store.saveDeck(currentUserId, payload);
      if (result?.id) state.deckId = result.id;
    } else saveStateForUser(currentUserId, state);
  } else saveStateForUser(currentUserId, state);
}

function setStateAndRender(nextState) {
  state = nextState;
  save();
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
  logoutBtn.addEventListener("click", async () => {
    const useSupabase = await import("./authBridge.js").then(m => m.useSupabaseAuth());
    if (useSupabase) await authSupabase.signOut();
    else clearSession();
    currentAuthUser = null;
    renderAll();
  });
  navContainer.appendChild(logoutBtn);
  
  header.appendChild(navContainer);
}

let previousScreen = null;

function renderVerifyScreen() {
  appEl.innerHTML = `
    <div style="display:flex; justify-content:center; width:100%;">
      <section class="card" style="max-width:400px; width:100%;">
        <h2 style="margin:0; text-align:center;">Check your email</h2>
        <p style="margin-top:12px; font-size:14px;">Verify your email to continue. We sent a link to <strong>${currentAuthUser?.email || ""}</strong>.</p>
        <div class="btns" style="margin-top:16px;">
          <button type="button" class="primary" id="resendVerify">Resend verification email</button>
          <button type="button" id="signOutVerify">Sign out</button>
        </div>
      </section>
    </div>
  `;
  appEl.querySelector("#resendVerify").addEventListener("click", async () => {
    const r = await authSupabase.resendConfirmationEmail(currentAuthUser?.email || "");
    if (r.success) alert("Sent. Check your inbox."); else alert(r.error || "Failed to resend.");
  });
  appEl.querySelector("#signOutVerify").addEventListener("click", async () => {
    await authSupabase.signOut();
    currentAuthUser = null;
    renderAll();
  });
}

function renderResetPasswordScreen() {
  appEl.innerHTML = `
    <div style="display:flex; justify-content:center; width:100%;">
      <section class="card" style="max-width:400px; width:100%;">
        <h2 style="margin:0; text-align:center;">Set new password</h2>
        <form id="resetPasswordForm" style="margin-top:16px;">
          <label class="label" for="newPassword">New password</label>
          <input type="password" id="newPassword" name="newPassword" required style="margin-bottom:12px;" />
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary">Update password</button>
          </div>
        </form>
      </section>
    </div>
  `;
  appEl.querySelector("#resetPasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = appEl.querySelector("#newPassword").value;
    const r = await authSupabase.updatePassword(newPassword);
    if (r.success) {
      window.location.hash = "";
      loadUserState();
      renderAll();
    } else alert(r.error || "Failed to update password.");
  });
}

async function renderAll() {
  const currentUser = await getCurrentAuthUser();
  currentAuthUser = currentUser;

  // Reset password flow (Supabase redirect with #reset-password)
  if (window.location.hash === "#reset-password" || window.location.hash === "#/reset-password") {
    renderResetPasswordScreen();
    return;
  }

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

  // Supabase: email not confirmed — show verify screen
  if (currentUser.emailConfirmed === false) {
    renderNavigation(currentUser);
    renderVerifyScreen();
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
      currentUserId,
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
        lastShownCardId: null,
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

// Initialize on load
(async () => {
  await loadUserState();
  renderAll();
})();
