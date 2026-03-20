import {
  listDecks, createDeck, getDeck, renameDeck, duplicateDeck, deleteDeck, setActiveDeckId,
} from "../data/store/index.js";
import { escapeHtml, uid } from "../utils.js";

export function renderDecksScreen(appEl, { renderAll, save, state, currentUserId }) {
  async function render() {
    const decks = await listDecks(currentUserId);

    appEl.innerHTML = `
      <section class="card" style="max-width:520px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Decks</h2>

        <div style="display:flex; gap:8px; margin-top:16px; margin-bottom:4px;">
          <input type="text" id="newDeckTitle" placeholder="Deck name (optional)"
            style="flex:1;" />
          <div style="position:relative;">
            <button type="button" class="primary" id="newDeckBtn">New Deck ▾</button>
            <div id="newDeckMenu" style="
              display:none;
              position:absolute;
              right:0;
              top:calc(100% + 4px);
              background:#fff;
              border:1px solid var(--border,#e5e7eb);
              border-radius:10px;
              box-shadow:0 4px 16px rgba(0,0,0,0.10);
              min-width:100%;
              z-index:20;
              overflow:hidden;
            ">
              <button id="createManualBtn" style="
                display:block; width:100%; text-align:left;
                padding:11px 16px; border:none; background:none;
                cursor:pointer; font-size:0.92rem; font-family:inherit;
              ">Manual</button>
              <div style="height:1px; background:var(--border,#e5e7eb); margin:0 10px;"></div>
              <button id="createAiBtn" style="
                display:block; width:100%; text-align:left;
                padding:11px 16px; border:none; background:none;
                cursor:pointer; font-size:0.92rem; font-family:inherit;
              ">Generation</button>
            </div>
          </div>
        </div>

        <div id="aiPanel" style="display:none; padding:14px 16px; border:1px solid var(--border,#e5e7eb); border-radius:10px; margin-bottom:12px; background:var(--surface,#f9fafb);">
          <p style="margin:0 0 10px; font-size:0.92rem; font-weight:600;">Generate Deck from PDF</p>
          <input type="file" id="pdfFileInput" accept=".pdf" style="display:block; margin-bottom:12px;" />
          <div id="aiStatus" style="display:none; margin-bottom:10px; font-size:0.88rem; color:var(--muted); padding:8px 12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px;"></div>
          <div id="aiError" style="display:none; margin-bottom:10px; font-size:0.88rem; color:#b91c1c; padding:8px 12px; background:#fef2f2; border:1px solid #fecaca; border-radius:8px;"></div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="primary" id="pdfGenerateBtn">Generate Deck</button>
            <button type="button" class="small" id="aiCancelBtn">Cancel</button>
          </div>
        </div>

        <div id="decksList" style="margin-top:8px;">
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

    // ── Dropdown toggle ─────────────────────────────────────────────────────

    const newDeckBtn = appEl.querySelector("#newDeckBtn");
    const newDeckMenu = appEl.querySelector("#newDeckMenu");

    function closeMenu() {
      if (newDeckMenu) newDeckMenu.style.display = "none";
    }

    newDeckBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = newDeckMenu.style.display !== "none";
      newDeckMenu.style.display = isOpen ? "none" : "block";
    });

    document.addEventListener("click", closeMenu, { once: true });

    // ── Manual creation ─────────────────────────────────────────────────────

    appEl.querySelector("#createManualBtn")?.addEventListener("click", async () => {
      closeMenu();
      const input = appEl.querySelector("#newDeckTitle");
      const title = input?.value?.trim() || "New Deck";
      const newId = await createDeck(currentUserId, title);
      if (input) input.value = "";
      await openDeck(newId);
    });

    // Enter key in title input also creates manual deck
    appEl.querySelector("#newDeckTitle")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") appEl.querySelector("#createManualBtn")?.click();
    });

    // ── AI panel ────────────────────────────────────────────────────────────

    const aiPanel = appEl.querySelector("#aiPanel");
    const aiStatus = appEl.querySelector("#aiStatus");
    const aiError = appEl.querySelector("#aiError");
    const generateBtn = appEl.querySelector("#pdfGenerateBtn");

    function showStatus(msg) {
      aiStatus.textContent = msg;
      aiStatus.style.display = msg ? "block" : "none";
      aiError.style.display = "none";
    }

    function showError(msg) {
      aiError.textContent = msg;
      aiError.style.display = msg ? "block" : "none";
      aiStatus.style.display = "none";
    }

    appEl.querySelector("#createAiBtn")?.addEventListener("click", () => {
      closeMenu();
      aiPanel.style.display = "block";
      aiStatus.style.display = "none";
      aiError.style.display = "none";
      appEl.querySelector("#pdfFileInput").value = "";
      generateBtn.disabled = false;
    });

    appEl.querySelector("#aiCancelBtn")?.addEventListener("click", () => {
      aiPanel.style.display = "none";
    });

    generateBtn?.addEventListener("click", async () => {
      const fileInput = appEl.querySelector("#pdfFileInput");
      const file = fileInput?.files?.[0];

      if (!file) {
        showError("Please select a PDF file first.");
        return;
      }

      generateBtn.disabled = true;
      showStatus("Reading PDF…");

      let text;
      try {
        const { extractTextFromPdf } = await import("../pdfToCards.js");
        text = await extractTextFromPdf(file);
      } catch (e) {
        showError(`Could not read PDF: ${e.message}`);
        generateBtn.disabled = false;
        return;
      }

      if (!text?.trim()) {
        showError("No readable text found in this PDF. It may be image-based or scanned.");
        generateBtn.disabled = false;
        return;
      }

      showStatus("Generating flashcards with AI… this may take a moment.");

      let rawCards;
      try {
        const { generateCardsFromText } = await import("../pdfToCards.js");
        rawCards = await generateCardsFromText(text);
      } catch (e) {
        showError(`Generation failed: ${e.message}`);
        generateBtn.disabled = false;
        return;
      }

      if (!rawCards?.length) {
        showError("The AI did not return any cards. Try a different PDF.");
        generateBtn.disabled = false;
        return;
      }

      const validRaw = rawCards.filter(c => c.front?.trim() && c.back?.trim());
      if (!validRaw.length) {
        showError("The AI returned cards with missing content. Try a different PDF.");
        generateBtn.disabled = false;
        return;
      }

      // Show review confirmation state
      aiStatus.style.display = "none";
      aiError.style.display = "none";
      generateBtn.style.display = "none";
      appEl.querySelector("#aiCancelBtn").style.display = "none";
      appEl.querySelector("#pdfFileInput").style.display = "none";

      const titleInput = appEl.querySelector("#newDeckTitle");

      const reviewDiv = document.createElement("div");
      reviewDiv.innerHTML = `
        <p style="margin:0 0 6px; font-size:0.92rem;">
          <strong>${validRaw.length} cards</strong> generated from <em>${escapeHtml(file.name)}</em>.
        </p>
        <p style="margin:0 0 14px; font-size:0.85rem; color:var(--muted);">
          AI-generated cards are a starting point — you can edit, add, or delete them in the editor before studying.
        </p>
        <div style="display:flex; gap:8px;">
          <button type="button" class="primary" id="openEditorBtn">Open in Editor</button>
          <button type="button" class="small" id="retryBtn">Try Again</button>
        </div>
      `;
      aiPanel.appendChild(reviewDiv);

      reviewDiv.querySelector("#retryBtn")?.addEventListener("click", () => {
        reviewDiv.remove();
        generateBtn.style.display = "";
        appEl.querySelector("#aiCancelBtn").style.display = "";
        appEl.querySelector("#pdfFileInput").style.display = "";
        appEl.querySelector("#pdfFileInput").value = "";
        generateBtn.disabled = false;
      });

      reviewDiv.querySelector("#openEditorBtn")?.addEventListener("click", async () => {
        const title = titleInput?.value?.trim() || file.name.replace(/\.pdf$/i, "") || "Generated Deck";
        if (titleInput) titleInput.value = "";
        const newId = await createDeck(currentUserId, title);

        const LONG_ANSWER_WORD_THRESHOLD = 15;
        const now = Date.now();
        const cards = validRaw.map(c => ({
          id: uid(),
          front: c.front.trim(),
          back: c.back.trim(),
          stage: 1,
          createdAt: now,
          lastSeenAt: null,
          stage3Mastered: false,
          longAnswer: c.back.trim().split(/\s+/).length > LONG_ANSWER_WORD_THRESHOLD,
        }));

        await openDeck(newId, cards);
      });
    });

    // ── Deck list actions ───────────────────────────────────────────────────

    appEl.querySelector("#decksList")?.addEventListener("click", async (e) => {
      const openId = e.target?.getAttribute("data-open-deck");
      if (openId) { await openDeck(openId); return; }

      const renameId = e.target?.getAttribute("data-rename-deck");
      if (renameId) {
        const current = e.target?.getAttribute("data-deck-title") || "";
        const newTitle = prompt("New deck name:", current);
        if (newTitle?.trim()) {
          await renameDeck(currentUserId, renameId, newTitle.trim());
          if (renameId === state.deckId) state.deckTitle = newTitle.trim();
          await render();
        }
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

  async function openDeck(deckId, preloadedCards = null) {
    await setActiveDeckId(currentUserId, deckId);
    const deck = await getDeck(currentUserId, deckId);
    state.screen = "create";
    state.deckId = deckId;
    state.deckTitle = deck?.title || "My Deck";
    state.cards = preloadedCards ?? deck?.cards ?? [];
    state.lastShownCardId = deck?.lastShownCardId || null;
    state.aiGenerated = preloadedCards != null;
    if (preloadedCards) await save();
    renderAll();
  }

  render();
}
