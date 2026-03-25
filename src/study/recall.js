import { escapeHtml } from "../utils.js";
import { gradeLongAnswer } from "../aiGrader.js";
import { recordAnswer } from "../analytics/analyticsStore.js";

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

  function resetStudyProgress() {
    state.cards = (state.cards || []).map((c) => ({
      ...c,
      stage: 1,
      stage3Mastered: false,
    }));
    state.largeDeckBacklog = undefined; // force re-init on next session
  }

  function render() {
    const frontHtml = escapeHtml(current.front ?? "");

    const inputBg =
      step === "result" && lastResult
        ? lastResult.isCorrect
          ? "#bbf7d0"
          : "#fecaca"
        : "#ffffff";

    const showReview = step === "result" && lastResult;
    const isWrong = showReview && !lastResult.isCorrect;

    const topLabel = isWrong ? "Your Answer:" : "Type the Correct Answer:";

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

        <p class="help" style="text-align:left; margin-bottom:10px;">
          ${topLabel}
        </p>

        <textarea
          id="recallInput"
          placeholder="Answer here..."
          style="
            width:100%;
            min-height:90px;
            margin-top:0px;

            background:${inputBg} !important;
            background-color:${inputBg} !important;

            opacity:1 !important;
            -webkit-text-fill-color: inherit;
          "
          ${step === "result" ? "readonly" : ""}
        ></textarea>

    ${
      isWrong
        ? `
              <div style="margin-top:14px;">
                <p class="help" style="text-align:left; margin:0 0 6px;">
                  Correct Answer:
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
                ${
                  lastResult.aiFeedback
                    ? `
                      <p class="help" style="text-align:left; margin:14px 0 6px;">
                        AI Feedback:
                      </p>
                      <div
                        class="card"
                        style="
                          border-radius:10px;
                          padding:12px;
                        "
                      >
                        <pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${escapeHtml(
                          lastResult.aiFeedback
                        )}</pre>
                      </div>
                    `
                    : ""
                }
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

    if (lastResult?.userAnswer != null) {
      inputEl.value = lastResult.userAnswer;
    }

    appEl.querySelector("#backToCreate").addEventListener("click", () => {
      resetStudyProgress();
      deps.setScreen("create");
      deps.save();
      deps.renderAll();
    });

    if (step === "answer") {
      appEl.querySelector("#submitRecall").addEventListener("click", async () => {
        const userAnswer = inputEl.value.trim();
        if (!userAnswer) {
          alert("Please enter an answer.");
          return;
        }

        const c = state.cards.find((x) => x.id === current.id);
        if (!c) return;

        const correctAnswer = String(current.back ?? "").trim();
        let isCorrect;
        let aiFeedback = null;

        const _mode = c.gradingMode ?? (c.longAnswer ? "concept" : "exact");
        if (_mode === "concept") {
          // Use AI grader for concept match cards
          const graderResult = await gradeLongAnswer({
            promptFront: current.front,
            expectedAnswer: correctAnswer,
            userAnswer: userAnswer,
            cardStage: c.stage,
          });
          isCorrect = graderResult.correct;
          aiFeedback = graderResult.feedback;
        } else {
          // Use exact match for normal cards
          isCorrect = normalize(userAnswer) === normalize(correctAnswer);
        }

        const prevStage = c.stage;
        applyStageRules(c, isCorrect);

        // Large-deck mode: refill the pool when a card graduates Stage 2 → Stage 3.
        if (prevStage === 2 && c.stage === 3 && state.largeDeckBacklog?.length) {
          state.largeDeckBacklog.shift();
        }

        deps.save();

        // Record answer in analytics (use grader.correct for concept match cards)
        recordAnswer({ isCorrect });
        deps.onAnswerStats?.({ correct: isCorrect, current });

        lastResult = { isCorrect, userAnswer, correctAnswer, aiFeedback };
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
