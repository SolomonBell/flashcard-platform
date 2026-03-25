import { escapeHtml } from "../utils.js";
import { getValidCards } from "./create.js";

function _gradingMode(card) {
  if (card.gradingMode) return card.gradingMode;
  return card.longAnswer ? "concept" : "exact";
}

export function renderCardsList(state) {
  return state.cards.map((c, idx) => `
    <div class="cardRow" data-id="${c.id}">
      <div class="cardRowHeader">
        <div class="idx">Card ${idx + 1}</div>
        <div class="btns" style="margin-top:0;">
          <button class="danger" data-action="delete">Delete</button>
        </div>
      </div>

      <div class="cardRowGrid">
        <div>
          <label class="label" style="display:block; text-align:center;">Question</label>
          <textarea data-field="front" placeholder="Question">${escapeHtml(c.front)}</textarea>
        </div>

        <div>
          <label class="label" style="display:block; text-align:center;">Answer</label>
          <textarea data-field="back" placeholder="Answer">${escapeHtml(c.back)}</textarea>
        </div>
      </div>
      
      <div style="margin-top:10px; display:flex; justify-content:center;">
        <div class="grading-mode-group" data-id="${c.id}" style="display:inline-flex; border:1px solid var(--border,#e5e7eb); border-radius:8px; overflow:hidden; font-size:12px;">
          <button type="button" class="grading-mode-btn" data-mode="exact" title="Requires the answer to match exactly." style="padding:4px 12px; border:none; background:${_gradingMode(c) === 'exact' ? '#bfdbfe' : 'transparent'}; color:${_gradingMode(c) === 'exact' ? '#1d4ed8' : 'var(--muted,#6b7280)'}; cursor:pointer; pointer-events:auto;">Exact Match</button>
          <button type="button" class="grading-mode-btn" data-mode="concept" title="Accepts answers with the same meaning." style="padding:4px 12px; border:none; border-left:1px solid var(--border,#e5e7eb); background:${_gradingMode(c) === 'concept' ? '#bfdbfe' : 'transparent'}; color:${_gradingMode(c) === 'concept' ? '#1d4ed8' : 'var(--muted,#6b7280)'}; cursor:pointer; pointer-events:auto;">Concept Match</button>
        </div>
      </div>
    </div>
  `).join("");
}

export function wireCardsListHandlers(rootEl, state, { save, render, blankCard }) {
  // ✅ Auto-save edits WITHOUT re-rendering (prevents focus loss)
  rootEl.querySelectorAll("textarea[data-field]").forEach(el => {
    el.addEventListener("input", (e) => {
      const row = e.target.closest(".cardRow");
      const id = row.getAttribute("data-id");
      const field = e.target.getAttribute("data-field");
      const card = state.cards.find(x => x.id === id);
      if (!card) return;

      card[field] = e.target.value;
      save();
      // 🚫 no render() here — but do update the Start Studying button state
      const startBtn = document.querySelector("#startStudy");
      if (startBtn) startBtn.disabled = getValidCards(state).length < 1;
    });
  });

  // Handle grading mode button group
  rootEl.querySelectorAll(".grading-mode-group").forEach(group => {
    group.addEventListener("click", (e) => {
      const btn = e.target.closest(".grading-mode-btn");
      if (!btn) return;
      const id = group.getAttribute("data-id");
      const card = state.cards.find(x => x.id === id);
      if (!card) return;

      const mode = btn.getAttribute("data-mode");
      card.gradingMode = mode;
      card.longAnswer = mode === "concept";

      // Update button styles without full re-render
      group.querySelectorAll(".grading-mode-btn").forEach(b => {
        const isActive = b.getAttribute("data-mode") === mode;
        b.style.background = isActive ? "#bfdbfe" : "transparent";
        b.style.color = isActive ? "#1d4ed8" : "var(--muted,#6b7280)";
      });

      save();
    });
  });

  // Delete card (this DOES re-render, which is fine)
  rootEl.querySelectorAll('button[data-action="delete"]').forEach(btn => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest(".cardRow");
      const id = row.getAttribute("data-id");
      const card = state.cards.find(x => x.id === id);
      if (!card) return;

      if (!confirm("Delete this card?")) return;

      state.cards = state.cards.filter(x => x.id !== id);
      if (state.cards.length === 0) state.cards.push(blankCard());

      save();
      render(); // OK here
    });
  });
}
