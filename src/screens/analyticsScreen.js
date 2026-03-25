import { getClassesByTeacher, getSharedDecksByClass, getStudentProgressForClass, getSessionsForSharedDecks, getCardAttemptStatsForDeck } from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

// ── Data functions ─────────────────────────────────────────────────────────

async function buildAnalyticsViewModel(teacherId) {
  const classes = await getClassesByTeacher(teacherId);
  return Promise.all(classes.map(async cls => {
    const sharedDecks = await getSharedDecksByClass(cls.id);
    const sharedDeckIds = sharedDecks.map(d => d.id);

    // Real engagement data
    const progressRows = await getStudentProgressForClass(cls.id);
    const sessionRows  = await getSessionsForSharedDecks(sharedDeckIds);

    // email → [UUIDs] (a student could have multiple sessions from different logins)
    const emailToUuids = {};
    for (const p of progressRows) {
      if (!emailToUuids[p.studentEmail]) emailToUuids[p.studentEmail] = [];
      if (!emailToUuids[p.studentEmail].includes(p.studentId))
        emailToUuids[p.studentEmail].push(p.studentId);
    }

    // Active = has started at least one shared deck in this class
    const activeEmails = new Set(progressRows.map(p => p.studentEmail));

    // Per-student aggregates
    const studentStats = {};
    for (const email of cls.studentIds) {
      const myProgress = progressRows.filter(p => p.studentEmail === email);
      const myUuids    = emailToUuids[email] ?? [];
      const mySessions = sessionRows.filter(s => myUuids.includes(s.studentId));

      const lastStudiedAt = myProgress.reduce(
        (max, p) => (!max || (p.lastStudiedAt && p.lastStudiedAt > max)) ? p.lastStudiedAt : max,
        null
      );
      const totalAnswers = mySessions.reduce((sum, s) => sum + s.answersSubmitted, 0);
      const totalCorrect = mySessions.reduce((sum, s) => sum + s.correctCount, 0);

      studentStats[email] = {
        decksStudied:   myProgress.length,
        cardsAttempted: totalAnswers > 0 ? totalAnswers : null,
        accuracy:       totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : null,
        lastStudiedAt,
      };
    }

    return {
      id:              cls.id,
      name:            cls.name,
      totalStudents:   cls.studentIds.length,
      sharedDecksCount: sharedDecks.length,
      students:        cls.studentIds,
      activeStudents:  activeEmails.size,
      studentStats,
      _progressRows:   progressRows,
      _sessionRows:    sessionRows,
    };
  }));
}

/**
 * Returns shared decks for a class as { id, name, cards[] }.
 */
async function listSharedDecksForClass(classId) {
  const sharedDecks = await getSharedDecksByClass(classId);
  return sharedDecks.map(sd => ({
    id:    sd.id,
    name:  sd.deckSnapshot?.deckName || "Unnamed Deck",
    cards: sd.deckSnapshot?.cards ?? [],
  }));
}

// Color palette for stacked segments (8 colors; last is "Other")
const PALETTE = [
  "#4f46e5","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#64748b",
];

/**
 * Builds stacked daily activity data from real session rows.
 * "activity" = answers_submitted per student per day.
 * Falls back to all-zero counts (renders "No activity data yet.") when sessions are absent.
 *
 * @param {{ studentIds: string[], sessionRows: any[], progressRows: any[], days?: number }}
 * @returns {{ days: string[], students: { id: string, label: string }[], counts: Record<string, Record<string, number>> }}
 */
