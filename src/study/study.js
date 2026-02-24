import {
  escapeHtml,
  sampleN,
  shuffle,
  markSeen,
  STAGE3_INJECTION_CHANCE
} from "../utils.js";

import { renderLearn } from "./learn.js";
import { renderRecall } from "./recall.js";

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
 */
function pickNextCard(cards, lastShownCardId) {
  const learn = cards.filter(c => c.stage === 1);
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
  const current = pickNextCard(state.cards, state.lastShownCardId ?? null);

  if (!current) {
    appEl.innerHTML = `
      <section class="card">
        ${deps.renderProgressBar(state)}
        <h2>No cards available</h2>
        <div class="btns">
          <button class="danger" id="backToCreate">Back to Create</button>
        </div>
      </section>
    `;

    appEl.querySelector("#backToCreate").addEventListener("click", () => {
      deps.setScreen("create");
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
