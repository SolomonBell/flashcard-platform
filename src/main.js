import { loadState, saveState, newState, resetAll } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { getCurrentUser, clearSession } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";

let state = loadState() ?? newState();

const appEl = document.getElementById("app");

function setScreen(screen) {
  state.screen = screen;
}

function save() {
  saveState(state);
}

function setStateAndRender(nextState) {
  state = nextState;
  save();
  renderAll();
}

function feedback(payload) {
  renderFeedback(appEl, state, payload, {
    renderProgressBar,
    save,
    setScreen,
    renderAll,
    next: () => renderAll(),
  });
}

function renderLogoutButton() {
  const header = document.querySelector(".header");
  if (!header) return;
  
  // Remove existing logout button if present
  const existingLogout = header.querySelector("#logoutBtn");
  if (existingLogout) {
    existingLogout.remove();
  }
  
  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logoutBtn";
  logoutBtn.textContent = "Log out";
  logoutBtn.className = "small";
  logoutBtn.style.cssText = "margin-top:8px; padding:6px 10px; font-size:12px;";
  logoutBtn.addEventListener("click", () => {
    clearSession();
    renderAll();
  });
  
  header.appendChild(logoutBtn);
}

function renderAll() {
  const currentUser = getCurrentUser();
  
  // If not logged in, show auth screen
  if (!currentUser) {
    // Remove logout button if present
    const existingLogout = document.querySelector("#logoutBtn");
    if (existingLogout) {
      existingLogout.remove();
    }
    
    renderAuthScreen(appEl, () => {
      renderAll();
    });
    return;
  }
  
  // User is logged in - show app and logout button
  renderLogoutButton();
  
  if (state.screen === "create") {
    renderCreateScreen(appEl, state, {
      save,
      setScreen,
      renderAll,
      resetAll: () => resetAll(setStateAndRender),
    });
  } else {
    renderStudyScreen(appEl, state, {
      renderProgressBar,
      save,
      setScreen,
      renderAll,
      feedback,
    });
  }
}

renderAll();