function buildActivityStack({ studentIds, sessionRows, progressRows, days = 14 }) {
  const daysList = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    daysList.push(d.toISOString().slice(0, 10));
  }

  const students = studentIds.map(id => ({ id, label: id }));

  // Build email → UUIDs from progress rows
  const emailToUuids = {};
  for (const p of progressRows) {
    if (!emailToUuids[p.studentEmail]) emailToUuids[p.studentEmail] = [];
    if (!emailToUuids[p.studentEmail].includes(p.studentId))
      emailToUuids[p.studentEmail].push(p.studentId);
  }

  const counts = {};
  for (const day of daysList) {
    counts[day] = {};
    for (const s of students) {
      const uuids = emailToUuids[s.id] || [];
      const daySessions = sessionRows.filter(
        sess =>
          uuids.includes(sess.studentId) &&
          typeof sess.startedAt === "string" &&
          sess.startedAt.slice(0, 10) === day
      );
      counts[day][s.id] = daySessions.reduce((sum, sess) => sum + (sess.answersSubmitted || 0), 0);
    }
  }

  return { days: daysList, students, counts };
}

/**
 * Caps display to top 7 most-active students + "Other" bucket when > 8 students.
 */
function getDisplayStudents({ students, counts, days }) {
  if (students.length <= 8) return { displayStudents: students, otherIds: [] };

  const totals = {};
  for (const s of students) {
    totals[s.id] = days.reduce((sum, day) => sum + (counts[day]?.[s.id] || 0), 0);
  }
  const sorted = [...students].sort((a, b) => totals[b.id] - totals[a.id]);
  return {
    displayStudents: [...sorted.slice(0, 7), { id: "__other__", label: "Other" }],
    otherIds: sorted.slice(7).map(s => s.id),
  };
}

/**
 * Returns per-card cumulative accuracy stats for a specific shared deck.
 * Reads from card_attempt_stats (the dedicated per-card table written on every answer).
 * Cards with no attempts yet show accuracy: null (renders as "—" in the table).
 *
 * @param {{ classId: string, deckId: string, scope?: { type: "class" } | { type: "student", email: string }, progressRows: any[] }}
 * @returns {{ cardId, front, attempts, correct, accuracy }[]}
 */
async function getCardAccuracyStats({ classId, deckId, scope, progressRows }) {
  const sharedDecks = await getSharedDecksByClass(classId);
  const sd = sharedDecks.find(d => d.id === deckId);
  if (!sd) return [];

  // For student scope, resolve email → student UUID(s) via progressRows
  let studentIds = null;
  if (scope?.type === "student") {
    studentIds = [...new Set(
      progressRows
        .filter(p => p.sharedDeckId === deckId && p.studentEmail === scope.email)
        .map(p => p.studentId)
    )];
    if (studentIds.length === 0) studentIds = ["__nomatch__"];
  }

  // Fetch per-card stats from the dedicated table
  const statRows = await getCardAttemptStatsForDeck({ sharedDeckId: deckId, studentIds });

  // Aggregate by cardId (sums across all students for class scope)
  const byCard = {};
  for (const row of statRows) {
    if (!byCard[row.cardId]) byCard[row.cardId] = { attempts: 0, correctCount: 0 };
    byCard[row.cardId].attempts    += row.attempts;
    byCard[row.cardId].correctCount += row.correctCount;
  }

  return (sd.deckSnapshot?.cards ?? []).map(card => {
    const agg = byCard[card.id];
    const totalAttempts = agg?.attempts    ?? 0;
    const totalCorrect  = agg?.correctCount ?? 0;
    return {
      cardId:   card.id,
      front:    card.front || "(empty)",
      attempts: totalAttempts,
      correct:  totalCorrect,
      accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null,
    };
  });
}

/** Formats a Unix-ms timestamp as a short relative date string. */
function formatRelativeDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - d) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── SVG stacked bar chart ─────────────────────────────────────────────────

/**
 * Renders a stacked SVG bar chart from buildActivityStack output.
 * Returns an HTML string (SVG + legend).
 */
