import { config } from "./config.js";

const PDFJS_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PDFJS_CDN;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load pdf.js"));
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
  return window.pdfjsLib;
}

export async function extractTextFromPdf(file) {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const parts = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    parts.push(pageText);
  }
  return parts.join("\n");
}

/**
 * Removes common PDF extraction noise before sending text to the AI.
 * Conservative: only removes patterns that are unambiguously non-content.
 *
 * Heuristics applied (in order):
 *  1. Repeated short lines — running headers/footers that appear 4+ times.
 *  2. Standalone page numbers — lines containing only 1–4 digits.
 *  3. TOC lines — content followed by 3+ dots then a number ("Intro .... 3").
 *  4. Copyright/legal boilerplate lines that start with known markers.
 *  5. Very short fragments (< 3 chars) — PDF extraction artifacts.
 *  6. Bibliography/references section — everything from a clearly-named
 *     section header onward, but only after the first 30% of lines.
 *  7. Excess blank lines — more than 2 consecutive collapsed to 2.
 */
function cleanPdfText(rawText) {
  const lines = rawText.split("\n");
  const totalLines = lines.length;

  // ── 1. Detect repeated lines (running headers / footers) ──────────────────
  // A line appearing 4+ times and shorter than 80 chars is almost certainly
  // a running header or footer, not body content.
  const freq = new Map();
  for (const line of lines) {
    const t = line.trim();
    if (t.length > 0 && t.length < 80) {
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  const headerFooter = new Set(
    [...freq.entries()].filter(([, n]) => n >= 4).map(([t]) => t)
  );

  // ── 2. Detect bibliography start ──────────────────────────────────────────
  // Only look for it after the first 30% of the document so we don't
  // accidentally cut off a preface or intro that mentions "References".
  const BIB_RE = /^(references?|bibliography|works cited|further reading|citations?)\s*$/i;
  let bibStart = Infinity;
  const minBibLine = Math.floor(totalLines * 0.3);
  for (let i = minBibLine; i < lines.length; i++) {
    if (BIB_RE.test(lines[i].trim())) { bibStart = i; break; }
  }

  // ── 3. Line-by-line pass ──────────────────────────────────────────────────
  const out = [];
  let blankRun = 0;

  for (let i = 0; i < lines.length; i++) {
    if (i >= bibStart) break;                         // stop at references section

    const line = lines[i].trimEnd();
    const t    = line.trim();

    if (t === "") {
      blankRun++;
      if (blankRun <= 2) out.push("");               // allow max 2 consecutive blanks
      continue;
    }
    blankRun = 0;

    if (headerFooter.has(t))               continue; // repeated header/footer
    if (/^\d{1,4}$/.test(t))              continue; // standalone page number
    if (/^.{2,}\.{3,}\s*\d+\s*$/.test(t)) continue; // TOC line (dots + number)
    if (/^(©|copyright\s|isbn[\s:-]|all rights reserved|published by|printed in)/i.test(t)) continue; // legal boilerplate
    if (t.length < 3 && !/[\p{L}\p{N}]/u.test(t)) continue; // junk punctuation/bullet artifact (preserves letters/digits)

    out.push(line);
  }

  const cleaned = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // ── Instrumentation ───────────────────────────────────────────────────────
  const pct = rawText.length
    ? Math.round((1 - cleaned.length / rawText.length) * 100)
    : 0;
  console.log(
    `[pdfToCards] text cleaned: ${rawText.length} chars → ${cleaned.length} chars (${pct}% removed)`
  );

  return cleaned;
}

export async function generateCardsFromText(text) {
  const cleaned     = cleanPdfText(text);
  const proxyUrl    = config?.aiProxyUrl  || "http://localhost:3001";
  const proxySecret = config?.proxySecret || "";
  const res = await fetch(`${proxyUrl}/generate-deck`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(proxySecret ? { "X-Proxy-Secret": proxySecret } : {}),
    },
    body: JSON.stringify({ text: cleaned }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  return data.cards || [];
}
