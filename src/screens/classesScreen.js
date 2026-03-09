/**
 * Local-only Classes screen.
 * Teachers: create classes, add students, share current deck.
 * Students: view enrolled classes and study shared decks.
 */

import {
  getCurrentUser,
  getClassesByTeacher, getClassesByStudent,
  createClass, addStudentToClass, removeStudentFromClass,
  getSharedDecksByClass, shareDeckToClass,
  deleteSharedDeck, getSharedDeckById,
  listDecks, getDeck,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

export async function renderClassesScreen(appEl, { setScreen, renderAll, state }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const isTeacher = currentUser.role === "teacher";
  let message = "";
  let messageType = "success";

  function setMessage(text, type) {
    message = text;
    messageType = type || "success";
  }

  async function render() {
    if (isTeacher) {
      await renderTeacher();
    } else {
      await renderStudent();
    }
  }

  async function renderTeacher() {
    const myClasses = await getClassesByTeacher(currentUser.id);
    const myDecks = await listDecks(currentUser.id);

    // Pre-fetch shared decks for each class (needed before building HTML)
    const sharedDecksMap = {};
    for (const cls of myClasses) {
      sharedDecksMap[cls.id] = await getSharedDecksByClass(cls.id);
    }

    // Capture which <details> sections are currently open before wiping the DOM
    const openSections = new Set(
      [...appEl.querySelectorAll("details[data-section][open]")].map(
        el => `${el.dataset.classId}:${el.dataset.section}`
      )
    );

    appEl.innerHTML = `
      <section class="card" style="max-width:600px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Classes</h2>
        ${message ? `<div class="auth-status auth-status-${messageType}" style="margin-top:12px;">${escapeHtml(message)}</div>` : ""}
        <div style="margin-top:16px;">
          <h3 style="font-size:14px; margin:0 0 8px;">Create Class</h3>
          <div style="display:flex; gap:8px; margin-bottom:16px;">
            <input type="text" id="newClassName" placeholder="Class name" style="flex:1; padding:8px;" />
            <button type="button" class="primary" id="createClassBtn">Create</button>
          </div>
          <h3 style="font-size:14px; margin:0 0 8px;">Classes</h3>
          <div id="classesList">
            ${myClasses.length === 0
              ? `<p class="small" style="color:var(--muted);">No classes yet.</p>`
              : myClasses.map(cls => {
                  const sharedDecks = sharedDecksMap[cls.id];
                  const deckSelectHtml = myDecks.length === 0
                    ? `<span class="small" style="color:var(--muted);">Create a deck first.</span>`
                    : `<select id="deck-select-${escapeHtml(cls.id)}" style="flex:1; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:8px;">
                        ${myDecks.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)}</option>`).join("")}
                       </select>
                       <button type="button" class="primary small" data-share-class-id="${escapeHtml(cls.id)}">Share</button>`;
                  return `<div class="card" style="margin-bottom:12px; padding:12px;">
                    <div style="text-align:center; margin-bottom:12px;">
                      <strong>${escapeHtml(cls.name)}</strong>
                    </div>

                    <!-- Students section -->
                    <div>
                      <p style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); margin:0 0 6px;">Students</p>
                      <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
                        <input type="text" class="student-id-input" data-class-id="${escapeHtml(cls.id)}"
                          placeholder="Student Email" style="flex:1; padding:6px 8px; font-size:13px;" />
                        <button type="button" class="small" data-add-student-class-id="${escapeHtml(cls.id)}">Add Student</button>
                      </div>
                      <details style="margin-top:4px;" data-section="students" data-class-id="${escapeHtml(cls.id)}">
                        <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Students (${cls.studentIds.length})</summary>
                        <div style="padding-left:12px; margin-top:4px;">
                          ${cls.studentIds.length === 0
                            ? `<p class="small" style="color:var(--muted); margin:0;">No students yet.</p>`
                            : cls.studentIds.map(sid => `
                              <div style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; margin-top:4px;">
                                <span class="small" style="color:var(--muted);">${escapeHtml(sid)}</span>
                                <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                                  data-remove-student="${escapeHtml(sid)}"
                                  data-remove-student-class="${escapeHtml(cls.id)}">Remove</button>
                              </div>
                            `).join("")}
                        </div>
                      </details>
                    </div>

                    <!-- Deck Sharing section -->
                    <div style="border-top:1px solid #e5e7eb; margin-top:12px; padding-top:12px;">
                      <p style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); margin:0 0 6px;">Deck Sharing</p>
                      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                        <span class="small" style="color:var(--muted); white-space:nowrap;">Share Deck:</span>
                        ${deckSelectHtml}
                      </div>
                      <details style="margin-top:4px;" data-section="sharedDecks" data-class-id="${escapeHtml(cls.id)}">
                        <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Shared Decks (${sharedDecks.length})</summary>
                        <div style="padding-left:12px; margin-top:4px;">
                          ${sharedDecks.length === 0
                            ? `<p class="small" style="color:var(--muted); margin:0;">No decks shared yet.</p>`
                            : sharedDecks.map(sd => `
                              <div style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; margin-top:4px;">
                                <span class="small">${escapeHtml(sd.deckSnapshot.deckName)}</span>
                                <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;" data-delete-shared="${escapeHtml(sd.id)}">Remove</button>
                              </div>
                            `).join("")}
                        </div>
                      </details>
                    </div>
                  </div>`;
                }).join("")}
          </div>
        </div>
      </section>
    `;

    // Restore open state for details that were open before re-render
    appEl.querySelectorAll("details[data-section]").forEach(el => {
      if (openSections.has(`${el.dataset.classId}:${el.dataset.section}`)) {
        el.open = true;
      }
    });

    appEl.querySelector("#createClassBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#newClassName");
      const name = input?.value?.trim();
      if (!name) return;
      await createClass(currentUser.id, name);
      input.value = "";
      setMessage("Class created.");
      await render();
    });

    appEl.querySelector("#classesList")?.addEventListener("click", async (e) => {
      // Prevent Remove button clicks from toggling parent <details> or submitting forms
      if (e.target?.tagName === "BUTTON") {
        e.preventDefault();
        e.stopPropagation();
      }

      const shareClassId = e.target?.getAttribute("data-share-class-id");
      if (shareClassId) {
        const select = appEl.querySelector(`#deck-select-${shareClassId}`);
        const selectedDeckId = select?.value;
        if (!selectedDeckId) {
          setMessage("Please select a deck to share.", "error");
          await render();
          return;
        }
        const deck = await getDeck(currentUser.id, selectedDeckId);
        if (!deck || !deck.cards || deck.cards.length === 0) {
          setMessage("That deck has no cards to share.", "error");
          await render();
          return;
        }
        await shareDeckToClass(currentUser.id, shareClassId, {
          cards: deck.cards,
          deckName: deck.title || "My deck",
        });
        setMessage(`"${deck.title}" shared to class.`);
        await render();
        return;
      }

      const addStudentClassId = e.target?.getAttribute("data-add-student-class-id");
      if (addStudentClassId) {
        const input = appEl.querySelector(`.student-id-input[data-class-id="${addStudentClassId}"]`);
        const studentId = input?.value?.trim();
        if (!studentId) return;
        await addStudentToClass(addStudentClassId, studentId);
        input.value = "";
        setMessage("Student added.");
        await render();
        return;
      }

      const deleteSharedId = e.target?.getAttribute("data-delete-shared");
      if (deleteSharedId) {
        await deleteSharedDeck(deleteSharedId);
        setMessage("Shared deck removed.");
        await render();
        return;
      }

      const removeStudentId = e.target?.getAttribute("data-remove-student");
      const removeStudentClassId = e.target?.getAttribute("data-remove-student-class");
      if (removeStudentId && removeStudentClassId) {
        await removeStudentFromClass(removeStudentClassId, removeStudentId);
        setMessage("Student removed.");
        await render();
        return;
      }
    });

  }

  async function renderStudent() {
    const myClasses = await getClassesByStudent(currentUser.id);

    // Pre-fetch shared decks for each class
    const sharedDecksMap = {};
    for (const cls of myClasses) {
      sharedDecksMap[cls.id] = await getSharedDecksByClass(cls.id);
    }

    appEl.innerHTML = `
      <section class="card" style="max-width:600px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Classes</h2>
        ${message ? `<div class="auth-status auth-status-${messageType}" style="margin-top:12px;">${escapeHtml(message)}</div>` : ""}
        <div style="margin-top:16px;">
          ${myClasses.length === 0
            ? `<p class="small" style="color:var(--muted);">You haven't been added to any classes yet.</p>`
            : myClasses.map(cls => {
                const sharedDecks = sharedDecksMap[cls.id];
                return `<div class="card" style="margin-bottom:12px; padding:12px;">
                  <strong>${escapeHtml(cls.name)}</strong>
                  ${sharedDecks.length === 0
                    ? `<p class="small" style="color:var(--muted); margin-top:4px;">No decks shared yet.</p>`
                    : sharedDecks.map(sd => `
                      <div style="display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap:wrap;">
                        <span style="flex:1;">${escapeHtml(sd.deckSnapshot.deckName)}</span>
                        <button type="button" class="primary small" data-study-shared-id="${escapeHtml(sd.id)}">Study</button>
                      </div>
                    `).join("")}
                </div>`;
              }).join("")}
        </div>
      </section>
    `;

    appEl.querySelector("section")?.addEventListener("click", (e) => {
      const studySharedId = e.target?.getAttribute("data-study-shared-id");
      if (studySharedId && state) {
        state.sharedDeckId = studySharedId;
        state.screen = "sharedStudy";
        renderAll();
      }
    });

  }

  await render();
}
