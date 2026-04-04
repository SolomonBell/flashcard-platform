/**
 * Class detail screen — teacher editor for a single class.
 * Manage students, share decks, view shared deck list.
 */

import {
  getCurrentUser,
  getClassById,
  addStudentToClass, removeStudentFromClass,
  getSharedDecksByClass, shareDeckToClass, deleteSharedDeck,
  updateSharedDeckBadges,
  listDecks, getDeck,
} from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

// ── Badge helpers ─────────────────────────────────────────────────────────────

const BADGE_COLORS = [
  { label: "Blue",   value: "#3b82f6" },
  { label: "Green",  value: "#22c55e" },
  { label: "Orange", value: "#f97316" },
  { label: "Red",    value: "#ef4444" },
  { label: "Purple", value: "#a855f7" },
];

function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#111827" : "#ffffff";
}

function renderBadgePills(badges, editMode = false) {
  if (!badges || badges.length === 0) return "";
  return badges.map((b, i) => {
    const color = b.color || "#3b82f6";
    const text  = getTextColor(color);
    const xBtn  = editMode
      ? `<button type="button" data-badge-delete-pending="${i}"
           style="background:none; border:none; cursor:pointer; color:inherit; opacity:0.7;
                  padding:0 0 0 4px; font-size:0.65rem; line-height:1;">×</button>`
      : "";
    return `<span style="display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:0.7rem; font-weight:500; background:${escapeHtml(color)}; color:${text}; white-space:nowrap;">${escapeHtml(b.label || "")}${xBtn}</span>`;
  }).join(" ");
}

function renderBadgeEditor(badges, visibleSlots) {
  const rows = Array.from({ length: visibleSlots }, (_, i) => {
    const b     = badges[i] || {};
    const label = escapeHtml(b.label || "");
    const color = b.color || "#3b82f6";
    const selectedOptions = BADGE_COLORS.map(c =>
      `<option value="${c.value}"${c.value === color ? " selected" : ""}>${c.label}</option>`
    ).join("");
    return `
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:6px;">
        <input type="text" id="badge-label-${i}" placeholder="Badge ${i + 1} label" maxlength="20"
          value="${label}"
          style="flex:1; min-width:100px; padding:3px 6px; font-size:0.8rem;" />
        <select id="badge-color-${i}"
          style="padding:3px 6px; font-size:0.8rem; border:1px solid var(--border,#e5e7eb); border-radius:6px;">
          ${selectedOptions}
        </select>
      </div>`;
  }).join("");

  const addBtn = visibleSlots < 2
    ? `<button type="button" class="small" data-badge-add-slot
         style="padding:3px 8px; font-size:0.8rem; margin-bottom:6px;">+ Add Badge</button>`
    : "";

  return `
    <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border,#e5e7eb);">
      ${rows}
      ${addBtn}
      <div style="display:flex; gap:6px; margin-top:2px;">
        <button type="button" class="primary small" data-badge-save
          style="padding:3px 8px; font-size:0.8rem;">Save</button>
        <button type="button" class="small" data-badge-cancel
          style="padding:3px 8px; font-size:0.8rem;">Cancel</button>
      </div>
    </div>
  `;
}

