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
          <button type="button" class="grading-mode-btn" data-mode="exact" data-tooltip="Requires the answer to match exactly." style="padding:4px 12px; border:none; background:${_gradingMode(c) === 'exact' ? '#bfdbfe' : 'transparent'}; color:${_gradingMode(c) === 'exact' ? '#1d4ed8' : 'var(--muted,#6b7280)'}; cursor:pointer;">Exact Match</button>
          <button type="button" class="grading-mode-btn" data-mode="concept" data-tooltip="Accepts answers with the same meaning." style="padding:4px 12px; border:none; border-left:1px solid var(--border,#e5e7eb); background:${_gradingMode(c) === 'concept' ? '#bfdbfe' : 'transparent'}; color:${_gradingMode(c) === 'concept' ? '#1d4ed8' : 'var(--muted,#6b7280)'}; cursor:pointer;">Concept Match</button>
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

  // Custom tooltip for grading mode buttons (faster than native title)
  let _tooltipEl = null;
  let _tooltipTimer = null;

  function _showTooltip(btn) {
    _tooltipEl = document.createElement("div");
    _tooltipEl.textContent = btn.getAttribute("data-tooltip");
    _tooltipEl.style.cssText =
      "position:fixed; z-index:9999; pointer-events:none;" +
      "background:#1f2937; color:#fff; font-size:11px; line-height:1.4;" +
      "padding:4px 8px; border-radius:5px; white-space:nowrap;" +
      "box-shadow:0 2px 6px rgba(0,0,0,0.25);";
    document.body.appendChild(_tooltipEl);

    const r = btn.getBoundingClientRect();
    const tw = _tooltipEl.offsetWidth;
    const left = r.left + r.width / 2 - tw / 2;
    const top  = r.bottom + 6;
    _tooltipEl.style.left = Math.max(4, left) + "px";
    _tooltipEl.style.top  = top + "px";
  }

  function _hideTooltip() {
    clearTimeout(_tooltipTimer);
    _tooltipTimer = null;
    if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
  }

  rootEl.querySelectorAll(".grading-mode-btn[data-tooltip]").forEach(btn => {
    btn.addEventListener("mouseenter", () => {
      _tooltipTimer = setTimeout(() => _showTooltip(btn), 90);
    });
    btn.addEventListener("mouseleave", _hideTooltip);
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
