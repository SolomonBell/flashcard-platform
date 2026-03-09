import {
  listDecks, createDeck, getDeck, renameDeck, duplicateDeck, deleteDeck, setActiveDeckId,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

export function renderDecksScreen(appEl, { renderAll, state, currentUserId }) {
  async function render() {
    const decks = await listDecks(currentUserId);

    appEl.innerHTML = `
      <section class="card" style="max-width:520px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Decks</h2>

        <div style="display:flex; gap:8px; margin-top:16px; margin-bottom:16px;">
          <input type="text" id="newDeckTitle" placeholder="Deck name (optional)"
            style="flex:1;" />
          <button type="button" class="primary" id="createDeckBtn">New Deck</button>
        </div>

        <div id="decksList">
          ${decks.length === 0
            ? `<p class="small" style="color:var(--muted); text-align:center; margin-top:8px;">
                No decks yet. Create one above.
               </p>`
            : decks.map(deck => `
              <div style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px;
                          padding:10px 12px; border:1px solid var(--border, #e5e7eb);
                          border-radius:10px; margin-bottom:8px;">
                <span style="font-weight:600; word-break:break-word;">
                  ${escapeHtml(deck.title)}
                </span>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="primary small" style="padding:3px 8px; font-size:0.8rem;"
                    data-open-deck="${escapeHtml(deck.id)}">Open</button>
                  <button type="button" class="small" style="padding:3px 8px; font-size:0.8rem;"
                    data-rename-deck="${escapeHtml(deck.id)}"
                    data-deck-title="${escapeHtml(deck.title)}">Rename</button>
                  <button type="button" class="small" style="padding:3px 8px; font-size:0.8rem;"
                    data-duplicate-deck="${escapeHtml(deck.id)}">Duplicate</button>
                  <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                    data-delete-deck="${escapeHtml(deck.id)}"
                    data-deck-title="${escapeHtml(deck.title)}">Delete</button>
                </div>
              </div>
            `).join("")}
        </div>
      </section>
    `;

    appEl.querySelector("#createDeckBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#newDeckTitle");
      const title = input?.value?.trim() || "New Deck";
      const newId = await createDeck(currentUserId, title);
      if (input) input.value = "";
      await openDeck(newId);
    });

    // Enter key in title input also creates deck
    appEl.querySelector("#newDeckTitle")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") appEl.querySelector("#createDeckBtn")?.click();
    });

    appEl.querySelector("#decksList")?.addEventListener("click", async (e) => {
      const openId = e.target?.getAttribute("data-open-deck");
      if (openId) { await openDeck(openId); return; }

      const renameId = e.target?.getAttribute("data-rename-deck");
      if (renameId) {
        const current = e.target?.getAttribute("data-deck-title") || "";
        const newTitle = prompt("New deck name:", current);
        if (newTitle?.trim()) { await renameDeck(currentUserId, renameId, newTitle.trim()); await render(); }
        return;
      }

      const dupId = e.target?.getAttribute("data-duplicate-deck");
      if (dupId) { await duplicateDeck(currentUserId, dupId); await render(); return; }

      const deleteId = e.target?.getAttribute("data-delete-deck");
      if (deleteId) {
        const title = e.target?.getAttribute("data-deck-title") || "this deck";
        if (confirm(`Delete "${title}"? This cannot be undone.`)) {
          await deleteDeck(currentUserId, deleteId);
          await render();
        }
        return;
      }
    });
  }

  async function openDeck(deckId) {
    await setActiveDeckId(currentUserId, deckId);
    const deck = await getDeck(currentUserId, deckId);
    state.screen = "create";
    state.deckId = deckId;
    state.deckTitle = deck?.title || "My Deck";
    state.cards = deck?.cards || [];
    state.lastShownCardId = deck?.lastShownCardId || null;
    renderAll();
  }

  render();
}