function renderStackedActivityChart(stack) {
  const { days, students, counts } = stack;

  if (students.length === 0) {
    return `<p class="small" style="color:var(--muted);text-align:center;padding:20px 0;">
      No students in this class yet.</p>`;
  }

  const { displayStudents, otherIds } = getDisplayStudents(stack);

  // Per-day totals for y-axis scale
  const dayTotals = days.map(day =>
    students.reduce((sum, s) => sum + (counts[day]?.[s.id] || 0), 0)
  );
  const maxTotal = Math.max(...dayTotals, 1);

  const allZero = dayTotals.every(t => t === 0);
  if (allZero) {
    return `<p class="small" style="color:var(--muted);text-align:center;padding:20px 0;">
      No activity data yet.</p>`;
  }

  const W = 560, H = 194;
  const padL = 32, padB = 42, padT = 10, padR = 8;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const slotW = chartW / days.length;
  const barW = Math.max(2, Math.floor(slotW) - 3);

  const bars = days.map((day, i) => {
    const x = padL + i * slotW + (slotW - barW) / 2;
    let yBottom = padT + chartH; // grows upward
    let rects = "";

    for (let j = 0; j < displayStudents.length; j++) {
      const s = displayStudents[j];
      const count = s.id === "__other__"
        ? otherIds.reduce((sum, oid) => sum + (counts[day]?.[oid] || 0), 0)
        : (counts[day]?.[s.id] || 0);
      if (count === 0) continue;

      const barH = Math.max(1, Math.round((count / maxTotal) * chartH));
      yBottom -= barH;
      const color = PALETTE[j % PALETTE.length];
      const label = s.label.length > 30 ? s.label.slice(0, 28) + "…" : s.label;
      rects += `<rect x="${x.toFixed(1)}" y="${yBottom}" width="${barW}" height="${barH}"
        fill="${color}" rx="1">
        <title>${day}\n${label}: ${count}</title></rect>`;
    }
    return rects;
  }).join("");

  const xLabels = days.map((day, i) => {
    if (i % 3 !== 0) return "";
    const [, mm, dd] = day.split("-");
    const x = padL + i * slotW + slotW / 2;
    return `<text x="${x.toFixed(1)}" y="${padT + chartH + 16}" text-anchor="middle"
      font-size="10" fill="var(--muted,#6b7280)">${mm}/${dd}</text>`;
  }).join("");

  const yTicks = [0, Math.round(maxTotal / 2), maxTotal];
  const yLabels = yTicks.map(v => {
    const y = padT + chartH - Math.round((v / maxTotal) * chartH);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
      stroke="#e5e7eb" stroke-width="1"/>
      <text x="${padL - 4}" y="${y + 4}" text-anchor="end"
      font-size="10" fill="var(--muted,#6b7280)">${v}</text>`;
  }).join("");

  const legend = displayStudents.map((s, j) => {
    const label = escapeHtml(s.label.length > 24 ? s.label.slice(0, 22) + "…" : s.label);
    return `<div style="display:flex;align-items:center;gap:4px;">
      <div style="width:10px;height:10px;border-radius:2px;background:${PALETTE[j % PALETTE.length]};flex-shrink:0;"></div>
      <span style="font-size:11px;color:var(--muted);">${label}</span>
    </div>`;
  }).join("");

  const xAxisLabel = `<text x="${(padL + W - padR) / 2}" y="${H - 2}"
    text-anchor="middle" font-size="9" fill="var(--muted,#6b7280)">Date</text>`;
  const yAxisLabel = `<text x="10" y="${padT + chartH / 2}"
    text-anchor="middle" font-size="9" fill="var(--muted,#6b7280)"
    transform="rotate(-90, 10, ${padT + chartH / 2})">Answers</text>`;

  const startOpen = displayStudents.length <= 5;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;"
    role="img" aria-label="14-day stacked student activity chart: answers submitted per student per day">
    ${yAxisLabel}${yLabels}${bars}${xLabels}${xAxisLabel}
  </svg>
  <details style="margin-top:8px;" ${startOpen ? "open" : ""}>
    <summary style="font-size:11px;color:var(--muted);cursor:pointer;user-select:none;
      list-style:none;display:inline-flex;align-items:center;gap:4px;">
      Student Legend ▼
    </summary>
    <div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:6px;">
      ${legend}
    </div>
  </details>`;
}

// ── Screen ────────────────────────────────────────────────────────────────

export function renderAnalyticsScreen(appEl, { currentUserId }) {
  let selectedClassIndex = 0;
  let selectedDeckId = null;   // null = no deck chosen yet
  let cardSortAsc = false;     // false = hardest first
  let selectedScope = "class"; // "class" or a student email

  async function render() {
    const viewModel = await buildAnalyticsViewModel(currentUserId);
    const cls = viewModel[selectedClassIndex] ?? null;

    // Shared decks for the selected class
    const sharedDecks = cls ? await listSharedDecksForClass(cls.id) : [];

    // Default selectedDeckId to first deck when class changes or deck removed
    if (cls && sharedDecks.length > 0) {
      const stillValid = sharedDecks.some(d => d.id === selectedDeckId);
      if (!stillValid) selectedDeckId = sharedDecks[0].id;
    } else {
      selectedDeckId = null;
    }

    const selectedDeck = sharedDecks.find(d => d.id === selectedDeckId) ?? null;

    // Pull pre-fetched engagement data from view model
    const progressRows = cls?._progressRows ?? [];
    const sessionRows  = cls?._sessionRows  ?? [];

    // Filter to the selected deck (mirrors how Card Accuracy uses selectedDeckId)
    const deckProgressRows = selectedDeckId
      ? progressRows.filter(p => p.sharedDeckId === selectedDeckId)
      : progressRows;
    const deckSessionRows = selectedDeckId
      ? sessionRows.filter(s => s.sharedDeckId === selectedDeckId)
      : sessionRows;

    // Build email→UUIDs from all progress rows (UUID is invariant across decks)
    const emailToUuids = {};
    for (const p of progressRows) {
      if (!emailToUuids[p.studentEmail]) emailToUuids[p.studentEmail] = [];
      if (!emailToUuids[p.studentEmail].includes(p.studentId))
        emailToUuids[p.studentEmail].push(p.studentId);
    }

    // Per-student stats scoped to the selected deck
    const deckStudentStats = {};
    for (const email of (cls?.students ?? [])) {
      const myProgress = deckProgressRows.filter(p => p.studentEmail === email);
      const myUuids    = emailToUuids[email] ?? [];
      const mySessions = deckSessionRows.filter(s => myUuids.includes(s.studentId));

      const lastStudiedAt = myProgress.reduce(
        (max, p) => (!max || (p.lastStudiedAt && p.lastStudiedAt > max)) ? p.lastStudiedAt : max,
        null
      );
      const totalAnswers = mySessions.reduce((sum, s) => sum + s.answersSubmitted, 0);
      const totalCorrect = mySessions.reduce((sum, s) => sum + s.correctCount, 0);

      deckStudentStats[email] = {
        decksStudied:   myProgress.length,
        cardsAttempted: totalAnswers > 0 ? totalAnswers : null,
        accuracy:       totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : null,
        lastStudiedAt,
      };
    }

    // Build per-deck panels
    let chartHtml = "";
    let accuracyHtml = "";

    if (cls) {
      const stack = buildActivityStack({
        studentIds:  cls.students,
        sessionRows: deckSessionRows,
        progressRows: deckProgressRows,
        days: 14,
      });
      chartHtml = `
        <div style="margin-top:20px;">
          <h3 style="font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
            letter-spacing:0.05em;margin:0 0 8px;">Student Activity</h3>
          ${renderStackedActivityChart(stack)}
        </div>`;

      if (selectedDeck) {
        const scope = selectedScope === "class"
          ? { type: "class" }
          : { type: "student", email: selectedScope };
        const stats = await getCardAccuracyStats({ classId: cls.id, deckId: selectedDeckId, scope, progressRows });
        const sorted = [...stats].sort((a, b) =>
          cardSortAsc
            ? (b.accuracy ?? -1) - (a.accuracy ?? -1)
            : (a.accuracy ?? 101) - (b.accuracy ?? 101)
        );

        const scopeOptions = [
          `<option value="class" ${selectedScope === "class" ? "selected" : ""}>Class Average</option>`,
          ...cls.students.map(email =>
            `<option value="${escapeHtml(email)}" ${selectedScope === email ? "selected" : ""}>${escapeHtml(email)}</option>`
          ),
        ].join("");

        accuracyHtml = stats.length === 0 ? "" : `
          <div style="margin-top:20px;overflow-x:auto;">
            <h3 style="font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
              letter-spacing:0.05em;margin:0 0 8px;">Card Accuracy</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
              <label style="font-size:12px;color:var(--muted);white-space:nowrap;">Accuracy:</label>
              <select id="accuracyScopeSelect" style="flex:1;padding:5px 8px;font-size:13px;
                border:1px solid var(--border);border-radius:8px;">
                ${scopeOptions}
              </select>
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="text-align:left;padding:7px 6px;font-weight:600;">Card Front</th>
                  <th style="text-align:center;padding:7px 6px;font-weight:600;">Attempts</th>
                  <th style="text-align:center;padding:7px 6px;font-weight:600;">Correct</th>
                  <th style="text-align:center;padding:7px 6px;font-weight:600;">
                    <select id="sortAccuracySelect"
                      style="font-size:11px;padding:2px 4px;border:1px solid var(--border);
                        border-radius:6px;color:var(--muted);font-weight:600;cursor:pointer;">
                      <option value="hardest" ${!cardSortAsc ? "selected" : ""}>Accuracy ↓</option>
                      <option value="easiest" ${cardSortAsc ? "selected" : ""}>Accuracy ↑</option>
                    </select>
                  </th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map(c => {
                  const color = c.accuracy === null ? "var(--muted)"
                    : c.accuracy >= 70 ? "#16a34a"
                    : c.accuracy >= 40 ? "#d97706" : "#dc2626";
                  const front = escapeHtml(c.front.length > 50 ? c.front.slice(0, 47) + "…" : c.front);
                  return `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:7px 6px;max-width:260px;overflow:hidden;text-overflow:ellipsis;
                      white-space:nowrap;" title="${escapeHtml(c.front)}">${front}</td>
                    <td style="text-align:center;padding:7px 6px;">${c.attempts}</td>
                    <td style="text-align:center;padding:7px 6px;">${c.correct}</td>
                    <td style="text-align:center;padding:7px 6px;font-weight:600;color:${color};">
                      ${c.accuracy === null ? "—" : c.accuracy + "%"}
                    </td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>`;
      }
    }

    appEl.innerHTML = `
      <section class="card" style="max-width:700px;margin:0 auto;">
        <h2 style="margin:0;text-align:center;">Analytics</h2>
        ${viewModel.length === 0 ? `
          <p class="small" style="color:var(--muted);text-align:center;margin-top:16px;">
            No classes yet. Create a class first.
          </p>
        ` : `
          <!-- Class selector -->
          <div style="margin-top:16px;display:flex;align-items:center;gap:8px;">
            <label class="label" for="classSelect" style="margin:0;white-space:nowrap;">Class:</label>
            <select id="classSelect" style="flex:1;padding:8px 10px;font-size:14px;
              border:1px solid var(--border);border-radius:8px;">
              ${viewModel.map((c, i) =>
                `<option value="${i}" ${i === selectedClassIndex ? "selected" : ""}>${escapeHtml(c.name)}</option>`
              ).join("")}
            </select>
          </div>

          <!-- Deck selector -->
          <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
            <label class="label" for="deckSelect" style="margin:0;white-space:nowrap;">Deck:</label>
            <select id="deckSelect" style="flex:1;padding:8px 10px;font-size:14px;
              border:1px solid var(--border);border-radius:8px;"
              ${sharedDecks.length === 0 ? "disabled" : ""}>
              ${sharedDecks.length === 0
                ? `<option>No shared decks</option>`
                : sharedDecks.map(d =>
                    `<option value="${escapeHtml(d.id)}" ${d.id === selectedDeckId ? "selected" : ""}>${escapeHtml(d.name)}</option>`
                  ).join("")}
            </select>
          </div>

          ${cls ? `
            <!-- Summary stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
              gap:12px;margin-top:16px;">
              <div style="border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
                <div style="font-size:24px;font-weight:700;">${cls.totalStudents}</div>
                <div class="small" style="color:var(--muted);margin-top:2px;">Total Students</div>
              </div>
              <div style="border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
                <div style="font-size:24px;font-weight:700;">${cls.sharedDecksCount}</div>
                <div class="small" style="color:var(--muted);margin-top:2px;">Shared Decks</div>
              </div>
              <div style="border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center;">
                <div style="font-size:24px;font-weight:700;">${cls.activeStudents}</div>
                <div class="small" style="color:var(--muted);margin-top:2px;">Active Students</div>
              </div>
            </div>

            ${chartHtml}
            ${accuracyHtml}

            <!-- Student table -->
            <div style="margin-top:20px;overflow-x:auto;">
              <h3 style="font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
                letter-spacing:0.05em;margin:0 0 8px;">Students</h3>
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="border-bottom:2px solid var(--border);">
                    <th style="text-align:left;padding:8px 6px;font-weight:600;">Student</th>
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Decks Studied</th>
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Cards Attempted</th>
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Accuracy</th>
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  ${cls.students.length === 0
                    ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted);">
                        No students in this class yet.</td></tr>`
                    : cls.students.map(sid => {
                        const st = deckStudentStats[sid] ?? {};
                        const decksStudied   = st.decksStudied   != null ? String(st.decksStudied)   : "—";
                        const cardsAttempted = st.cardsAttempted != null ? String(st.cardsAttempted) : "—";
                        const accuracy       = st.accuracy       != null ? st.accuracy + "%"         : "—";
                        const lastActive     = formatRelativeDate(st.lastStudiedAt);
                        return `
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:8px 6px;">${escapeHtml(sid)}</td>
                        <td style="text-align:center;padding:8px 6px;${decksStudied   === "—" ? "color:var(--muted);" : ""}">${decksStudied}</td>
                        <td style="text-align:center;padding:8px 6px;${cardsAttempted === "—" ? "color:var(--muted);" : ""}">${cardsAttempted}</td>
                        <td style="text-align:center;padding:8px 6px;${accuracy       === "—" ? "color:var(--muted);" : ""}">${accuracy}</td>
                        <td style="text-align:center;padding:8px 6px;${lastActive     === "—" ? "color:var(--muted);" : ""}">${lastActive}</td>
                      </tr>`;
                      }).join("")}
                </tbody>
              </table>
            </div>
          ` : ""}
        `}
      </section>
    `;

    appEl.querySelector("#classSelect")?.addEventListener("change", (e) => {
      selectedClassIndex = Number(e.target.value);
      selectedDeckId = null;
      selectedScope = "class";
      render();
    });

    appEl.querySelector("#deckSelect")?.addEventListener("change", (e) => {
      selectedDeckId = e.target.value;
      render();
    });

    appEl.querySelector("#sortAccuracySelect")?.addEventListener("change", (e) => {
      cardSortAsc = e.target.value === "easiest";
      render();
    });

    appEl.querySelector("#accuracyScopeSelect")?.addEventListener("change", (e) => {
      selectedScope = e.target.value;
      render();
    });
  }

  render();
}
