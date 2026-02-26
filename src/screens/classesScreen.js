/**
 * Teacher UI: org/class management + deck assignment using Supabase classes store.
 * When store is stub (Supabase not configured / not signed in), shows "Supabase required for Classes."
 */

import { getClassesStore } from "../classes/classesStore.js";
import { escapeHtml } from "../utils.js";

/** Convert Supabase card row to study screen shape (id, front, back, stage, stage3Mastered, lastSeenAt). */
function toStudyCard(row) {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    front: row.front ?? "",
    back: row.back ?? "",
    stage: meta.stage ?? 1,
    stage3Mastered: meta.stage3Mastered ?? false,
    longAnswer: meta.longAnswer,
    lastSeenAt: meta.lastSeenAt ?? null,
  };
}

export async function renderClassesScreen(appEl, { setScreen, renderAll, startAssignedDeckStudy }) {
  const store = await getClassesStore();
  if (store.isStub) {
    appEl.innerHTML = `
      <section class="card" style="max-width:480px; margin:0 auto;">
        <h2 style="margin:0; text-align:center;">Classes</h2>
        <p class="sub" style="text-align:center; margin-top:16px;">Supabase required for Classes.</p>
        <p class="small" style="text-align:center; margin-top:8px; color:var(--muted);">Sign in with Supabase and ensure the orgs/classes schema is applied to use this screen.</p>
      </section>
    `;
    return;
  }

  let selectedOrgId = null;
  let selectedClassId = null;
  let message = "";
  let messageType = ""; // 'success' | 'error'
  let orgs = [];
  let classes = [];
  let myDecks = [];
  let myRoleInOrg = null;
  let assignedDecks = [];
  const deckTitleCache = new Map(); // deckId -> { id, title, created_at } | null

  async function load() {
    orgs = await store.listMyOrgs();
    classes = selectedOrgId ? await store.listClasses(selectedOrgId) : [];
    myRoleInOrg = selectedOrgId ? await store.getMyRoleInOrg(selectedOrgId) : null;
    myDecks = await store.listMyDecks();
    assignedDecks = await store.listAssignedDecksForMe();
    for (const a of assignedDecks) {
      const deckId = a.deck_id ?? a.deckId;
      if (deckId && !deckTitleCache.has(deckId)) {
        const deck = await store.getDeck(deckId);
        deckTitleCache.set(deckId, deck);
      }
    }
  }

  function setMessage(text, type) {
    message = text;
    messageType = type || "success";
  }

  async function render() {
    await load();

    const selectedOrg = orgs.find((o) => o.id === selectedOrgId);
    const selectedClass = classes.find((c) => c.id === selectedClassId);

    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">Classes</h2>
        ${message ? `<div class="auth-status auth-status-${messageType}" style="margin-top:12px;">${escapeHtml(message)}</div>` : ""}
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:16px; margin-top:16px; align-items:start;">
          <div>
            <h3 style="font-size:14px; margin:0 0 8px;">Organizations</h3>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
              <input type="text" id="newOrgName" placeholder="Org name" style="flex:1; padding:8px;" />
              <button type="button" class="primary" id="createOrgBtn">Create</button>
            </div>
            <ul id="orgList" style="list-style:none; margin:0; padding:0;">
              ${orgs.map((o) => `<li style="margin-bottom:4px;"><button type="button" class="small ${selectedOrgId === o.id ? "active" : ""}" data-org-id="${escapeHtml(o.id)}">${escapeHtml(o.name)}</button></li>`).join("")}
            </ul>
            ${selectedOrg && myRoleInOrg ? `<p class="small" style="margin-top:8px; color:var(--muted);">Your role: ${escapeHtml(myRoleInOrg)}</p>` : ""}
          </div>
          <div>
            <h3 style="font-size:14px; margin:0 0 8px;">Classes</h3>
            ${selectedOrgId ? `
              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <input type="text" id="newClassName" placeholder="Class name" style="flex:1; padding:8px;" />
                <button type="button" class="primary" id="createClassBtn">Create</button>
              </div>
              <ul id="classList" style="list-style:none; margin:0; padding:0;">
                ${classes.map((c) => `<li style="margin-bottom:4px;"><button type="button" class="small ${selectedClassId === c.id ? "active" : ""}" data-class-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button></li>`).join("")}
              </ul>
            ` : `<p class="small" style="color:var(--muted);">Select an org</p>`}
          </div>
          <div>
            <h3 style="font-size:14px; margin:0 0 8px;">Class actions</h3>
            ${selectedClassId ? `
              <div style="margin-bottom:12px;">
                <label class="label" style="display:block; margin-bottom:4px;">Add student (user ID)</label>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="studentUserId" placeholder="User UUID" style="flex:1; padding:8px;" />
                  <button type="button" class="primary" id="addStudentBtn">Add</button>
                </div>
              </div>
              <div>
                <label class="label" style="display:block; margin-bottom:4px;">Assign deck</label>
                <div style="display:flex; gap:8px;">
                  <select id="deckSelect" style="flex:1; padding:8px;">
                    <option value="">Choose a deck...</option>
                    ${myDecks.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title || "Untitled")}</option>`).join("")}
                  </select>
                  <button type="button" class="primary" id="assignDeckBtn">Assign</button>
                </div>
              </div>
            ` : `<p class="small" style="color:var(--muted);">Select a class</p>`}
          </div>
        </div>
        <div style="margin-top:24px; padding-top:24px; border-top:1px solid var(--border, #eee);">
          <h3 style="font-size:14px; margin:0 0 8px;">My Assigned Decks</h3>
          ${assignedDecks.length === 0
            ? `<p class="small" style="color:var(--muted);">No decks assigned to you.</p>`
            : `<ul id="assignedDecksList" style="list-style:none; margin:0; padding:0;">
                ${assignedDecks.map((a) => {
                  const deckId = a.deck_id ?? a.deckId;
                  const deck = deckTitleCache.get(deckId);
                  const title = deck?.title ?? "Deck";
                  const className = a.class_name ?? a.className ?? "";
                  return `<li style="display:flex; align-items:center; gap:12px; margin-bottom:8px; flex-wrap:wrap;">
                    <span style="flex:1; min-width:120px;">${escapeHtml(title)}${className ? ` <span class="small" style="color:var(--muted);">(${escapeHtml(className)})</span>` : ""}</span>
                    <button type="button" class="primary small" data-study-deck-id="${escapeHtml(deckId)}">Study</button>
                  </li>`;
                }).join("")}
              </ul>`}
        </div>
      </section>
    `;

    appEl.querySelector("#createOrgBtn")?.addEventListener("click", async () => {
      const input = appEl.querySelector("#newOrgName");
      const name = input?.value?.trim();
      if (!name) return;
      try {
        await store.createOrg(name);
        setMessage("Org created.");
        input.value = "";
        await render();
      } catch (e) {
        setMessage(e?.message ?? "Failed to create org", "error");
        await render();
      }
    });

    appEl.querySelector("#orgList")?.addEventListener("click", (e) => {
      const id = e.target?.getAttribute("data-org-id");
      if (id) {
        selectedOrgId = id;
        selectedClassId = null;
        render();
      }
    });

    appEl.querySelector("#createClassBtn")?.addEventListener("click", async () => {
      if (!selectedOrgId) return;
      const input = appEl.querySelector("#newClassName");
      const name = input?.value?.trim();
      if (!name) return;
      try {
        await store.createClass(selectedOrgId, name);
        setMessage("Class created.");
        input.value = "";
        await render();
      } catch (e) {
        setMessage(e?.message ?? "Failed to create class", "error");
        await render();
      }
    });

    appEl.querySelector("#classList")?.addEventListener("click", (e) => {
      const id = e.target?.getAttribute("data-class-id");
      if (id) {
        selectedClassId = id;
        render();
      }
    });

    appEl.querySelector("#addStudentBtn")?.addEventListener("click", async () => {
      if (!selectedClassId) return;
      const input = appEl.querySelector("#studentUserId");
      const studentUserId = input?.value?.trim();
      if (!studentUserId) return;
      const result = await store.addStudentToClass(selectedClassId, studentUserId);
      if (result?.error) {
        setMessage(result.error, "error");
      } else {
        setMessage("Student added to class.");
        input.value = "";
      }
      await render();
    });

    const assignDeckBtn = appEl.querySelector("#assignDeckBtn");
    const deckSelect = appEl.querySelector("#deckSelect");
    if (assignDeckBtn && deckSelect) {
      assignDeckBtn.disabled = !deckSelect.value;
      deckSelect.addEventListener("change", () => {
        assignDeckBtn.disabled = !deckSelect.value;
      });
    }
    appEl.querySelector("#assignDeckBtn")?.addEventListener("click", async () => {
      if (!selectedClassId) return;
      const select = appEl.querySelector("#deckSelect");
      const deckId = select?.value?.trim();
      if (!deckId) return;
      const result = await store.assignDeckToClass(selectedClassId, deckId);
      if (result?.error) {
        setMessage(result.error, "error");
      } else {
        setMessage("Deck assigned to class.");
        select.value = "";
      }
      await render();
    });

    appEl.querySelector("#assignedDecksList")?.addEventListener("click", async (e) => {
      const deckId = e.target?.getAttribute("data-study-deck-id");
      if (!deckId || !startAssignedDeckStudy) return;
      try {
        const rows = await store.listCardsForDeck(deckId);
        const cards = rows.map(toStudyCard);
        startAssignedDeckStudy({ deckId, cards });
      } catch (err) {
        setMessage(err?.message ?? "Failed to load deck", "error");
        await render();
      }
    });
  }

  await render();
}
