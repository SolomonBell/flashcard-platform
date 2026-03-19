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
  deleteSharedDeck,
  listDecks, getDeck,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

export async function renderClassesScreen(appEl, { renderAll, state }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const isTeacher = currentUser.role === "teacher";
  let message = "";
  let messageType = "success";

  function setMessage(text, type) {
    message = text;
    messageType = type || "success";
  }

  // ── Teacher filter state (persists across re-renders within this screen) ──────
  const _df = {}, _stf = {}, _sdf = {};
  const getDf  = id => _df[id]  || (_df[id]  = { query: "", sort: "az", selected: null, open: false });
  const getStf = id => _stf[id] || (_stf[id] = { query: "", sort: "az" });
  const getSdf = id => _sdf[id] || (_sdf[id] = { query: "", sort: "newest" });

  function applyDeckSort(decks, sort) {
    const d = [...decks];
    if (sort === "za")     return d.sort((a, b) => b.title.localeCompare(a.title));
    if (sort === "newest") return d.sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    if (sort === "oldest") return d.sort((a, b) => (a.updatedAt || a.createdAt || "").localeCompare(b.updatedAt || b.createdAt || ""));
    return d.sort((a, b) => a.title.localeCompare(b.title)); // az default
  }
  function applySdSort(sds, sort) {
    const d = [...sds];
    if (sort === "za")     return d.sort((a, b) => (b.deckSnapshot.deckName || "").localeCompare(a.deckSnapshot.deckName || ""));
    if (sort === "oldest") return d.sort((a, b) => (a.sharedAt || "").localeCompare(b.sharedAt || ""));
    if (sort === "az")     return d.sort((a, b) => (a.deckSnapshot.deckName || "").localeCompare(b.deckSnapshot.deckName || ""));
    return d.sort((a, b) => (b.sharedAt || "").localeCompare(a.sharedAt || "")); // newest default
  }
  function applyStuSort(stus, sort) {
    const d = [...stus];
    if (sort === "za")   return d.sort((a, b) => b.localeCompare(a));
    if (sort === "last") return d.reverse();
    if (sort === "az")   return d.sort((a, b) => a.localeCompare(b));
    return d; // "first" = insertion order
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

    const sharedDecksMap = {};
    for (const cls of myClasses) {
      sharedDecksMap[cls.id] = await getSharedDecksByClass(cls.id);
    }

    const openSections = new Set(
      [...appEl.querySelectorAll("details[data-section][open]")].map(
        el => `${el.dataset.classId}:${el.dataset.section}`
      )
    );

    const ctrlRow  = `display:flex; gap:6px; align-items:center; margin-bottom:6px;`;
    const srchSty  = `flex:1; padding:4px 6px; font-size:12px; border:1px solid var(--border); border-radius:6px;`;
    const sortSty  = `font-size:11px; padding:2px 4px; border:1px solid var(--border); border-radius:6px; color:var(--muted);`;

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
                  const df  = getDf(cls.id);
                  const stf = getStf(cls.id);
                  const sdf = getSdf(cls.id);

                  // Sort at render time; search is applied in-place after render
                  const sortedDecks = applyDeckSort(myDecks, df.sort);
                  const visDecks    = df.query
                    ? sortedDecks.filter(d => d.title.toLowerCase().includes(df.query.toLowerCase()))
                    : sortedDecks;
                  const sortedStu = applyStuSort(cls.studentIds, stf.sort);
                  const sortedSd  = applySdSort(sharedDecks, sdf.sort);

                  const selectedDeck = visDecks.find(d => d.id === df.selected) ?? visDecks[0];
                  const deckSelectHtml = myDecks.length === 0
                    ? `<span class="small" style="color:var(--muted);">Create a deck first.</span>`
                    : `<div class="cls-deck-picker" data-class-id="${escapeHtml(cls.id)}" style="flex:1; position:relative;">
                        <input type="hidden" id="deck-select-${escapeHtml(cls.id)}" value="${escapeHtml(selectedDeck?.id || "")}" />
                        <div style="display:flex; gap:8px; align-items:center;">
                          <button type="button" class="cls-deck-trigger" data-class-id="${escapeHtml(cls.id)}"
                            style="flex:1; display:flex; justify-content:space-between; align-items:center; gap:6px; padding:6px 10px; font-size:13px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer; text-align:left; min-width:0;">
                            <span class="cls-deck-label" data-class-id="${escapeHtml(cls.id)}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(selectedDeck?.title || "Select a deck…")}</span>
                            <span style="color:var(--muted); font-size:10px; flex-shrink:0;">${df.open ? "▴" : "▾"}</span>
                          </button>
                          <button type="button" class="primary small" data-share-class-id="${escapeHtml(cls.id)}">Share</button>
                        </div>
                        <div class="cls-deck-panel" data-class-id="${escapeHtml(cls.id)}"
                          style="display:${df.open ? "block" : "none"}; position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:100;
                                 background:#fff; border:1px solid var(--border); border-radius:8px;
                                 box-shadow:0 4px 16px rgba(0,0,0,0.12); padding:8px;">
                          <div style="${ctrlRow}">
                            <input type="text" class="cls-deck-search" data-class-id="${escapeHtml(cls.id)}"
                              placeholder="Search decks…" value="${escapeHtml(df.query)}"
                              style="${srchSty}" />
                            <select class="cls-deck-sort" data-class-id="${escapeHtml(cls.id)}" style="${sortSty}">
                              <option value="az"     ${df.sort==="az"?"selected":""}>A → Z</option>
                              <option value="za"     ${df.sort==="za"?"selected":""}>Z → A</option>
                              <option value="newest" ${df.sort==="newest"?"selected":""}>Newest</option>
                              <option value="oldest" ${df.sort==="oldest"?"selected":""}>Oldest</option>
                            </select>
                          </div>
                          <div style="max-height:180px; overflow-y:auto;">
                            ${visDecks.length === 0
                              ? `<p style="font-size:12px; color:var(--muted); margin:4px 0;">No matches</p>`
                              : visDecks.map(d => `
                                <div class="cls-deck-option" data-class-id="${escapeHtml(cls.id)}" data-deck-id="${escapeHtml(d.id)}" data-deck-title="${escapeHtml(d.title)}"
                                  style="padding:6px 8px; font-size:13px; cursor:pointer; border-radius:6px;
                                         ${d.id === selectedDeck?.id ? "background:var(--primary-light,#eff6ff); font-weight:500;" : ""}">
                                  ${escapeHtml(d.title)}
                                </div>`).join("")}
                          </div>
                        </div>
                      </div>`;

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
                        <button type="button" class="primary small" data-add-student-class-id="${escapeHtml(cls.id)}">Add</button>
                      </div>
                      <details style="margin-top:4px;" data-section="students" data-class-id="${escapeHtml(cls.id)}">
                        <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Students (${cls.studentIds.length})</summary>
                        <div style="padding-left:12px; margin-top:6px;">
                          ${cls.studentIds.length > 0 ? `
                            <div style="${ctrlRow}">
                              <input type="text" class="cls-stu-search" data-class-id="${escapeHtml(cls.id)}"
                                placeholder="Search students…" value="${escapeHtml(stf.query)}"
                                style="${srchSty}" />
                              <select class="cls-stu-sort" data-class-id="${escapeHtml(cls.id)}" style="${sortSty}">
                                <option value="az"    ${stf.sort==="az"?"selected":""}>A → Z</option>
                                <option value="za"    ${stf.sort==="za"?"selected":""}>Z → A</option>
                                <option value="first" ${stf.sort==="first"?"selected":""}>Newest</option>
                                <option value="last"  ${stf.sort==="last"?"selected":""}>Oldest</option>
                              </select>
                            </div>
                          ` : ""}
                          <div class="cls-stu-list" data-class-id="${escapeHtml(cls.id)}">
                            ${cls.studentIds.length === 0
                              ? `<p class="small" style="color:var(--muted); margin:0;">No students yet.</p>`
                              : sortedStu.map(sid => `
                                <div data-name="${escapeHtml(sid)}" style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; margin-top:4px;">
                                  <span class="small" style="color:var(--muted);">${escapeHtml(sid)}</span>
                                  <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                                    data-remove-student="${escapeHtml(sid)}"
                                    data-remove-student-class="${escapeHtml(cls.id)}">Remove</button>
                                </div>
                              `).join("")}
                          </div>
                        </div>
                      </details>
                    </div>

                    <!-- Deck Sharing section -->
                    <div style="border-top:1px solid #e5e7eb; margin-top:12px; padding-top:12px;">
                      <p style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); margin:0 0 6px;">Share Deck</p>
                      <div style="margin-bottom:8px;">
                        ${deckSelectHtml}
                      </div>
                      <details style="margin-top:4px;" data-section="sharedDecks" data-class-id="${escapeHtml(cls.id)}">
                        <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Shared Decks (${sharedDecks.length})</summary>
                        <div style="padding-left:12px; margin-top:6px;">
                          ${sharedDecks.length > 0 ? `
                            <div style="${ctrlRow}">
                              <input type="text" class="cls-sd-search" data-class-id="${escapeHtml(cls.id)}"
                                placeholder="Search shared decks…" value="${escapeHtml(sdf.query)}"
                                style="${srchSty}" />
                              <select class="cls-sd-sort" data-class-id="${escapeHtml(cls.id)}" style="${sortSty}">
                                <option value="az"     ${sdf.sort==="az"?"selected":""}>A → Z</option>
                                <option value="za"     ${sdf.sort==="za"?"selected":""}>Z → A</option>
                                <option value="newest" ${sdf.sort==="newest"?"selected":""}>Newest</option>
                                <option value="oldest" ${sdf.sort==="oldest"?"selected":""}>Oldest</option>
                              </select>
                            </div>
                          ` : ""}
                          <div class="cls-sd-list" data-class-id="${escapeHtml(cls.id)}">
                            ${sharedDecks.length === 0
                              ? `<p class="small" style="color:var(--muted); margin:0;">No decks shared yet.</p>`
                              : sortedSd.map(sd => `
                                <div data-name="${escapeHtml(sd.deckSnapshot.deckName)}" style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; margin-top:4px;">
                                  <span class="small">${escapeHtml(sd.deckSnapshot.deckName)}</span>
                                  <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;" data-delete-shared="${escapeHtml(sd.id)}">Remove</button>
                                </div>
                              `).join("")}
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>`;
                }).join("")}
          </div>
        </div>
      </section>
    `;

    // Restore open state
    appEl.querySelectorAll("details[data-section]").forEach(el => {
      if (openSections.has(`${el.dataset.classId}:${el.dataset.section}`)) el.open = true;
    });

    // Re-apply saved search filters in-place (students + shared decks render all items, filter after)
    for (const cls of myClasses) {
      const stuQ = getStf(cls.id).query.toLowerCase();
      if (stuQ) {
        appEl.querySelector(`.cls-stu-list[data-class-id="${cls.id}"]`)
          ?.querySelectorAll("[data-name]").forEach(el => {
            el.style.display = el.dataset.name.toLowerCase().includes(stuQ) ? "" : "none";
          });
      }
      const sdQ = getSdf(cls.id).query.toLowerCase();
      if (sdQ) {
        appEl.querySelector(`.cls-sd-list[data-class-id="${cls.id}"]`)
          ?.querySelectorAll("[data-name]").forEach(el => {
            el.style.display = el.dataset.name.toLowerCase().includes(sdQ) ? "" : "none";
          });
      }
    }

    appEl.querySelector("#createClassBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#newClassName");
      const name = input?.value?.trim();
      if (!name) return;
      await createClass(currentUser.id, name);
      input.value = "";
      setMessage("Class created.");
      await render();
    });

    // Search (in-place) + sort (re-render) listeners per class
    for (const cls of myClasses) {
      const cid = cls.id;
      const df  = getDf(cid);
      const stf = getStf(cid);
      const sdf = getSdf(cid);

      // Custom deck picker: toggle open/closed
      appEl.querySelector(`.cls-deck-trigger[data-class-id="${cid}"]`)
        ?.addEventListener("click", () => {
          df.open = !df.open;
          const panel   = appEl.querySelector(`.cls-deck-panel[data-class-id="${cid}"]`);
          const chevron = appEl.querySelector(`.cls-deck-trigger[data-class-id="${cid}"] span:last-child`);
          if (panel)   panel.style.display   = df.open ? "block" : "none";
          if (chevron) chevron.textContent    = df.open ? "▴" : "▾";
          if (df.open) appEl.querySelector(`.cls-deck-search[data-class-id="${cid}"]`)?.focus();
        });

      // Close picker when clicking outside
      document.addEventListener("click", function closePicker(e) {
        const picker = appEl.querySelector(`.cls-deck-picker[data-class-id="${cid}"]`);
        if (!picker) { document.removeEventListener("click", closePicker); return; }
        if (!picker.contains(e.target)) {
          df.open = false;
          picker.querySelector(".cls-deck-panel").style.display = "none";
          const chevron = picker.querySelector(".cls-deck-trigger span:last-child");
          if (chevron) chevron.textContent = "▾";
        }
      });

      // Option click: select deck, close panel
      appEl.querySelector(`.cls-deck-panel[data-class-id="${cid}"]`)
        ?.addEventListener("click", e => {
          const opt = e.target.closest(".cls-deck-option");
          if (!opt) return;
          df.selected = opt.dataset.deckId;
          df.open = false;
          const hidden  = appEl.querySelector(`#deck-select-${cid}`);
          const label   = appEl.querySelector(`.cls-deck-label[data-class-id="${cid}"]`);
          const panel   = appEl.querySelector(`.cls-deck-panel[data-class-id="${cid}"]`);
          const chevron = appEl.querySelector(`.cls-deck-trigger[data-class-id="${cid}"] span:last-child`);
          if (hidden)  hidden.value        = opt.dataset.deckId;
          if (label)   label.textContent   = opt.dataset.deckTitle;
          if (chevron) chevron.textContent  = "▾";
          if (panel) {
            panel.style.display = "none";
            panel.querySelectorAll(".cls-deck-option").forEach(el => {
              const sel = el.dataset.deckId === df.selected;
              el.style.background  = sel ? "var(--primary-light,#eff6ff)" : "";
              el.style.fontWeight  = sel ? "500" : "";
            });
          }
        });

      // Deck search: filter option divs in-place
      appEl.querySelector(`.cls-deck-search[data-class-id="${cid}"]`)
        ?.addEventListener("input", e => {
          df.query = e.target.value;
          const q = df.query.toLowerCase();
          appEl.querySelector(`.cls-deck-panel[data-class-id="${cid}"]`)
            ?.querySelectorAll(".cls-deck-option").forEach(el => {
              el.style.display = !q || el.dataset.deckTitle.toLowerCase().includes(q) ? "" : "none";
            });
        });

      // Deck sort: re-render (re-orders list)
      appEl.querySelector(`.cls-deck-sort[data-class-id="${cid}"]`)
        ?.addEventListener("change", e => { df.sort = e.target.value; render(); });

      // Student search: in-place show/hide; sort: re-render
      appEl.querySelector(`.cls-stu-search[data-class-id="${cid}"]`)
        ?.addEventListener("input", e => {
          stf.query = e.target.value;
          const q = stf.query.toLowerCase();
          appEl.querySelector(`.cls-stu-list[data-class-id="${cid}"]`)
            ?.querySelectorAll("[data-name]").forEach(el => {
              el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? "" : "none";
            });
        });
      appEl.querySelector(`.cls-stu-sort[data-class-id="${cid}"]`)
        ?.addEventListener("change", e => { stf.sort = e.target.value; render(); });

      // Shared deck search: in-place show/hide; sort: re-render
      appEl.querySelector(`.cls-sd-search[data-class-id="${cid}"]`)
        ?.addEventListener("input", e => {
          sdf.query = e.target.value;
          const q = sdf.query.toLowerCase();
          appEl.querySelector(`.cls-sd-list[data-class-id="${cid}"]`)
            ?.querySelectorAll("[data-name]").forEach(el => {
              el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? "" : "none";
            });
        });
      appEl.querySelector(`.cls-sd-sort[data-class-id="${cid}"]`)
        ?.addEventListener("change", e => { sdf.sort = e.target.value; render(); });
    }

    appEl.querySelector("#classesList")?.addEventListener("click", async (e) => {
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
        const shareResult = await shareDeckToClass(currentUser.id, shareClassId, {
          cards: deck.cards,
          deckName: deck.title || "My deck",
          deckId: deck.id,
        });
        setMessage(shareResult?.isNew === false
          ? `"${deck.title}" is already shared to this class.`
          : `"${deck.title}" shared to class.`);
        await render();
        return;
      }

      const addStudentClassId = e.target?.getAttribute("data-add-student-class-id");
      if (addStudentClassId) {
        const input = appEl.querySelector(`.student-id-input[data-class-id="${addStudentClassId}"]`);
        const studentId = input?.value?.trim();
        if (!studentId) return;
        const added = await addStudentToClass(addStudentClassId, studentId);
        input.value = "";
        setMessage(added ? "Student added." : "Student already in this class.");
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
