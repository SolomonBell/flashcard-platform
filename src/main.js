import { loadStateForUser, saveStateForUser, newStateForUser, resetAllForUser } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";
import { renderClassesScreen } from "./classes/classes.js";
import { getCurrentUser, clearSession } from "./authStore.js";
import { renderAuthScreen } from "./auth.js";

let state = null;
let currentUserId = null;

const appEl = document.getElementById("app");

function loadUserState() {
  const user = getCurrentUser();
  if (!user) {
    state = null;
    currentUserId = null;
    return;
  }
  
  currentUserId = user.id;
  state = loadStateForUser(currentUserId) ?? newStateForUser();
}

function setScreen(screen) {
  if (!state) return;
  state.screen = screen;
}

function save() {
  if (!state || !currentUserId) return;
  saveStateForUser(currentUserId, state);
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

function renderAll() {
  const currentUser = getCurrentUser();
  
  // If not logged in, show auth screen
  if (!currentUser) {
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
    
    renderAuthScreen(appEl, () => {
      loadUserState();
      renderAll();
    });
    return;
  }
  
  // Check if user changed (switched accounts)
  if (currentUser.id !== currentUserId) {
    loadUserState();
  }
  
  // Ensure state is loaded
  if (!state) {
    loadUserState();
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

// Initialize on load
loadUserState();
renderAll();
