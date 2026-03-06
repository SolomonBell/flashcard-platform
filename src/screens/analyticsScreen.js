import { getClassesByTeacher, getSharedDecksByClass } from "../data/store/index.js";
import { escapeHtml } from "../utils.js";

// ── Data functions (replaceable with Supabase later) ──────────────────────

async function buildAnalyticsViewModel(teacherId) {
  const classes = await getClassesByTeacher(teacherId);
  return Promise.all(classes.map(async cls => ({
    id: cls.id,
    name: cls.name,
    totalStudents: cls.studentIds.length,
    sharedDecksCount: (await getSharedDecksByClass(cls.id)).length,
    students: cls.studentIds,
  })));
}

/**
 * Returns shared decks for a class as { id, name, cards[] }.
 * Replace with Supabase query when ready.
 */
async function listSharedDecksForClass(classId) {
  const sharedDecks = await getSharedDecksByClass(classId);
  return sharedDecks.map(sd => ({
    id: sd.id,
    name: sd.deckSnapshot?.deckName || "Unnamed Deck",
    cards: sd.deckSnapshot?.cards ?? [],
  }));
}

// Color palette for stacked segments (8 colors; last is "Other")
const PALETTE = [
  "#4f46e5","#10b981","#f59e0b","#ef4444",
  "#8b5cf6","#06b6d4","#ec4899","#64748b",
];

/**
 * Returns stacked daily activity data per student for the last `days` days.
 * Replace body with Supabase query when ready.
 *
 * @param {{ classId: string, deckId?: string, studentIds: string[], days?: number }}
 * @returns {{
 *   days: string[],
 *   students: { id: string, label: string }[],
 *   counts: Record<string, Record<string, number>>
 * }}
 */
function getDailyActivityStack({ classId, deckId, studentIds, days = 14 }) {
  const daysList = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86_400_000);
    daysList.push(d.toISOString().slice(0, 10));
  }

  const students = studentIds.map(id => ({ id, label: id }));
  const counts = {};
  for (const day of daysList) {
    counts[day] = {};
    for (const s of students) {
      const seedStr = classId + (deckId || "") + s.id + day;
      const seed = seedStr.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
      counts[day][s.id] = Math.max(0, Math.round(
        3 + 2 * Math.sin(seed * 0.3) + 2 * Math.cos(seed * 0.7)
      ));
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
 * Returns per-card accuracy stats for a specific shared deck.
 * Uses deterministic demo data until attempt tracking is implemented.
 * Replace body with Supabase query when ready.
 * @param {{ classId: string, deckId: string, scope?: { type: "class" } | { type: "student", email: string } }}
 * @returns {{ cardId, front, attempts, correct, accuracy }[]}
 */
async function getCardAccuracyStats({ classId, deckId, scope }) {
  const sharedDecks = await getSharedDecksByClass(classId);
  const sd = sharedDecks.find(d => d.id === deckId);
  if (!sd) return [];

  const scopeSeed = (scope?.type === "student") ? scope.email : "";
  const seedStr = classId + deckId + scopeSeed;
  const seed = seedStr.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return (sd.deckSnapshot?.cards ?? []).map((card, idx) => {
    const attempts = 5 + ((seed + idx * 7) % 15);
    const correct = Math.round(attempts * (0.4 + ((seed + idx * 13) % 60) / 100));
    return {
      cardId: card.id,
      front: card.front || "(empty)",
      attempts,
      correct,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    };
  });
}

// ── SVG stacked bar chart ─────────────────────────────────────────────────

/**
 * Renders a stacked SVG bar chart from getDailyActivityStack output.
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

  const W = 560, H = 180;
  const padL = 32, padB = 28, padT = 10, padR = 8;
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
    return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle"
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

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;"
    role="img" aria-label="14-day stacked student activity chart">
    ${yLabels}${bars}${xLabels}
  </svg>
  <div style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:8px;">
    ${legend}
  </div>`;
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

    // Build per-deck panels
    let chartHtml = "";
    let accuracyHtml = "";

    if (cls) {
      const stack = getDailyActivityStack({
        classId: cls.id, deckId: selectedDeckId, studentIds: cls.students, days: 14,
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
        const stats = await getCardAccuracyStats({ classId: cls.id, deckId: selectedDeckId, scope });
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
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <h3 style="font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;
                letter-spacing:0.05em;margin:0;">Card Accuracy</h3>
              <button type="button" class="small" id="sortAccuracyBtn"
                style="padding:4px 10px;font-size:12px;">
                Sort: ${cardSortAsc ? "Hardest First" : "Easiest First"}
              </button>
            </div>
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
                  <th style="text-align:center;padding:7px 6px;font-weight:600;">Accuracy %</th>
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
        <p class="small" style="color:var(--muted);text-align:center;margin:6px 0 0;">
          In local mode, activity/accuracy may reflect only this device.
          Full class analytics will be enabled with Supabase.
        </p>

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
                <div style="font-size:24px;font-weight:700;color:var(--muted);">—</div>
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
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Accuracy %</th>
                    <th style="text-align:center;padding:8px 6px;font-weight:600;">Last Active</th>
                  </tr>
                </thead>
                <tbody>
                  ${cls.students.length === 0
                    ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--muted);">
                        No students in this class yet.</td></tr>`
                    : cls.students.map(sid => `
                      <tr style="border-bottom:1px solid var(--border);">
                        <td style="padding:8px 6px;">${escapeHtml(sid)}</td>
                        <td style="text-align:center;padding:8px 6px;color:var(--muted);">—</td>
                        <td style="text-align:center;padding:8px 6px;color:var(--muted);">—</td>
                        <td style="text-align:center;padding:8px 6px;color:var(--muted);">—</td>
                        <td style="text-align:center;padding:8px 6px;color:var(--muted);">—</td>
                      </tr>`).join("")}
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

    appEl.querySelector("#sortAccuracyBtn")?.addEventListener("click", () => {
      cardSortAsc = !cardSortAsc;
      render();
    });

    appEl.querySelector("#accuracyScopeSelect")?.addEventListener("change", (e) => {
      selectedScope = e.target.value;
      render();
    });
  }

  render();
}
