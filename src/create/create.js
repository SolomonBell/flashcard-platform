import { uid, escapeHtml } from "../utils.js";
import { renderCardsList, wireCardsListHandlers } from "./cardsList.js";

export function blankCard() {
  return {
    id: uid(),
    front: "",
    back: "",
    stage: 1,
    createdAt: Date.now(),
    lastSeenAt: null,
    stage3Mastered: false,
    longAnswer: false,
    gradingMode: "exact",
  };
}

export function getValidCards(state) {
  return state.cards.filter(c => c.front.trim() && c.back.trim());
}

export function ensureAtLeastOneCard(state, save) {
  if (state.cards.length === 0) {
    state.cards.push(blankCard());
    save();
  }
}

export function renderCreateScreen(appEl, state, { save, setScreen, renderAll, resetAll }) {
  ensureAtLeastOneCard(state, save);

  const validCount = getValidCards(state).length;
  const totalCount = state.cards.length;
  const deckTitle = state.deckTitle || "My Deck";

  appEl.innerHTML = `
    <section class="card">
      <h2 style="margin:0; text-align:center;">Create Your Deck</h2>

      <!-- Deck name input -->
      <div style="display:flex; align-items:center; gap:8px; margin-top:14px;">
        <label class="label" for="deckTitleInput" style="margin:0; white-space:nowrap;">
          Deck Name:
        </label>
        <input type="text" id="deckTitleInput"
          value="${escapeHtml(deckTitle)}"
          placeholder="Deck name"
          style="flex:1;" />
      </div>

      <!-- Total Cards + Reset row -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
        <button
          id="totalCardsBtn"
          type="button"
          style="
            border:2px solid #555;
            border-radius:12px;
            padding:8px 12px;
            background:#fff;
            cursor:pointer;
            font-weight:700;
          "
          title="Click to set deck size"
        >
          Total Cards: ${totalCount}
        </button>

        <button class="danger" id="resetAll">Reset</button>
      </div>

      <div id="cardsList" style="margin-top:12px;"></div>

      <!-- Bottom action row -->
      <div class="btns" style="margin-top:16px; justify-content:space-between;">
        <button class="primary" id="startStudy" ${validCount < 1 ? "disabled" : ""}>
          Start Studying
        </button>
        <button class="primary" id="addCardBottom">
          Add Card
        </button>
      </div>
    </section>
  `;

  // Deck title: update on blur or Enter
  const titleInput = appEl.querySelector("#deckTitleInput");
  function saveDeckTitle() {
    const newTitle = titleInput.value.trim();
    if (newTitle && newTitle !== state.deckTitle) {
      state.deckTitle = newTitle;
      save();
    }
  }
  titleInput.addEventListener("blur", saveDeckTitle);
  titleInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { titleInput.blur(); } });

  appEl.querySelector("#resetAll").addEventListener("click", () => {
    if (confirm("Clear all cards in this deck? This cannot be undone.")) resetAll();
  });

  appEl.querySelector("#startStudy").addEventListener("click", () => {
    const valid = getValidCards(state);
    if (valid.length < 1) {
      alert("Please fill in at least 1 card (Question and Answer).");
      return;
    }

    state.cards = valid.map(c => ({
      ...c,
      front: c.front.trim(),
      back: c.back.trim(),
      stage: [1, 2, 3].includes(c.stage) ? c.stage : 1,
      stage3Mastered: Boolean(c.stage3Mastered),
    }));

    save();
    setScreen("study");
    renderAll();
  });

  function addCardAndScrollToBottom() {
    const newC = blankCard();
    state.cards.push(newC);
    save();
    renderAll();

    requestAnimationFrame(() => {
      const el = document.querySelector(`.cardRow[data-id="${newC.id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "end" });
      el?.querySelector('textarea[data-field="front"]')?.focus();
    });
  }

  appEl.querySelector("#addCardBottom").addEventListener("click", addCardAndScrollToBottom);

  appEl.querySelector("#totalCardsBtn").addEventListener("click", () => {
    const current = state.cards.length;
    const raw = prompt("Enter Total Number of Cards:", String(current));
    if (raw === null) return;

    const desired = Number.parseInt(raw, 10);
    if (!Number.isFinite(desired) || desired < 1) {
      alert("Please enter a whole number of 1 or more.");
      return;
    }

    const capped = Math.min(desired, 500);

    if (capped < current) {
      const removed = current - capped;
      const noun = removed === 1 ? "card" : "cards";
      if (!confirm(`This will remove ${removed} ${noun} from the bottom of the list. Continue?`)) return;
      state.cards = state.cards.slice(0, capped);
      if (state.cards.length === 0) state.cards.push(blankCard());
    } else if (capped > current) {
      state.cards = state.cards.concat(Array.from({ length: capped - current }, () => blankCard()));
    } else {
      return;
    }

    save();
    renderAll();
  });

  // Render list + wire handlers
  const listWrap = appEl.querySelector("#cardsList");
  listWrap.innerHTML = renderCardsList(state);
  wireCardsListHandlers(listWrap, state, { save, render: renderAll, blankCard });
}
