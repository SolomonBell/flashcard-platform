/**
 * Classes screen — class library/homepage.
 * Teachers: view all classes, create, open, delete.
 * Students: view enrolled classes and study shared decks.
 */

import {
  getCurrentUser,
  getClassesByTeacher, getClassesByStudent,
  createClass, updateClass, deleteClass,
  getSharedDecksByClass,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

// ── Badge helpers ─────────────────────────────────────────────────────────────

function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#111827" : "#ffffff";
}

function renderBadgePills(badges) {
  if (!badges || badges.length === 0) return "";
  return badges.map(b => {
    const color = b.color || "#3b82f6";
    const text  = getTextColor(color);
    return `<span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:500; background:${escapeHtml(color)}; color:${text}; white-space:nowrap;">${escapeHtml(b.label || "")}</span>`;
  }).join(" ");
}

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
    let editingClassId = null;
    let editingName = "";

    async function render() {
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
              : myClasses.map(cls => {
                  const isEditing = cls.id === editingClassId;
                  return `
                    <div style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px;
                                padding:10px 12px; border:1px solid var(--border, #e5e7eb);
                                border-radius:10px; margin-bottom:8px;">
                      ${isEditing
                        ? `<input type="text" class="rename-input" data-class-id="${escapeHtml(cls.id)}"
                             value="${escapeHtml(editingName)}" style="font-weight:600; padding:2px 6px;" />`
                        : `<span style="font-weight:600; word-break:break-word;">${escapeHtml(cls.name)}</span>`
                      }
                      <div style="display:flex; gap:6px;">
                        ${isEditing
                          ? `<button type="button" class="primary small" style="padding:3px 8px; font-size:0.8rem;"
                               data-save-rename="${escapeHtml(cls.id)}">Save</button>
                             <button type="button" class="small" style="padding:3px 8px; font-size:0.8rem;"
                               data-cancel-rename="${escapeHtml(cls.id)}">Cancel</button>`
                          : `<button type="button" class="primary small" style="padding:3px 8px; font-size:0.8rem;"
                               data-open-class="${escapeHtml(cls.id)}"
                               data-class-name="${escapeHtml(cls.name)}">Open</button>
                             <button type="button" class="small" style="padding:3px 8px; font-size:0.8rem;"
                               data-rename-class="${escapeHtml(cls.id)}"
                               data-class-name="${escapeHtml(cls.name)}">Rename</button>
                             <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                               data-delete-class="${escapeHtml(cls.id)}"
                               data-class-name="${escapeHtml(cls.name)}">Delete</button>`
                        }
                      </div>
                    </div>
                  `;
                }).join("")}
          </div>
        </section>
      `;

      // Focus and select-all the rename input when entering edit mode
      if (editingClassId) {
        const renameInput = appEl.querySelector(`.rename-input[data-class-id="${editingClassId}"]`);
        if (renameInput) {
          renameInput.focus();
          renameInput.select();
        }
      }

      appEl.querySelector("#createClassBtn")?.addEventListener("click", async () => {
        const input = appEl.querySelector("#newClassName");
        const name = input?.value?.trim() || "New Class";
        await createClass(currentUser.id, name);
        if (input) input.value = "";
        editingClassId = null;
        await render();
      });

      appEl.querySelector("#newClassName")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") appEl.querySelector("#createClassBtn")?.click();
      });

      appEl.querySelector("#classesList")?.addEventListener("click", async (e) => {
        // Open
        const openId = e.target?.getAttribute("data-open-class");
        if (openId) {
          state.classId = openId;
          state.className = e.target?.getAttribute("data-class-name") || "";
          state.screen = "classDetail";
          renderAll();
          return;
        }

        // Rename — enter edit mode
        const renameId = e.target?.getAttribute("data-rename-class");
        if (renameId) {
          editingClassId = renameId;
          editingName = e.target?.getAttribute("data-class-name") || "";
          await render();
          return;
        }

        // Save rename
        const saveId = e.target?.getAttribute("data-save-rename");
        if (saveId) {
          const input = appEl.querySelector(`.rename-input[data-class-id="${saveId}"]`);
          const newName = input?.value?.trim();
          if (newName && newName !== editingName) {
            await updateClass(saveId, { name: newName });
          }
          editingClassId = null;
          editingName = "";
          await render();
          return;
        }

        // Cancel rename
        const cancelId = e.target?.getAttribute("data-cancel-rename");
        if (cancelId) {
          editingClassId = null;
          editingName = "";
          await render();
          return;
        }

        // Delete
        const deleteId = e.target?.getAttribute("data-delete-class");
        if (deleteId) {
          const name = e.target?.getAttribute("data-class-name") || "this class";
          if (confirm(`Delete "${name}"? This cannot be undone.`)) {
            await deleteClass(deleteId);
            editingClassId = null;
            await render();
          }
          return;
        }
      });

      // Keyboard shortcuts for the active rename input
      appEl.querySelector("#classesList")?.addEventListener("keydown", (e) => {
        if (!editingClassId) return;
        if (e.key === "Enter") {
          appEl.querySelector(`[data-save-rename="${editingClassId}"]`)?.click();
        } else if (e.key === "Escape") {
          appEl.querySelector(`[data-cancel-rename="${editingClassId}"]`)?.click();
        }
      });
    }

    await render();
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
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;
                                  margin-top:6px; padding:8px 10px;
                                  border:1px solid var(--border,#e5e7eb); border-radius:8px;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0;">
                          <span style="font-weight:500;">${escapeHtml(sd.deckSnapshot.deckName)}</span>
                          ${renderBadgePills(sd.deckSnapshot.badges || [])}
                        </div>
                        <button type="button" class="primary small" data-study-shared-id="${escapeHtml(sd.id)}"
                          style="flex-shrink:0;">Study</button>
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
