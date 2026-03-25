/**
 * Classes screen — class library/homepage.
 * Teachers: view all classes, create, open, delete.
 * Students: view enrolled classes and study shared decks.
 */

import {
  getCurrentUser,
  getClassesByTeacher, getClassesByStudent,
  createClass, deleteClass,
  getSharedDecksByClass,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

export async function renderClassesScreen(appEl, { renderAll, state }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const isTeacher = currentUser.role === "teacher";

  if (isTeacher) {
    await renderTeacher();
  } else {
    await renderStudent();
  }

  async function renderTeacher() {
    const myClasses = await getClassesByTeacher(currentUser.id);

    appEl.innerHTML = `
      <section class="card" style="max-width:520px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Classes</h2>

        <div style="display:flex; gap:8px; margin-top:16px; margin-bottom:4px;">
          <input type="text" id="newClassName" placeholder="Class name"
            style="flex:1;" />
          <button type="button" class="primary" id="createClassBtn">New Class</button>
        </div>

        <div id="classesList" style="margin-top:8px;">
          ${myClasses.length === 0
            ? `<p class="small" style="color:var(--muted); text-align:center; margin-top:8px;">
                No classes yet. Create one above.
               </p>`
            : myClasses.map(cls => `
              <div style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px;
                          padding:10px 12px; border:1px solid var(--border, #e5e7eb);
                          border-radius:10px; margin-bottom:8px;">
                <span style="font-weight:600; word-break:break-word;">
                  ${escapeHtml(cls.name)}
                </span>
                <div style="display:flex; gap:6px;">
                  <button type="button" class="primary small" style="padding:3px 8px; font-size:0.8rem;"
                    data-open-class="${escapeHtml(cls.id)}"
                    data-class-name="${escapeHtml(cls.name)}">Open</button>
                  <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                    data-delete-class="${escapeHtml(cls.id)}"
                    data-class-name="${escapeHtml(cls.name)}">Delete</button>
                </div>
              </div>
            `).join("")}
        </div>
      </section>
    `;

    appEl.querySelector("#createClassBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#newClassName");
      const name = input?.value?.trim() || "New Class";
      await createClass(currentUser.id, name);
      if (input) input.value = "";
      await renderTeacher();
    });

    appEl.querySelector("#newClassName")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") appEl.querySelector("#createClassBtn")?.click();
    });

    appEl.querySelector("#classesList")?.addEventListener("click", async (e) => {
      const openId = e.target?.getAttribute("data-open-class");
      if (openId) {
        state.classId = openId;
        state.className = e.target?.getAttribute("data-class-name") || "";
        state.screen = "classDetail";
        renderAll();
        return;
      }

      const deleteId = e.target?.getAttribute("data-delete-class");
      if (deleteId) {
        const name = e.target?.getAttribute("data-class-name") || "this class";
        if (confirm(`Delete "${name}"? This cannot be undone.`)) {
          await deleteClass(deleteId);
          await renderTeacher();
        }
        return;
      }
    });
  }

  async function renderStudent() {
    const myClasses = await getClassesByStudent(currentUser.id);

    const sharedDecksMap = {};
    for (const cls of myClasses) {
      sharedDecksMap[cls.id] = await getSharedDecksByClass(cls.id);
    }

    appEl.innerHTML = `
      <section class="card" style="max-width:600px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Classes</h2>
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
}
