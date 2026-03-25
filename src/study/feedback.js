import { escapeHtml } from "../utils.js";

export function renderFeedback(appEl, state, { correct, current, userAnswer }, deps) {
  const progress = deps.renderProgressBar(state);

  const safeFront = escapeHtml(current.front ?? "");
  const safeCorrect = escapeHtml(current.back ?? "");
  const safeUser = escapeHtml(userAnswer ?? "");

  function resetStudyProgress() {
    state.cards = (state.cards || []).map((c) => ({
      ...c,
      stage: 1,
      stage3Mastered: false,
    }));
  }

  appEl.innerHTML = `
    <section class="card">
      ${progress}

      <h2 style="margin:12px 0 10px; text-align:center;">
        ${correct ? "✅ Correct" : "❌ Incorrect"}
      </h2>

      <div
        style="
          font-size:1.6rem;
          font-weight:700;
          text-align:center;
          margin:12px 0 18px;
        "
      >
        ${safeFront}
      </div>

      <p class="help" style="text-align:left; margin-bottom:6px;">
        Your Answer:
      </p>
      <div class="card" style="border-radius:10px; padding:12px;">
        <pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${safeUser}</pre>
      </div>

      <p class="help" style="text-align:left; margin:14px 0 6px;">
        Correct Answer:
      </p>
      <div class="card" style="border-radius:10px; padding:12px;">
        <pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${safeCorrect}</pre>
      </div>

      <div class="btns" style="margin-top:18px; justify-content:space-between;">
        <button class="primary" id="nextBtn">Next</button>
        <button class="danger" id="backToDecks">Back to Decks</button>
      </div>
    </section>
  `;

  appEl.querySelector("#nextBtn").addEventListener("click", () => deps.next());
  appEl.querySelector("#backToDecks").addEventListener("click", () => {
    resetStudyProgress();
    deps.setScreen("decks");
    deps.save();
    deps.renderAll();
  });
}
