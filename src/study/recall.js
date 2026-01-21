import { escapeHtml } from "../utils.js";

export function renderRecall(appEl, state, current, deps) {
  const progress = deps.renderProgressBar(state);

  let step = "answer"; // "answer" -> "result"
  let lastResult = null; // { isCorrect, userAnswer, correctAnswer }

  function normalize(s) {
    return String(s ?? "").trim().toLowerCase();
  }

  function applyStageRules(card, isCorrect) {
    if (card.stage === 2) {
      if (isCorrect) {
        card.stage = 3;
        card.stage3Mastered = false;
      } else {
        card.stage = 1;
        card.stage3Mastered = false;
      }
    } else if (card.stage === 3) {
      if (isCorrect) {
        card.stage3Mastered = true;
      } else {
        card.stage = 2;
        card.stage3Mastered = false;
      }
    }
  }

  function render() {
    const frontHtml = escapeHtml(current.front ?? "");

    const inputBg =
      step === "result" && lastResult
        ? lastResult.isCorrect
          ? "#bbf7d0" // light green
          : "#fecaca" // light red
        : "#ffffff";

    const showCorrect = step === "result" && lastResult && !lastResult.isCorrect;

    appEl.innerHTML = `
      <section class="card">
        ${progress}

        <h2 style="margin:12px 0 10px; text-align:center;">Recall</h2>

        <div
          style="
            font-size:1.6rem;
            font-weight:700;
            text-align:center;
            margin:12px 0 16px;
          "
        >
          ${frontHtml}
        </div>

        <textarea
          id="recallInput"
          placeholder="Answer here..."
          style="
            width:100%;
            min-height:90px;
            margin-top:8px;

            /* Force the feedback color to show even if CSS tries to override */
            background:${inputBg} !important;
            background-color:${inputBg} !important;

            /* Prevent browsers from “washing out” readonly styles */
            opacity:1 !important;
            -webkit-text-fill-color: inherit;
          "
          ${step === "result" ? "readonly" : ""}
        ></textarea>

        ${
          showCorrect
            ? `
              <div style="margin-top:14px;">
                <p class="help" style="text-align:left; margin-bottom:10px;">
        Type the Correct Answer:
      </p>
                <div
                  class="card"
                  style="
                    border-radius:10px;
                    padding:12px;
                    background:#bbf7d0;
                  "
                >
                  <pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${escapeHtml(
                    lastResult.correctAnswer
                  )}</pre>
                </div>
              </div>
            `
            : ""
        }

        <div class="btns" style="margin-top:16px;">
          ${
            step === "answer"
              ? `<button class="primary" id="submitRecall">Submit</button>`
              : `<button class="primary" id="nextBtn">Next</button>`
          }
          <button class="danger" id="backToCreate">Back to Create</button>
        </div>
      </section>
    `;

    const inputEl = appEl.querySelector("#recallInput");

    // Preserve typed answer after re-render
    if (lastResult?.userAnswer != null) {
      inputEl.value = lastResult.userAnswer;
    }

    appEl.querySelector("#backToCreate").addEventListener("click", () => {
      deps.setScreen("create");
      deps.save();
      deps.renderAll();
    });

    if (step === "answer") {
      appEl.querySelector("#submitRecall").addEventListener("click", () => {
        const userAnswer = inputEl.value.trim();
        if (!userAnswer) {
          alert("Please enter an answer.");
          return;
        }

        const correctAnswer = String(current.back ?? "").trim();
        const isCorrect = normalize(userAnswer) === normalize(correctAnswer);

        const c = state.cards.find(x => x.id === current.id);
        if (!c) return;

        applyStageRules(c, isCorrect);
        deps.save();

        lastResult = { isCorrect, userAnswer, correctAnswer };
        step = "result";
        render();
      });

      inputEl.focus();
    } else {
      appEl.querySelector("#nextBtn").addEventListener("click", () => {
        deps.renderAll();
      });
    }
  }

  render();
}
