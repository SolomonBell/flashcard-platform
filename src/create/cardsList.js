import { escapeHtml } from "../utils.js";

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
      
      <div style="margin-top:8px;">
        <label style="display:flex; align-items:center; gap:6px; font-size:13px;">
          <input type="checkbox" data-field="longAnswer" ${c.longAnswer ? "checked" : ""} />
          <span>Long Answer (AI graded)</span>
        </label>
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
      // 🚫 no render() here
    });
  });

  // Handle checkbox changes for longAnswer
  rootEl.querySelectorAll("input[data-field='longAnswer']").forEach(el => {
    el.addEventListener("change", (e) => {
      const row = e.target.closest(".cardRow");
      const id = row.getAttribute("data-id");
      const card = state.cards.find(x => x.id === id);
      if (!card) return;

      card.longAnswer = e.target.checked;
      save();
      // 🚫 no render() here
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
