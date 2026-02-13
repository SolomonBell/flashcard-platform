import {
  getClassesByTeacher,
  getClassesByStudent,
  getClassById,
  createClass,
  updateClass,
  deleteClass,
  addStudentToClass,
  removeStudentFromClass,
  addInvitedEmail,
  removeInvitedEmail,
  validateEmailDomain,
} from "./classesStore.js";
import { getUserByEmail, loadUsers } from "../authStore.js";
import {
  getSharedDecksByClass,
  shareDeckToClass,
  deleteSharedDeck,
  getSharedDecksForStudent,
} from "./sharedDecksStore.js";
import { loadStateForUser } from "../state.js";
import { getAllAnalytics } from "../analytics/analyticsStore.js";
import { getAllSharedProgress } from "./sharedDecksStore.js";
import {
  useSupabaseClasses,
  getClassTeachers,
  addTeacherToClass,
  removeTeacherFromClass,
  getOrganizationsForUser,
  getOrgMembers,
  setOrgMemberRole,
} from "./classesSupabase.js";

export function renderClassesScreen(appEl, { currentUser, state, setScreen, save, renderAll }) {
  const classView = state.classView || "home";
  const classId = state.classId || null;
  const orgView = state.orgView || false;

  if (orgView) {
    renderOrganizationScreen(appEl, { currentUser, state, setScreen, save, renderAll });
  } else if (classView === "create") {
    renderCreateClassForm(appEl, { currentUser, state, setScreen, save, renderAll });
  } else if (classView === "detail" && classId) {
    renderClassDetail(appEl, { currentUser, classId, state, setScreen, save, renderAll });
  } else {
    renderClassesHome(appEl, { currentUser, state, setScreen, save, renderAll });
  }
}

function renderClassesHome(appEl, { currentUser, state, setScreen, save, renderAll }) {
  const isTeacher = currentUser.role === "teacher";
  const classes = isTeacher
    ? getClassesByTeacher(currentUser.id)
    : getClassesByStudent(currentUser.id);
  
  // For students, show class decks
  const sharedDecks = isTeacher ? [] : getSharedDecksForStudent(currentUser.id);

  appEl.innerHTML = `
    <section class="card">
      <h2 style="margin:0; text-align:center;">Classes</h2>
      
      ${isTeacher ? `
        <div class="btns" style="margin-top:16px; justify-content:center;">
          <button class="primary" id="createClassBtn">Create Class</button>
          <button class="small" id="orgAdminBtn" style="display:none;">Organization</button>
        </div>
      ` : ""}
      
      ${!isTeacher && sharedDecks.length > 0 ? `
        <hr style="margin-top:16px;" />
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Class Decks</h3>
        <div style="margin-top:8px;">
          ${sharedDecks.map(sharedDeck => `
            <div class="cardRow" style="margin-top:${sharedDecks.indexOf(sharedDeck) === 0 ? '0' : '8px'};">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong>${escapeHtml(sharedDeck.deckSnapshot.deckName)}</strong>
                  <div class="small" style="margin-top:4px;">
                    ${sharedDeck.deckSnapshot.cards.length} cards
                  </div>
                </div>
                <button class="primary" data-shared-deck-id="${sharedDeck.id}">Study</button>
              </div>
            </div>
          `).join("")}
        </div>
        <hr style="margin-top:16px;" />
      ` : ""}
      
      ${classes.length === 0 ? `
        <p class="sub" style="text-align:center; margin-top:16px;">
          ${isTeacher ? "No classes yet. Create one to get started." : "You are not enrolled in any classes."}
        </p>
      ` : `
        <div style="margin-top:16px;">
          ${classes.map(c => `
            <div class="cardRow" style="margin-top:${classes.indexOf(c) === 0 ? '0' : '12px'};">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong>${escapeHtml(c.name)}</strong>
                  ${c.allowedDomains && c.allowedDomains.length > 0 ? `
                    <div class="small" style="margin-top:4px;">
                      Domains: ${escapeHtml(c.allowedDomains.join(", "))}
                    </div>
                  ` : ""}
                </div>
                <button class="primary" data-class-id="${c.id}">View</button>
              </div>
            </div>
          `).join("")}
        </div>
      `}
      
      <div class="btns" style="margin-top:16px; justify-content:center;">
        <button id="backToCreate">Back</button>
      </div>
    </section>
  `;

  // Handle shared deck study for students
  if (!isTeacher) {
    appEl.querySelectorAll("button[data-shared-deck-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const sharedDeckId = btn.getAttribute("data-shared-deck-id");
        state.sharedDeckId = sharedDeckId;
        state.screen = "sharedStudy";
        save();
        renderAll();
      });
    });
  }

  if (isTeacher) {
    appEl.querySelector("#createClassBtn")?.addEventListener("click", () => {
      state.classView = "create";
      save();
      renderAll();
    });
  }

  (async () => {
    const useSupabase = await useSupabaseClasses();
    const orgs = useSupabase ? await getOrganizationsForUser() : [];
    const isOrgAdmin = orgs.some((o) => o.role === "admin");
    const orgBtn = appEl.querySelector("#orgAdminBtn");
    if (orgBtn) {
      if (useSupabase && isOrgAdmin) {
        orgBtn.style.display = "";
        orgBtn.addEventListener("click", () => {
          state.orgView = true;
          save();
          renderAll();
        });
      } else orgBtn.style.display = "none";
    }
  })();

  appEl.querySelectorAll("button[data-class-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-class-id");
      state.classView = "detail";
      state.classId = id;
      save();
      renderAll();
    });
  });

  appEl.querySelector("#backToCreate")?.addEventListener("click", () => {
    state.classView = "home";
    state.classId = null;
    setScreen("create");
    save();
    renderAll();
  });
}

