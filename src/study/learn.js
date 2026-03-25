import { buildMCOptions } from "./study.js";
import { escapeHtml } from "../utils.js";
import { recordAnswer } from "../analytics/analyticsStore.js";

export function renderLearn(appEl, state, current, deps) {
  const progress = deps.renderProgressBar(state);
  const options = buildMCOptions(current, state.cards);

  appEl.innerHTML = `
    <section class="card">
      ${progress}

      <h2 style="margin:12px 0 10px; text-align:center;">Learn</h2>

      <div
        style="
          font-size:1.6rem;
          font-weight:700;
          text-align:center;
          margin:12px 0 18px;
        "
      >
        ${escapeHtml(current.front ?? "")}
      </div>

      <p class="help" style="text-align:left; margin-bottom:10px;">
        Choose the Correct Answer:
      </p>

      <div id="mcWrap" style="display:grid; gap:10px;">
        ${options
          .map(
            (opt, i) => `
          <button class="mcOpt" data-idx="${i}">
            ${opt.text}
          </button>
        `
          )
          .join("")}
      </div>

      <div class="btns" style="margin-top:16px; justify-content:space-between;">
        <button class="primary" id="nextBtn" disabled>Next</button>
        <button class="danger" id="backToDecks">Back to Decks</button>
      </div>
    </section>
  `;

  const nextBtn = appEl.querySelector("#nextBtn");

  function setNextEnabled(enabled) {
    if (!nextBtn) return;
    nextBtn.disabled = !enabled;
  }

  function cleanupKeyHandler() {
    if (window.__learnKeyHandler) {
      document.removeEventListener("keydown", window.__learnKeyHandler);
      window.__learnKeyHandler = null;
    }
  }

  function resetStudyProgress() {
    // Reset all progress so Create edits always start fresh
    state.cards = (state.cards || []).map((c) => ({
      ...c,
      stage: 1,
      stage3Mastered: false,
    }));
    state.largeDeckBacklog = undefined; // force re-init on next session
  }

  function advance() {
    cleanupKeyHandler();
    deps.renderAll();
  }

  // --- Navigation
  appEl.querySelector("#backToDecks").addEventListener("click", () => {
    cleanupKeyHandler();
    resetStudyProgress();
    deps.setScreen("decks");
    deps.save();
    deps.renderAll();
  });

  nextBtn.addEventListener("click", () => {
    if (step === "ready") advance();
  });

  const mcWrap = appEl.querySelector("#mcWrap");
  const buttons = Array.from(appEl.querySelectorAll(".mcOpt"));

  let step = "answer";
  setNextEnabled(false);

  function revealCorrect() {
    buttons.forEach((b, i) => {
      if (options[i].isCorrect) b.style.background = "#bbf7d0";
    });
  }

  function answerWithIndex(idx) {
    if (step !== "answer") return;

    const btn = buttons[idx];
    if (!btn) return;

    step = "revealing";

    const choice = options[idx];

    if (choice.isCorrect) {
      btn.style.background = "#bbf7d0";
    } else {
      btn.style.background = "#fecaca";
    }

    const c = state.cards.find((x) => x.id === current.id);
    if (!c) return;

    if (choice.isCorrect) {
      c.stage = 2;
    }

    deps.save();
    recordAnswer({ isCorrect: choice.isCorrect });
    deps.onAnswerStats?.({ correct: choice.isCorrect, current });

    setTimeout(() => {
      revealCorrect();
      step = "ready";
      setNextEnabled(true);
    }, 250);
  }

  mcWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".mcOpt");
    if (!btn) return;

    const idx = Number(btn.getAttribute("data-idx"));

    if (step === "ready") {
      advance();
      return;
    }

    answerWithIndex(idx);
  });

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;

    if (step === "ready" && (k === "1" || k === "2" || k === "3" || k === "4")) {
      e.preventDefault();
      advance();
      return;
    }

    if (step !== "answer") return;

    if (k === "1" || k === "2" || k === "3" || k === "4") {
      e.preventDefault();
      const idx = Number(k) - 1;
      if (idx < buttons.length) answerWithIndex(idx);
    }
  }

  cleanupKeyHandler();
  window.__learnKeyHandler = onKeyDown;
  document.addEventListener("keydown", onKeyDown);
}