export async function renderClassDetailScreen(appEl, { renderAll, state }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return;

  const classId = state.classId;
  if (!classId) {
    state.screen = "classes";
    renderAll();
    return;
  }

  let message = "";
  let messageType = "success";

  function setMessage(text, type) {
    message = text;
    messageType = type || "success";
  }

  // Filter state — persists across re-renders within this screen
  const df  = { query: "", sort: "az", selected: null, open: false };
  const stf = { query: "", sort: "az" };
  const sdf = { query: "", sort: "newest" };

  // Badge editor state
  let badgeEditId        = null;
  let pendingBadges      = [];
  let visibleBadgeSlots  = 1;  // 1 or 2; controls how many input rows render

  const ctrlRow = `display:flex; gap:6px; align-items:center; margin-bottom:6px;`;
  const srchSty = `flex:1; padding:4px 6px; font-size:12px; border:1px solid var(--border); border-radius:6px;`;
  const sortSty = `font-size:11px; padding:2px 4px; border:1px solid var(--border); border-radius:6px; color:var(--muted);`;

  function applyDeckSort(decks, sort) {
    const d = [...decks];
    if (sort === "za")     return d.sort((a, b) => b.title.localeCompare(a.title));
    if (sort === "newest") return d.sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""));
    if (sort === "oldest") return d.sort((a, b) => (a.updatedAt || a.createdAt || "").localeCompare(b.updatedAt || b.createdAt || ""));
    return d.sort((a, b) => a.title.localeCompare(b.title));
  }
  function applySdSort(sds, sort) {
    const d = [...sds];
    if (sort === "za")     return d.sort((a, b) => (b.deckSnapshot.deckName || "").localeCompare(a.deckSnapshot.deckName || ""));
    if (sort === "oldest") return d.sort((a, b) => (a.sharedAt || "").localeCompare(b.sharedAt || ""));
    if (sort === "az")     return d.sort((a, b) => (a.deckSnapshot.deckName || "").localeCompare(b.deckSnapshot.deckName || ""));
    return d.sort((a, b) => (b.sharedAt || "").localeCompare(a.sharedAt || ""));
  }
  function applyStuSort(stus, sort) {
    const d = [...stus];
    if (sort === "za")   return d.sort((a, b) => b.localeCompare(a));
    if (sort === "last") return d.reverse();
    if (sort === "az")   return d.sort((a, b) => a.localeCompare(b));
    return d;
  }

  async function render() {
    const cls = await getClassById(classId);
    if (!cls) {
      state.screen = "classes";
      renderAll();
      return;
    }

    const myDecks = await listDecks(currentUser.id);
    const sharedDecks = await getSharedDecksByClass(classId);

    const openSections = new Set(
      [...appEl.querySelectorAll("details[data-section][open]")].map(el => el.dataset.section)
    );

    const sortedDecks = applyDeckSort(myDecks, df.sort);
    const visDecks    = df.query
      ? sortedDecks.filter(d => d.title.toLowerCase().includes(df.query.toLowerCase()))
      : sortedDecks;
    const sortedStu = applyStuSort(cls.studentIds, stf.sort);
    const sortedSd  = applySdSort(sharedDecks, sdf.sort);

    const selectedDeck = visDecks.find(d => d.id === df.selected) ?? visDecks[0];
    const deckSelectHtml = myDecks.length === 0
      ? `<span class="small" style="color:var(--muted);">Create a deck first.</span>`
      : `<div id="cls-deck-picker" style="flex:1; position:relative;">
          <input type="hidden" id="deck-select-val" value="${escapeHtml(selectedDeck?.id || "")}" />
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" id="cls-deck-trigger"
              style="flex:1; display:flex; justify-content:space-between; align-items:center; gap:6px; padding:6px 10px; font-size:13px; border:1px solid var(--border); border-radius:8px; background:#fff; cursor:pointer; text-align:left; min-width:0;">
              <span id="cls-deck-label" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(selectedDeck?.title || "Select a deck…")}</span>
              <span id="cls-deck-chevron" style="color:var(--muted); font-size:10px; flex-shrink:0;">${df.open ? "▴" : "▾"}</span>
            </button>
            <button type="button" class="primary small" id="shareBtn">Share</button>
          </div>
          <div id="cls-deck-panel"
            style="display:${df.open ? "block" : "none"}; position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:100;
                   background:#fff; border:1px solid var(--border); border-radius:8px;
                   box-shadow:0 4px 16px rgba(0,0,0,0.12); padding:8px;">
            <div style="${ctrlRow}">
              <input type="text" id="cls-deck-search"
                placeholder="Search decks…" value="${escapeHtml(df.query)}"
                style="${srchSty}" />
              <select id="cls-deck-sort" style="${sortSty}">
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
                  <div class="cls-deck-option" data-deck-id="${escapeHtml(d.id)}" data-deck-title="${escapeHtml(d.title)}"
                    style="padding:6px 8px; font-size:13px; cursor:pointer; border-radius:6px;
                           ${d.id === selectedDeck?.id ? "background:var(--primary-light,#eff6ff); font-weight:500;" : ""}">
                    ${escapeHtml(d.title)}
                  </div>`).join("")}
            </div>
          </div>
        </div>`;

    appEl.innerHTML = `
      <section class="card" style="max-width:600px; margin:0 auto;">
        <h2 style="margin:0 0 16px; text-align:center;">${escapeHtml(cls.name)}</h2>
        ${message ? `<div class="auth-status auth-status-${messageType}" style="margin-bottom:12px;">${escapeHtml(message)}</div>` : ""}

        <!-- Students section -->
        <div>
          <p style="font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); margin:0 0 6px;">Students</p>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:4px;">
            <input type="text" id="studentEmailInput"
              placeholder="Student Email" style="flex:1; padding:6px 8px; font-size:13px;" />
            <button type="button" class="primary small" id="addStudentBtn">Add</button>
          </div>
          <details style="margin-top:4px;" data-section="students" ${openSections.has("students") ? "open" : ""}>
            <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Students (${cls.studentIds.length})</summary>
            <div style="padding-left:12px; margin-top:6px;">
              ${cls.studentIds.length > 0 ? `
                <div style="${ctrlRow}">
                  <input type="text" id="cls-stu-search"
                    placeholder="Search students…" value="${escapeHtml(stf.query)}"
                    style="${srchSty}" />
                  <select id="cls-stu-sort" style="${sortSty}">
                    <option value="az"    ${stf.sort==="az"?"selected":""}>A → Z</option>
                    <option value="za"    ${stf.sort==="za"?"selected":""}>Z → A</option>
                    <option value="first" ${stf.sort==="first"?"selected":""}>Newest</option>
                    <option value="last"  ${stf.sort==="last"?"selected":""}>Oldest</option>
                  </select>
                </div>
              ` : ""}
              <div id="cls-stu-list">
                ${cls.studentIds.length === 0
                  ? `<p class="small" style="color:var(--muted); margin:0;">No students yet.</p>`
                  : sortedStu.map(sid => `
                    <div data-name="${escapeHtml(sid)}" style="display:grid; grid-template-columns:1fr auto; align-items:center; gap:8px; margin-top:4px;">
                      <span class="small" style="color:var(--muted);">${escapeHtml(sid)}</span>
                      <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                        data-remove-student="${escapeHtml(sid)}">Remove</button>
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
          <details style="margin-top:4px;" data-section="sharedDecks" ${openSections.has("sharedDecks") ? "open" : ""}>
            <summary style="cursor:pointer; font-size:13px; color:var(--muted); user-select:none;">Shared Decks (${sharedDecks.length})</summary>
            <div style="padding-left:12px; margin-top:6px;">
              ${sharedDecks.length > 0 ? `
                <div style="${ctrlRow}">
                  <input type="text" id="cls-sd-search"
                    placeholder="Search shared decks…" value="${escapeHtml(sdf.query)}"
                    style="${srchSty}" />
                  <select id="cls-sd-sort" style="${sortSty}">
                    <option value="az"     ${sdf.sort==="az"?"selected":""}>A → Z</option>
                    <option value="za"     ${sdf.sort==="za"?"selected":""}>Z → A</option>
                    <option value="newest" ${sdf.sort==="newest"?"selected":""}>Newest</option>
                    <option value="oldest" ${sdf.sort==="oldest"?"selected":""}>Oldest</option>
                  </select>
                </div>
              ` : ""}
              <div id="cls-sd-list">
                ${sharedDecks.length === 0
                  ? `<p class="small" style="color:var(--muted); margin:0;">No decks shared yet.</p>`
                  : sortedSd.map(sd => `
                    <div data-name="${escapeHtml(sd.deckSnapshot.deckName)}"
                      style="border:1px solid var(--border,#e5e7eb); border-radius:8px; padding:8px 10px; margin-top:6px;">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-width:0;">
                          <span class="small" style="font-weight:500;">${escapeHtml(sd.deckSnapshot.deckName)}</span>
                          ${renderBadgePills(badgeEditId === sd.id ? pendingBadges : (sd.deckSnapshot.badges || []), badgeEditId === sd.id)}
                        </div>
                        <div style="display:flex; gap:4px; flex-shrink:0;">
                          <button type="button" class="small" style="padding:3px 8px; font-size:0.8rem;"
                            data-badge-edit="${escapeHtml(sd.id)}">Badges</button>
                          <button type="button" class="danger small" style="padding:3px 8px; font-size:0.8rem;"
                            data-delete-shared="${escapeHtml(sd.id)}">Remove</button>
                        </div>
                      </div>
                      ${badgeEditId === sd.id ? renderBadgeEditor(pendingBadges, visibleBadgeSlots) : ""}
                    </div>
                  `).join("")}
              </div>
            </div>
          </details>
        </div>
      </section>
    `;

    // Re-apply in-place search filters after render
    const stuQ = stf.query.toLowerCase();
    if (stuQ) {
      appEl.querySelector("#cls-stu-list")?.querySelectorAll("[data-name]").forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(stuQ) ? "" : "none";
      });
    }
    const sdQ = sdf.query.toLowerCase();
    if (sdQ) {
      appEl.querySelector("#cls-sd-list")?.querySelectorAll("[data-name]").forEach(el => {
        el.style.display = el.dataset.name.toLowerCase().includes(sdQ) ? "" : "none";
      });
    }

    // ── Custom deck picker ───────────────────────────────────────────────────
    appEl.querySelector("#cls-deck-trigger")?.addEventListener("click", () => {
      df.open = !df.open;
      const panel   = appEl.querySelector("#cls-deck-panel");
      const chevron = appEl.querySelector("#cls-deck-chevron");
      if (panel)   panel.style.display = df.open ? "block" : "none";
      if (chevron) chevron.textContent  = df.open ? "▴" : "▾";
      if (df.open) appEl.querySelector("#cls-deck-search")?.focus();
    });

    document.addEventListener("click", function closePicker(e) {
      const picker = appEl.querySelector("#cls-deck-picker");
      if (!picker) { document.removeEventListener("click", closePicker); return; }
      if (!picker.contains(e.target)) {
        df.open = false;
        const panel   = picker.querySelector("#cls-deck-panel");
        const chevron = picker.querySelector("#cls-deck-chevron");
        if (panel)   panel.style.display = "none";
        if (chevron) chevron.textContent  = "▾";
      }
    });

    appEl.querySelector("#cls-deck-panel")?.addEventListener("click", e => {
      const opt = e.target.closest(".cls-deck-option");
      if (!opt) return;
      df.selected = opt.dataset.deckId;
      df.open = false;
      const hidden  = appEl.querySelector("#deck-select-val");
      const label   = appEl.querySelector("#cls-deck-label");
      const panel   = appEl.querySelector("#cls-deck-panel");
      const chevron = appEl.querySelector("#cls-deck-chevron");
      if (hidden)  hidden.value        = opt.dataset.deckId;
      if (label)   label.textContent   = opt.dataset.deckTitle;
      if (chevron) chevron.textContent  = "▾";
      if (panel) {
        panel.style.display = "none";
        panel.querySelectorAll(".cls-deck-option").forEach(el => {
          const sel = el.dataset.deckId === df.selected;
          el.style.background = sel ? "var(--primary-light,#eff6ff)" : "";
          el.style.fontWeight = sel ? "500" : "";
        });
      }
    });

    appEl.querySelector("#cls-deck-search")?.addEventListener("input", e => {
      df.query = e.target.value;
      const q = df.query.toLowerCase();
      appEl.querySelector("#cls-deck-panel")?.querySelectorAll(".cls-deck-option").forEach(el => {
        el.style.display = !q || el.dataset.deckTitle.toLowerCase().includes(q) ? "" : "none";
      });
    });

    appEl.querySelector("#cls-deck-sort")?.addEventListener("change", e => {
      df.sort = e.target.value;
      render();
    });

    // ── Student controls ─────────────────────────────────────────────────────
    appEl.querySelector("#addStudentBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#studentEmailInput");
      const email = input?.value?.trim();
      if (!email) return;
      const added = await addStudentToClass(classId, email);
      if (input) input.value = "";
      setMessage(added ? "Student added." : "Student already in this class.");
      await render();
    });

    appEl.querySelector("#studentEmailInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") appEl.querySelector("#addStudentBtn")?.click();
    });

    appEl.querySelector("#cls-stu-search")?.addEventListener("input", e => {
      stf.query = e.target.value;
      const q = stf.query.toLowerCase();
      appEl.querySelector("#cls-stu-list")?.querySelectorAll("[data-name]").forEach(el => {
        el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? "" : "none";
      });
    });

    appEl.querySelector("#cls-stu-sort")?.addEventListener("change", e => {
      stf.sort = e.target.value;
      render();
    });

    // ── Shared deck controls ─────────────────────────────────────────────────
    appEl.querySelector("#shareBtn")?.addEventListener("click", async () => {
      const deckId = appEl.querySelector("#deck-select-val")?.value;
      if (!deckId) {
        setMessage("Please select a deck to share.", "error");
        await render();
        return;
      }
      const deck = await getDeck(currentUser.id, deckId);
      if (!deck || !deck.cards || deck.cards.length === 0) {
        setMessage("That deck has no cards to share.", "error");
        await render();
        return;
      }
      const shareResult = await shareDeckToClass(currentUser.id, classId, {
        cards: deck.cards,
        deckName: deck.title || "My deck",
        deckId: deck.id,
      });
      setMessage(shareResult?.isNew === false
        ? `"${deck.title}" is already shared to this class.`
        : `"${deck.title}" shared to class.`);
      await render();
    });

    appEl.querySelector("#cls-sd-search")?.addEventListener("input", e => {
      sdf.query = e.target.value;
      const q = sdf.query.toLowerCase();
      appEl.querySelector("#cls-sd-list")?.querySelectorAll("[data-name]").forEach(el => {
        el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? "" : "none";
      });
    });

    appEl.querySelector("#cls-sd-sort")?.addEventListener("change", e => {
      sdf.sort = e.target.value;
      render();
    });

    // ── Delegated: remove student / delete shared deck / badge editor ────────
    appEl.querySelector("section")?.addEventListener("click", async (e) => {
      const removeStudentId = e.target?.getAttribute("data-remove-student");
      if (removeStudentId) {
        await removeStudentFromClass(classId, removeStudentId);
        setMessage("Student removed.");
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

      // Open badge editor for a shared deck
      const badgeEditTarget = e.target?.getAttribute("data-badge-edit");
      if (badgeEditTarget) {
        const sd = sharedDecks.find(d => d.id === badgeEditTarget);
        badgeEditId       = badgeEditTarget;
        pendingBadges     = JSON.parse(JSON.stringify(sd?.deckSnapshot?.badges || []));
        visibleBadgeSlots = Math.max(1, pendingBadges.length);
        await render();
        return;
      }

      // Delete a pending badge by index — X button on pill
      const deletePendingIdx = e.target?.closest("[data-badge-delete-pending]")
        ?.getAttribute("data-badge-delete-pending");
      if (deletePendingIdx !== null && deletePendingIdx !== undefined) {
        pendingBadges.splice(Number(deletePendingIdx), 1);
        visibleBadgeSlots = Math.max(1, pendingBadges.length);
        await render();
        return;
      }

      // Reveal second badge input row
      if (e.target?.closest("[data-badge-add-slot]")) {
        visibleBadgeSlots = 2;
        await render();
        return;
      }

      // Save badges to the store — read only visible slots
      if (e.target?.closest("[data-badge-save]")) {
        const saved = Array.from({ length: visibleBadgeSlots }, (_, i) => ({
          label: (appEl.querySelector(`#badge-label-${i}`)?.value || "").trim().slice(0, 20),
          color: appEl.querySelector(`#badge-color-${i}`)?.value || "#3b82f6",
        })).filter(b => b.label !== "");
        await updateSharedDeckBadges(badgeEditId, saved);
        badgeEditId       = null;
        pendingBadges     = [];
        visibleBadgeSlots = 1;
        setMessage("Badges saved.");
        await render();
        return;
      }

      // Cancel badge editing
      if (e.target?.closest("[data-badge-cancel]")) {
        badgeEditId       = null;
        pendingBadges     = [];
        visibleBadgeSlots = 1;
        await render();
        return;
      }
    });
  }

  await render();
}
