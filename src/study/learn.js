import { buildMCOptions } from "./study.js";

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
        ${current.front}
      </div>

      <p class="help" style="text-align:left; margin-bottom:10px;">
        Choose the Correct Answer:
      </p>

      <div id="mcWrap" style="display:grid; gap:10px;">
        ${options.map((opt, i) => `
          <button class="mcOpt" data-idx="${i}">
            ${opt.text}
          </button>
        `).join("")}
      </div>

      <div class="btns" style="margin-top:16px;">
        <button class="danger" id="backToCreate">Back to Create</button>
      </div>
    </section>
  `;

  appEl.querySelector("#backToCreate").addEventListener("click", () => {
    deps.setScreen("create");
    deps.save();
    deps.renderAll();
  });

  const mcWrap = appEl.querySelector("#mcWrap");
  const buttons = Array.from(appEl.querySelectorAll(".mcOpt"));

  // step: "answer" -> first click shows feedback
  // step: "ready"  -> next click advances
  let step = "answer";

  function revealCorrect() {
    buttons.forEach((b, i) => {
      if (options[i].isCorrect) b.style.background = "#bbf7d0"; // light green
    });
  }

  function answerWithIndex(idx) {
    if (step !== "answer") return;
    const btn = buttons[idx];
    if (!btn) return;

    step = "revealing";

    const choice = options[idx];

    // Immediate color on selected
    if (choice.isCorrect) {
      btn.style.background = "#bbf7d0"; // light green
    } else {
      btn.style.background = "#fecaca"; // light red
    }

    // Apply Learn-stage logic immediately
    const c = state.cards.find(x => x.id === current.id);
    if (!c) return;

    if (choice.isCorrect) c.stage = 2; // correct -> Stage 2
    deps.save();

    // Reveal correct after a brief delay, then allow click/keypress to continue
    setTimeout(() => {
      revealCorrect();
      step = "ready";
    }, 300);
  }

  // Click behavior:
  // - first click answers
  // - second click advances
  mcWrap.addEventListener("click", (e) => {
    const btn = e.target.closest(".mcOpt");
    if (!btn) return;

    const idx = Number(btn.getAttribute("data-idx"));

    if (step === "ready") {
      deps.renderAll();
      return;
    }

    answerWithIndex(idx);
  });

  // Keyboard shortcuts: 1–4 select choices (equivalent to clicking)
  function onKeyDown(e) {
    // Don't interfere with browser shortcuts
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const k = e.key;

    // If ready, any of 1-4 should act like clicking again (advance)
    if (step === "ready" && (k === "1" || k === "2" || k === "3" || k === "4")) {
      e.preventDefault();
      deps.renderAll();
      return;
    }

    if (step !== "answer") return;

    if (k === "1" || k === "2" || k === "3" || k === "4") {
      e.preventDefault();
      const idx = Number(k) - 1;
      if (idx < buttons.length) {
        answerWithIndex(idx);
      }
    }
  }

  document.addEventListener("keydown", onKeyDown);

  // Clean up listener when screen changes (prevents stacking listeners)
  // We remove it right before leaving via renderAll / backToCreate naturally because screen rerenders.
  const origRenderAll = deps.renderAll;
  deps.renderAll = () => {
    document.removeEventListener("keydown", onKeyDown);
    origRenderAll();
  };
}
