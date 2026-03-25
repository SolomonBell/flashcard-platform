import {
  escapeHtml,
  sampleN,
  shuffle,
  markSeen,
  STAGE3_INJECTION_CHANCE
} from "../utils.js";

import { renderLearn } from "./learn.js";
import { renderRecall } from "./recall.js";

const LARGE_DECK_THRESHOLD = 12;
const LARGE_DECK_POOL_SIZE = 8;

/**
 * One-time initializer for large-deck mode.
 * Called at the start of every renderStudyScreen; no-ops if already initialized
 * or if the deck is small enough not to need it.
 *
 * Sets state.largeDeckBacklog to an ordered array of card IDs that are not yet
 * eligible for Stage 1/2.  undefined = not initialized; [] = exhausted.
 */
function initLargeDeckMode(state) {
  if (state.cards.length <= LARGE_DECK_THRESHOLD) return;
  if (state.largeDeckBacklog !== undefined) return;

  // Cards that are genuinely unseen (stage 1, never shown) are backlog candidates.
  // Everything else — already progressing or already seen — counts as in the pool.
  const unseen = state.cards.filter(c => c.stage === 1 && !c.lastSeenAt);
  const inPoolCount = state.cards.length - unseen.length;
  const spotsAvailable = Math.max(0, LARGE_DECK_POOL_SIZE - inPoolCount);

  state.largeDeckBacklog = unseen.slice(spotsAvailable).map(c => c.id);
}

export function buildMCOptions(currentCard, allCards) {
  const correct = {
    text: escapeHtml(currentCard.back),
    isCorrect: true
  };

  const others = allCards
    .filter(c => c.id !== currentCard.id)
    .map(c => ({
      text: escapeHtml(c.back),
      isCorrect: false
    }));

  const wrongs = sampleN(others, Math.min(3, others.length));

  while (wrongs.length < 3) {
    wrongs.push({
      text: "Add more cards for better choices.",
      isCorrect: false
    });
  }

  return shuffle([correct, ...wrongs]);
}

/**
 * Pick next card by stage rules; never the same card twice in a row when more than one eligible.
 * @param {object[]} cards
 * @param {string | null} lastShownCardId
 * @param {string[] | undefined} backlogIds - IDs of cards not yet introduced (large-deck mode)
 */
function pickNextCard(cards, lastShownCardId, backlogIds) {
  const backlogSet = backlogIds?.length ? new Set(backlogIds) : null;

  // Backlog cards are always stage 1; only the learn pool needs filtering.
  const learn = cards.filter(c => c.stage === 1 && (!backlogSet || !backlogSet.has(c.id)));
  const recall = cards.filter(c => c.stage === 2);
  const memorized = cards.filter(c => c.stage === 3);

  function chooseFrom(pool) {
    if (!pool.length) return null;
    if (pool.length <= 1) return pool[0];
    const eligible = pool.filter(c => c.id !== lastShownCardId);
    const pickPool = eligible.length ? eligible : pool;
    return pickPool[Math.floor(Math.random() * pickPool.length)];
  }

  if (learn.length === 0 && recall.length === 0) {
    return memorized.length ? chooseFrom(memorized) : null;
  }

  if (memorized.length > 0 && Math.random() < STAGE3_INJECTION_CHANCE) {
    return chooseFrom(memorized);
  }

  if (learn.length) return chooseFrom(learn);
  if (recall.length) return chooseFrom(recall);

  return memorized.length ? chooseFrom(memorized) : null;
}

export function renderStudyScreen(appEl, state, deps) {
  initLargeDeckMode(state);
  const current = pickNextCard(state.cards, state.lastShownCardId ?? null, state.largeDeckBacklog);

  if (!current) {
    appEl.innerHTML = `
      <section class="card">
        ${deps.renderProgressBar(state)}
        <h2>No cards available</h2>
        <div class="btns">
          <button class="danger" id="backToDecks">Back to Decks</button>
        </div>
      </section>
    `;

    appEl.querySelector("#backToDecks").addEventListener("click", () => {
      deps.setScreen("decks");
      deps.save();
      deps.renderAll();
    });

    return;
  }

  const card = state.cards.find(c => c.id === current.id) ?? current;
  if (card) {
    markSeen(card);
    state.lastShownCardId = card.id;
    deps.save();
  }

  const safeCard = {
    ...card,
    front: escapeHtml(card.front),
    back: escapeHtml(card.back),
  };

  if (safeCard.stage === 1) {
    renderLearn(appEl, state, safeCard, deps);
  } else {
    renderRecall(appEl, state, safeCard, deps);
  }
}
