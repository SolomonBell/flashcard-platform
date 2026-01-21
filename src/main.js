import { loadState, saveState, newState, resetAll } from "./state.js";
import { renderProgressBar } from "./progress.js";
import { renderCreateScreen } from "./create/create.js";
import { renderStudyScreen } from "./study/study.js";
import { renderFeedback } from "./study/feedback.js";

let state = loadState() ?? newState();

const appEl = document.getElementById("app");



function startHeaderClock() {
  const el = document.getElementById("clock");
  if (!el) return;

  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const tick = () => {
    el.textContent = fmt.format(new Date());
  };

  tick();
  setInterval(tick, 1000);
}

startHeaderClock();
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

function renderAll() {
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