function renderCreateClassForm(appEl, { currentUser, state, setScreen, save, renderAll }) {
  let errorMessage = "";

  function render() {
    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">Create Class</h2>
        
        ${errorMessage ? `
          <div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">
            ${errorMessage}
          </div>
        ` : ""}
        
        <form id="createClassForm" style="margin-top:16px;">
          <label class="label" for="className">Class Name</label>
          <input type="text" id="className" name="className" required style="margin-bottom:12px;" />
          
          <label class="label" for="allowedDomains">
            Allowed Domains (comma-separated, e.g. "bucknell.edu,seattleu.edu")
            <span class="small" style="display:block; margin-top:4px;">Leave empty to allow any email domain</span>
          </label>
          <input type="text" id="allowedDomains" name="allowedDomains" placeholder="bucknell.edu, seattleu.edu" style="margin-bottom:12px;" />
          
          <div class="btns" style="margin-top:16px;">
            <button type="submit" class="primary">Create</button>
            <button type="button" id="cancelCreate">Cancel</button>
          </div>
        </form>
      </section>
    `;

    const form = appEl.querySelector("#createClassForm");
    const cancelBtn = appEl.querySelector("#cancelCreate");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      errorMessage = "";

      const name = form.className.value.trim();
      const domainsInput = form.allowedDomains.value.trim();

      if (!name) {
        errorMessage = "Class name is required.";
        render();
        return;
      }

      const allowedDomains = domainsInput
        ? domainsInput.split(",").map(d => d.trim()).filter(d => d.length > 0)
        : [];

      const newClass = createClass(currentUser.id, name, allowedDomains);
      state.classView = "detail";
      state.classId = newClass.id;
      save();
      renderAll();
    });

    cancelBtn.addEventListener("click", () => {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
    });
  }

  render();
}

function renderClassDetail(appEl, { currentUser, classId, state, setScreen, save, renderAll }) {
  let errorMessage = "";

  function render() {
    // Reload class data and users on each render to ensure fresh data
    const classObj = getClassById(classId);
    if (!classObj) {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
      return;
    }

    const isTeacher = currentUser.role === "teacher" && classObj.teacherId === currentUser.id;
    const allUsers = loadUsers();
    const enrolledStudents = classObj.studentIds
      .map(id => allUsers.find(u => u.id === id))
      .filter(Boolean);

    const sharedDecks = getSharedDecksByClass(classId);
    const teacherState = isTeacher ? loadStateForUser(currentUser.id) : null;
    const teacherDecks = teacherState && teacherState.cards && teacherState.cards.length > 0
      ? teacherState.cards.filter(c => c.front.trim() && c.back.trim())
      : [];

    const tab = state.classDetailTab || "roster";
    const analytics = getAllAnalytics();
    const sharedProgress = getAllSharedProgress();

    function getAggregate(userId, deckId) {
      return analytics.aggregates?.[userId]?.[deckId] || null;
    }

    function getProgress(userId, deckId) {
      return (sharedProgress || []).find(p => p.sharedDeckId === deckId && p.studentId === userId) || null;
    }

    const sharedDeckIds = sharedDecks.map(d => d.id);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    function formatMinutes(ms = 0) {
      return ((ms || 0) / 60000).toFixed(1);
    }

    function renderRosterSection() {
      return `
        ${isTeacher ? `
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Add Student</h3>
          ${errorMessage ? `
            <div style="color:#dc2626; font-size:13px; margin-top:8px; padding:8px; background:#fff1f2; border:1px solid #fecdd3; border-radius:8px;">
              ${errorMessage}
            </div>
          ` : ""}
          <form id="addStudentForm" style="margin-top:8px;">
            <div style="display:flex; gap:8px;">
              <input type="email" id="studentEmail" name="studentEmail" placeholder="student@example.com" required style="flex:1;" />
              <button type="submit" class="primary">Add</button>
            </div>
          </form>
          <hr style="margin-top:16px;" />
        ` : ""}
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Enrolled Students</h3>
        ${enrolledStudents.length === 0 ? `
          <p class="small" style="margin-top:8px;">No enrolled students yet.</p>
        ` : `
          <div style="margin-top:8px;">
            ${enrolledStudents.map(s => `
              <div class="cardRow" style="margin-top:${enrolledStudents.indexOf(s) === 0 ? '0' : '8px'};">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span>${escapeHtml(s.email)}</span>
                  ${isTeacher ? `<button class="danger" data-remove-student-id="${s.id}">Remove</button>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        `}
        ${isTeacher ? `
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Invited Emails</h3>
          ${classObj.invitedEmails.length === 0 ? `
            <p class="small" style="margin-top:8px;">No pending invitations.</p>
          ` : `
            <div style="margin-top:8px;">
              ${classObj.invitedEmails.map(email => `
                <div class="cardRow" style="margin-top:${classObj.invitedEmails.indexOf(email) === 0 ? '0' : '8px'};">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${escapeHtml(email)}</span>
                    <button class="danger" data-remove-email="${escapeHtml(email)}">Remove</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        ` : ""}
        ${isTeacher ? `
          <hr style="margin-top:16px;" />
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Teachers</h3>
          <div id="teachersSection">
            <p class="small" style="margin-top:8px;">Loading…</p>
          </div>
          <form id="addTeacherForm" style="margin-top:8px; display:none;">
            <div style="display:flex; gap:8px;">
              <input type="email" id="teacherEmail" placeholder="teacher@example.com" style="flex:1;" />
              <button type="submit" class="primary">Add teacher</button>
            </div>
          </form>
        ` : ""}
      `;
    }

    function renderSharedSection() {
      return `
        ${isTeacher ? `
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Shared Decks</h3>
          ${sharedDecks.length === 0 ? `
            <p class="small" style="margin-top:8px;">No decks shared yet.</p>
          ` : `
            <div style="margin-top:8px;">
              ${sharedDecks.map(sharedDeck => `
                <div class="cardRow" style="margin-top:${sharedDecks.indexOf(sharedDeck) === 0 ? '0' : '8px'};">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <strong>${escapeHtml(sharedDeck.deckSnapshot.deckName)}</strong>
                      <div class="small" style="margin-top:4px;">
                        ${sharedDeck.deckSnapshot.cards.length} cards
                      </div>
                    </div>
                    <button class="danger" data-remove-shared-deck="${sharedDeck.id}">Remove</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
          <hr style="margin-top:16px;" />
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Share a deck to this class</h3>
          ${teacherDecks.length === 0 ? `
            <p class="small" style="margin-top:8px;">Create a deck first, then come back to share it.</p>
          ` : `
            <form id="shareDeckForm" style="margin-top:8px;">
              <label class="label" for="deckSelect">Select Deck</label>
              <select id="deckSelect" required style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:8px;">
                <option value="">Choose a deck...</option>
                ${teacherDecks.map((card, idx) => {
                  const deckName = `Deck ${idx + 1} (${teacherState.cards.filter(c => c.front.trim() && c.back.trim()).length} cards)`;
                  return `<option value="${idx}">${escapeHtml(deckName)}</option>`;
                }).join("")}
              </select>
              <button type="submit" class="primary">Share</button>
            </form>
          `}
        ` : `
          <p class="small" style="margin-top:8px;">Shared decks are managed by the teacher.</p>
        `}
      `;
    }

    function computeStatus(counts) {
      const total = counts.total || 0;
      if (!total) return "Not started";
      const pct3 = ((counts.s3 + counts.s3m) / Math.max(1, total)) * 100;
      if (pct3 >= 90) return "Completed";
      return "In progress";
    }

    function renderAnalyticsSection() {
      if (!isTeacher) return `<p class="small" style="margin-top:8px;">Analytics available to teachers only.</p>`;

      const aggregates = analytics.aggregates || {};
      const sessions = analytics.sessions || [];
      const totalStudents = enrolledStudents.length;
      const activeStudentIds = new Set(
        sessions
          .filter(s => s.deckContext === "shared" && sharedDeckIds.includes(s.deckId) && s.endedAt && s.endedAt >= sevenDaysAgo && classObj.studentIds.includes(s.userId))
          .map(s => s.userId)
      );
      const activeStudents = activeStudentIds.size;

      let totalTimeMs = 0;
      let totalStageCards = 0;
      let stage2Plus = 0;
      let stage3 = 0;
      let mastered = 0;
      let notStarted = 0;
      let inProgress = 0;
      let completed = 0;

      enrolledStudents.forEach(student => {
        sharedDeckIds.forEach(deckId => {
          const agg = getAggregate(student.id, deckId);
          if (agg) totalTimeMs += agg.totalTimeMs || 0;
          const prog = getProgress(student.id, deckId);
          let counts = null;
          if (prog?.cards?.length) {
            counts = {
              s1: prog.cards.filter(c => c.stage === 1).length,
              s2: prog.cards.filter(c => c.stage === 2).length,
              s3: prog.cards.filter(c => c.stage === 3 && !c.stage3Mastered).length,
              s3m: prog.cards.filter(c => c.stage === 3 && c.stage3Mastered).length,
            };
            counts.total = prog.cards.length;
          } else if (agg?.latestStageDistribution) {
            const dist = agg.latestStageDistribution;
            counts = {
              s1: dist.stage1Count,
              s2: dist.stage2Count,
              s3: dist.stage3Count,
              s3m: dist.stage3MasteredCount,
              total: dist.stage1Count + dist.stage2Count + dist.stage3Count + dist.stage3MasteredCount,
            };
          }
          if (counts) {
            totalStageCards += counts.total;
            stage2Plus += counts.s2 + counts.s3 + counts.s3m;
            stage3 += counts.s3 + counts.s3m;
            mastered += counts.s3m;
            const status = computeStatus(counts);
            if (status === "Completed") completed += 1;
            else inProgress += 1;
          } else {
            notStarted += 1;
          }
        });
      });

      const avgTimeMinutes = totalStudents > 0 ? (totalTimeMs / totalStudents) / 60000 : 0;
      const pctStage2Plus = totalStageCards > 0 ? (stage2Plus / totalStageCards) * 100 : 0;
      const pctStage3 = totalStageCards > 0 ? (stage3 / totalStageCards) * 100 : 0;
      const pctMastered = totalStageCards > 0 ? (mastered / totalStageCards) * 100 : 0;

      const selectedDeckId = state.classAnalyticsDeckId && sharedDeckIds.includes(state.classAnalyticsDeckId)
        ? state.classAnalyticsDeckId
        : (sharedDeckIds[0] || null);

      function renderDeckAnalytics() {
        if (!selectedDeckId) return `<p class="small" style="margin-top:8px;">No shared decks yet.</p>`;
        const studentsCount = enrolledStudents.length || 1;
        let deckTimeMs = 0;
        let totals = { s1: 0, s2: 0, s3: 0, s3m: 0, total: 0 };
        const rows = enrolledStudents.map(student => {
          const agg = getAggregate(student.id, selectedDeckId);
          deckTimeMs += agg?.totalTimeMs || 0;
          const prog = getProgress(student.id, selectedDeckId);
          let counts = { s1: 0, s2: 0, s3: 0, s3m: 0, total: 0 };
          if (prog?.cards?.length) {
            counts = {
              s1: prog.cards.filter(c => c.stage === 1).length,
              s2: prog.cards.filter(c => c.stage === 2).length,
              s3: prog.cards.filter(c => c.stage === 3 && !c.stage3Mastered).length,
              s3m: prog.cards.filter(c => c.stage === 3 && c.stage3Mastered).length,
              total: prog.cards.length,
            };
          } else if (agg?.latestStageDistribution) {
            const dist = agg.latestStageDistribution;
            counts = {
              s1: dist.stage1Count,
              s2: dist.stage2Count,
              s3: dist.stage3Count,
              s3m: dist.stage3MasteredCount,
              total: dist.stage1Count + dist.stage2Count + dist.stage3Count + dist.stage3MasteredCount,
            };
          }
          totals.s1 += counts.s1;
          totals.s2 += counts.s2;
          totals.s3 += counts.s3;
          totals.s3m += counts.s3m;
          totals.total += counts.total;
          const total = counts.total || 1;
          const pct2plus = ((counts.s2 + counts.s3 + counts.s3m) / total) * 100;
          const pct3 = ((counts.s3 + counts.s3m) / total) * 100;
          const lastStudied = agg?.lastStudiedAt ? new Date(agg.lastStudiedAt).toLocaleDateString() : "—";
          const status = computeStatus(counts);
          return `
            <div class="cardRow" style="margin-top:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong>${escapeHtml(student.email)}</strong>
                  <div class="small" style="margin-top:4px;">Last studied: ${lastStudied}</div>
                </div>
                <div class="small" style="text-align:right;">
                  Time: ${formatMinutes(agg?.totalTimeMs)} min<br/>
                  Stage2+: ${pct2plus.toFixed(0)}%<br/>
                  Stage3: ${pct3.toFixed(0)}%<br/>
                  Status: ${status}
                </div>
              </div>
            </div>
          `;
        }).join("");

        const avgDeckTime = (deckTimeMs / studentsCount) / 60000;
        const total = totals.total || 1;
        const deckStage2plusPct = ((totals.s2 + totals.s3 + totals.s3m) / total) * 100;
        const deckStage3Pct = ((totals.s3 + totals.s3m) / total) * 100;
        const deckMasteredPct = (totals.s3m / total) * 100;

        return `
          <label class="label" for="deckAnalyticsSelect" style="margin-top:12px;">Select Deck</label>
          <select id="deckAnalyticsSelect" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:12px;">
            ${sharedDecks.map(d => `
              <option value="${d.id}" ${d.id === selectedDeckId ? "selected" : ""}>${escapeHtml(d.deckSnapshot.deckName)}</option>
            `).join("")}
          </select>
          <div class="deckStats" style="margin-top:8px;">
            <div><strong>Avg time:</strong> ${avgDeckTime.toFixed(1)} min</div>
            <div><strong>Stage2+:</strong> ${deckStage2plusPct.toFixed(0)}%</div>
            <div><strong>Stage3:</strong> ${deckStage3Pct.toFixed(0)}%</div>
            <div><strong>Mastered:</strong> ${deckMasteredPct.toFixed(0)}%</div>
          </div>
          <div style="margin-top:12px;">${rows || `<p class="small">No data yet.</p>`}</div>
        `;
      }

      const selectedStudentId = state.classAnalyticsStudentId && classObj.studentIds.includes(state.classAnalyticsStudentId)
        ? state.classAnalyticsStudentId
        : (enrolledStudents[0]?.id || null);

      function renderStudentAnalytics() {
        if (!selectedStudentId) return `<p class="small" style="margin-top:8px;">No students enrolled.</p>`;
        const student = enrolledStudents.find(s => s.id === selectedStudentId);
        let totalTimeMsStudent = 0;
        const rows = sharedDecks.map(deck => {
          const agg = getAggregate(student.id, deck.id);
          totalTimeMsStudent += agg?.totalTimeMs || 0;
          const prog = getProgress(student.id, deck.id);
          let counts = { s1: 0, s2: 0, s3: 0, s3m: 0, total: 0 };
          if (prog?.cards?.length) {
            counts = {
              s1: prog.cards.filter(c => c.stage === 1).length,
              s2: prog.cards.filter(c => c.stage === 2).length,
              s3: prog.cards.filter(c => c.stage === 3 && !c.stage3Mastered).length,
              s3m: prog.cards.filter(c => c.stage === 3 && c.stage3Mastered).length,
              total: prog.cards.length,
            };
          } else if (agg?.latestStageDistribution) {
            const dist = agg.latestStageDistribution;
            counts = {
              s1: dist.stage1Count,
              s2: dist.stage2Count,
              s3: dist.stage3Count,
              s3m: dist.stage3MasteredCount,
              total: dist.stage1Count + dist.stage2Count + dist.stage3Count + dist.stage3MasteredCount,
            };
          }
          const total = counts.total || 1;
          const pct2plus = ((counts.s2 + counts.s3 + counts.s3m) / total) * 100;
          const pct3 = ((counts.s3 + counts.s3m) / total) * 100;
          const lastStudied = agg?.lastStudiedAt ? new Date(agg.lastStudiedAt).toLocaleDateString() : "—";
          const status = computeStatus(counts);
          const atRisk = (!agg?.lastStudiedAt || agg.lastStudiedAt < sevenDaysAgo || pct2plus < 20);
          return `
            <div class="cardRow" style="margin-top:${sharedDecks.indexOf(deck) === 0 ? '0' : '8px'};">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong>${escapeHtml(deck.deckSnapshot.deckName)}</strong>
                  <div class="small" style="margin-top:4px;">Last studied: ${lastStudied}</div>
                </div>
                <div class="small" style="text-align:right;">
                  Time: ${formatMinutes(agg?.totalTimeMs)} min<br/>
                  Stage2+: ${pct2plus.toFixed(0)}%<br/>
                  Stage3: ${pct3.toFixed(0)}%<br/>
                  Status: ${status}${atRisk ? " • At risk" : ""}
                </div>
              </div>
            </div>
          `;
        }).join("");

        return `
          <label class="label" for="studentAnalyticsSelect" style="margin-top:12px;">Select Student</label>
          <select id="studentAnalyticsSelect" style="width:100%; padding:10px 12px; border:1px solid var(--border); border-radius:10px; font-size:14px; margin-bottom:12px;">
            ${enrolledStudents.map(s => `
              <option value="${s.id}" ${s.id === selectedStudentId ? "selected" : ""}>${escapeHtml(s.email)}</option>
            `).join("")}
          </select>
          <div class="deckStats" style="margin-top:8px;">
            <div><strong>Total time:</strong> ${(totalTimeMsStudent/60000).toFixed(1)} min</div>
          </div>
          <div style="margin-top:12px;">${rows || `<p class="small">No data yet.</p>`}</div>
        `;
      }

      // Collect hard cards across all shared decks
      const hardCardsMap = new Map(); // cardSignature -> { front, attempts, incorrectAttempts, wrongRate }
      enrolledStudents.forEach(student => {
        sharedDeckIds.forEach(deckId => {
          const agg = getAggregate(student.id, deckId);
          if (agg?.cardStats) {
            Object.entries(agg.cardStats).forEach(([sig, stats]) => {
              if (!hardCardsMap.has(sig)) {
                hardCardsMap.set(sig, {
                  front: stats.front || "",
                  attempts: 0,
                  incorrectAttempts: 0,
                });
              }
              const entry = hardCardsMap.get(sig);
              entry.attempts += stats.attempts || 0;
              entry.incorrectAttempts += stats.incorrectAttempts || 0;
            });
          }
        });
      });
      
      // Calculate wrong rates and get top 5
      const hardCards = Array.from(hardCardsMap.entries())
        .map(([sig, stats]) => ({
          signature: sig,
          front: stats.front,
          attempts: stats.attempts,
          incorrectAttempts: stats.incorrectAttempts,
          wrongRate: stats.attempts > 0 ? stats.incorrectAttempts / stats.attempts : 0,
        }))
        .filter(c => c.attempts >= 3) // Only show cards with at least 3 attempts
        .sort((a, b) => b.wrongRate - a.wrongRate)
        .slice(0, 5);
      
      function renderHardCards() {
        if (hardCards.length === 0) {
          return `<p class="small" style="margin-top:8px;">No hard cards data yet. Students need to attempt cards at least 3 times.</p>`;
        }
        return hardCards.map(card => {
          const frontText = card.front.length > 60 ? card.front.substring(0, 60) + "..." : card.front;
          const wrongPct = (card.wrongRate * 100).toFixed(0);
          return `
            <div class="cardRow" style="margin-top:${hardCards.indexOf(card) === 0 ? '0' : '8px'};">
              <div>
                <strong>${escapeHtml(frontText)}</strong>
                <div class="small" style="margin-top:4px;">
                  Wrong rate: ${wrongPct}% (${card.incorrectAttempts}/${card.attempts} attempts)
                </div>
              </div>
            </div>
          `;
        }).join("");
      }
      

      return `
        <div class="btns" style="margin-top:8px; justify-content:flex-end;">
          <button type="button" id="exportCSVBtn" class="primary">Export CSV</button>
        </div>
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Class Overview</h3>
        <div class="deckStats" style="margin-top:8px;">
          <div><strong>Total students:</strong> ${totalStudents}</div>
          <div><strong>Active (7d):</strong> ${activeStudents}</div>
          <div><strong>Avg time:</strong> ${avgTimeMinutes.toFixed(1)} min</div>
          <div><strong>Stage2+:</strong> ${pctStage2Plus.toFixed(0)}%</div>
          <div><strong>Stage3:</strong> ${pctStage3.toFixed(0)}%</div>
          <div><strong>Mastered:</strong> ${pctMastered.toFixed(0)}%</div>
        </div>
        <div class="deckStats" style="margin-top:8px;">
          <div><strong>Not started:</strong> ${notStarted}</div>
          <div><strong>In progress:</strong> ${inProgress}</div>
          <div><strong>Completed:</strong> ${completed}</div>
        </div>
        <hr style="margin-top:16px;" />
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Per-Deck</h3>
        ${renderDeckAnalytics()}
        <hr style="margin-top:16px;" />
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Per-Student</h3>
        ${renderStudentAnalytics()}
        <hr style="margin-top:16px;" />
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Hard Cards</h3>
        <p class="small" style="margin-top:4px;">Top 5 cards with highest wrong rates (minimum 3 attempts)</p>
        ${renderHardCards()}
      `;
    }

    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">${escapeHtml(classObj.name)}</h2>
        
        ${classObj.allowedDomains && classObj.allowedDomains.length > 0 ? `
          <p class="sub" style="text-align:center; margin-top:8px;">
            Allowed domains: ${escapeHtml(classObj.allowedDomains.join(", "))}
          </p>
        ` : `
          <p class="sub" style="text-align:center; margin-top:8px;">
            All email domains allowed
          </p>
        `}
        
        <div class="btns" style="margin-top:16px; justify-content:center;">
          <button type="button" data-tab="roster" class="${tab === "roster" ? "primary" : ""}">Roster</button>
          <button type="button" data-tab="shared" class="${tab === "shared" ? "primary" : ""}">Shared Decks</button>
          ${isTeacher ? `<button type="button" data-tab="analytics" class="${tab === "analytics" ? "primary" : ""}">Analytics</button>` : ""}
        </div>
        
        <hr style="margin-top:12px;" />
        
        ${tab === "roster" ? renderRosterSection() : ""}
        ${tab === "shared" ? renderSharedSection() : ""}
        ${tab === "analytics" ? renderAnalyticsSection() : ""}
        
        <div class="btns" style="margin-top:16px; justify-content:center;">
          <button type="button" id="backToClasses">Back to Classes</button>
        </div>
      </section>
    `;

    // Handle tab switching
    appEl.querySelectorAll("button[data-tab]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const tabValue = btn.getAttribute("data-tab");
        state.classDetailTab = tabValue;
        save();
        renderAll();
      });
    });

    if (isTeacher) {
      const addForm = appEl.querySelector("#addStudentForm");
      addForm.addEventListener("submit", (e) => {
        e.preventDefault();
        errorMessage = "";

        const email = addForm.studentEmail.value.trim().toLowerCase();

        if (!email) {
          errorMessage = "Email is required.";
          render();
          return;
        }

        // Reload class to get current state
        const currentClass = getClassById(classId);
        if (!currentClass) {
          state.classView = "home";
          state.classId = null;
          save();
          renderAll();
          return;
        }

        // Validate domain if restrictions exist
        if (!validateEmailDomain(email, currentClass.allowedDomains)) {
          errorMessage = `Email domain not allowed. Allowed domains: ${currentClass.allowedDomains.join(", ") || "none"}`;
          render();
          return;
        }

        // Check if user exists
        const existingUser = getUserByEmail(email);
        if (existingUser) {
          // Add to enrolled students
          if (!currentClass.studentIds.includes(existingUser.id)) {
            addStudentToClass(classId, existingUser.id);
            // Remove from invited if present
            removeInvitedEmail(classId, email);
          }
        } else {
          // Add to invited emails
          if (!currentClass.invitedEmails.includes(email)) {
            addInvitedEmail(classId, email);
          }
        }

        // Clear the form input
        addForm.studentEmail.value = "";
        
        // Refresh the view
        render();
      });

      appEl.querySelectorAll("button[data-remove-student-id]").forEach(btn => {
        btn.addEventListener("click", () => {
          const studentId = btn.getAttribute("data-remove-student-id");
          removeStudentFromClass(classId, studentId);
          render();
        });
      });

      appEl.querySelectorAll("button[data-remove-email]").forEach(btn => {
        btn.addEventListener("click", () => {
          const email = btn.getAttribute("data-remove-email");
          removeInvitedEmail(classId, email);
          render();
        });
      });

      (async () => {
        const useSupabase = await useSupabaseClasses();
        const teachersEl = appEl.querySelector("#teachersSection");
        const addForm = appEl.querySelector("#addTeacherForm");
        if (!teachersEl) return;
        if (!useSupabase) {
          teachersEl.innerHTML = `<p class="small" style="margin-top:8px;">Co-teachers: Not available in local mode.</p>`;
          return;
        }
        const teachers = await getClassTeachers(classId);
        const classObj2 = getClassById(classId);
        const isOwner = classObj2 && classObj2.teacherId === currentUser.id;
        teachersEl.innerHTML = teachers.length === 0
          ? `<p class="small" style="margin-top:8px;">No co-teachers yet.</p>`
          : `<div style="margin-top:8px;">${teachers.map(t => `
            <div class="cardRow" style="margin-top:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span>${escapeHtml(t.email)}</span>
                ${isOwner ? `<button class="danger" data-remove-teacher-id="${t.user_id}">Remove</button>` : ""}
              </div>
            </div>
          `).join("")}</div>`;
        if (addForm && isOwner) {
          addForm.style.display = "flex";
          addForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = addForm.querySelector("#teacherEmail").value.trim();
            if (!email) return;
            const r = await addTeacherToClass(classId, email);
            if (r.success) { addForm.querySelector("#teacherEmail").value = ""; render(); } else alert(r.error || "Failed to add.");
          });
        }
        appEl.querySelectorAll("button[data-remove-teacher-id]").forEach(btn => {
          btn.addEventListener("click", async () => {
            const userId = btn.getAttribute("data-remove-teacher-id");
            await removeTeacherFromClass(classId, userId);
            render();
          });
        });
      })();

      // Handle shared deck removal
      appEl.querySelectorAll("button[data-remove-shared-deck]").forEach(btn => {
        btn.addEventListener("click", () => {
          const sharedDeckId = btn.getAttribute("data-remove-shared-deck");
          if (confirm("Remove this shared deck? Students will no longer be able to access it.")) {
            deleteSharedDeck(sharedDeckId);
            render();
          }
        });
      });
      
      // Handle deck sharing
      const shareForm = appEl.querySelector("#shareDeckForm");
      if (shareForm) {
        shareForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const deckIndex = parseInt(shareForm.deckSelect.value, 10);
          if (isNaN(deckIndex) || !teacherState || !teacherState.cards) {
            return;
          }
          
          const validCards = teacherState.cards.filter(c => c.front.trim() && c.back.trim());
          if (validCards.length === 0) {
            alert("Please create a deck with at least one card first.");
            return;
          }
          
          const deckSnapshot = {
            cards: validCards.map(c => ({
              ...c,
              front: c.front.trim(),
              back: c.back.trim(),
              stage: 1,
              stage3Mastered: false,
              lastSeenAt: null,
            })),
            deckName: `Deck with ${validCards.length} cards`,
          };
          
          shareDeckToClass(currentUser.id, classId, deckSnapshot);
          shareForm.deckSelect.value = "";
          render();
        });
      }
    }

    appEl.querySelector("#backToClasses")?.addEventListener("click", () => {
      state.classView = "home";
      state.classId = null;
      save();
      renderAll();
    });
    
    // Handle CSV export button (analytics tab only)
    if (isTeacher && tab === "analytics") {
      const exportBtn = appEl.querySelector("#exportCSVBtn");
      if (exportBtn) {
        exportBtn.addEventListener("click", () => {
          // Re-render analytics section to get fresh data, then export
          const analytics = getAllAnalytics();
          const allUsers = loadUsers();
          const enrolledStudents = classObj.studentIds.map(id => allUsers.find(u => u.id === id)).filter(Boolean);
          const sharedDecks = getSharedDecksByClass(classId);
          const sharedDeckIds = sharedDecks.map(d => d.id);
          
          const rows = [];
          rows.push(["Email", "Total Time (min)", "Total Sessions", "Total Answers", "Correct", "Correct Rate (%)"]);
          
          enrolledStudents.forEach(student => {
            let totalTimeMs = 0;
            let totalSessions = 0;
            let totalAnswers = 0;
            let totalCorrect = 0;
            
            sharedDeckIds.forEach(deckId => {
              const agg = getAggregate(student.id, deckId);
              if (agg) {
                totalTimeMs += agg.totalTimeMs || 0;
                totalSessions += agg.totalSessions || 0;
                totalAnswers += agg.totals?.answersSubmitted || 0;
                totalCorrect += agg.totals?.correctCount || 0;
              }
            });
            
            const correctRate = totalAnswers > 0 ? ((totalCorrect / totalAnswers) * 100).toFixed(1) : "0.0";
            rows.push([
              student.email,
              (totalTimeMs / 60000).toFixed(1),
              totalSessions,
              totalAnswers,
              totalCorrect,
              correctRate,
            ]);
          });
          
          const csvContent = rows.map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
          ).join("\n");
          
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          const link = document.createElement("a");
          const url = URL.createObjectURL(blob);
          link.setAttribute("href", url);
          link.setAttribute("download", `class_${classObj.name.replace(/[^a-z0-9]/gi, "_")}_analytics.csv`);
          link.style.visibility = "hidden";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
      }
      
      // Handle analytics select changes
      const deckSelect = appEl.querySelector("#deckAnalyticsSelect");
      if (deckSelect) {
        deckSelect.addEventListener("change", (e) => {
          state.classAnalyticsDeckId = e.target.value;
          save();
          render();
        });
      }
      
      const studentSelect = appEl.querySelector("#studentAnalyticsSelect");
      if (studentSelect) {
        studentSelect.addEventListener("change", (e) => {
          state.classAnalyticsStudentId = e.target.value;
          save();
          render();
        });
      }
    }
  }

  render();
}

function renderOrganizationScreen(appEl, { currentUser, state, setScreen, save, renderAll }) {
  (async () => {
    const useSupabase = await useSupabaseClasses();
    if (!useSupabase) {
      appEl.innerHTML = `
        <section class="card">
          <h2 style="margin:0; text-align:center;">Organization</h2>
          <p class="sub" style="margin-top:12px; text-align:center;">Organization management is available when using Supabase.</p>
          <div class="btns" style="margin-top:16px;"><button id="backFromOrg">Back</button></div>
        </section>
      `;
      appEl.querySelector("#backFromOrg").addEventListener("click", () => {
        state.orgView = false;
        save();
        renderAll();
      });
      return;
    }
    const orgs = await getOrganizationsForUser();
    const selectedOrgId = state.orgSelectedId || null;
    const isAdmin = selectedOrgId ? orgs.find((o) => o.id === selectedOrgId)?.role === "admin" : false;
    const members = selectedOrgId && isAdmin ? await getOrgMembers(selectedOrgId) : [];
    const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

    appEl.innerHTML = `
      <section class="card">
        <h2 style="margin:0; text-align:center;">Organization</h2>
        <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Your organizations</h3>
        ${orgs.length === 0 ? `<p class="small">You are not in any organization.</p>` : `
          <div style="margin-top:8px;">
            ${orgs.map((o) => `
              <div class="cardRow" style="margin-top:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span><strong>${escapeHtml(o.name)}</strong> (${o.role})</span>
                  <button type="button" data-org-id="${o.id}" class="${selectedOrgId === o.id ? "primary" : ""}">${selectedOrgId === o.id ? "Selected" : "View"}</button>
                </div>
              </div>
            `).join("")}
          </div>
        `}
        ${selectedOrgId && isAdmin ? `
          <hr style="margin-top:16px;" />
          <h3 style="font-size:16px; margin-top:16px; margin-bottom:8px;">Members – ${escapeHtml(selectedOrg?.name || "")}</h3>
          ${members.length === 0 ? `<p class="small">No members.</p>` : `
            <div style="margin-top:8px;">
              ${members.map((m) => `
                <div class="cardRow" style="margin-top:8px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${escapeHtml(m.email)}</span>
                    <select data-member-user-id="${m.user_id}" class="roleSelect" style="padding:4px 8px;">
                      <option value="member" ${m.role === "member" ? "selected" : ""}>Member</option>
                      <option value="admin" ${m.role === "admin" ? "selected" : ""}>Admin</option>
                    </select>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        ` : ""}
        <div class="btns" style="margin-top:16px;"><button id="backFromOrg">Back</button></div>
      </section>
    `;

    appEl.querySelectorAll("button[data-org-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.orgSelectedId = btn.getAttribute("data-org-id");
        save();
        renderAll();
      });
    });
    appEl.querySelectorAll("select.roleSelect").forEach((sel) => {
      sel.addEventListener("change", async (e) => {
        const userId = e.target.getAttribute("data-member-user-id");
        const role = e.target.value;
        const r = await setOrgMemberRole(selectedOrgId, userId, role);
        if (!r.success) alert(r.error || "Failed to update role.");
      });
    });
    appEl.querySelector("#backFromOrg").addEventListener("click", () => {
      state.orgView = false;
      state.orgSelectedId = null;
      save();
      renderAll();
    });
  })();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMinutes(ms = 0) {
  return ((ms || 0) / 60000).toFixed(1);
}
