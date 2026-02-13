/**
 * Import from PDF: upload (Supabase Storage when configured), extract text with pdfjs-dist,
 * heuristic card generation, optional page range. Stub for AI generation.
 */

import { uid } from "../utils.js";
import { getSupabase } from "../supabaseClient.js";

const PREVIEW_CHARS = 800;
const MAX_CARDS_HEURISTIC = 80;

/** Extract text from PDF file (client-side). Uses pdfjs-dist. */
export async function extractTextFromPdf(file, pageRange = null) {
  let pdfjs;
  try {
    pdfjs = await import("pdfjs-dist");
  } catch (e) {
    console.warn("pdfjs-dist not available:", e);
    return { success: false, error: "PDF library not loaded. Run npm install." };
  }
  const getDocument = pdfjs.getDocument || pdfjs.default?.getDocument;
  if (!getDocument) return { success: false, error: "PDF getDocument not found." };
  if (typeof pdfjs.GlobalWorkerOptions !== "undefined") {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
    } catch (_) {}
  }
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    let startPage = 1;
    let endPage = numPages;
    if (pageRange) {
      const parts = String(pageRange).split("-").map((p) => parseInt(p.trim(), 10)).filter((n) => Number.isFinite(n));
      if (parts.length >= 1) startPage = Math.max(1, parts[0]);
      if (parts.length >= 2) endPage = Math.min(numPages, Math.max(startPage, parts[1]));
    }
    const texts = [];
    for (let i = startPage; i <= endPage; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const block = content.items.map((item) => item.str || "").join(" ");
      texts.push(block);
    }
    const fullText = texts.join("\n\n");
    return { success: true, text: fullText, pages: `${startPage}-${endPage}` };
  } catch (err) {
    return { success: false, error: err.message || "Failed to extract PDF text." };
  }
}

/** Heuristic: lines with ":" -> Q/A; headings + bullet list -> cards. Cap at MAX_CARDS_HEURISTIC. */
export function generateCardsFromText(text) {
  const cards = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const seen = new Set();
  for (let i = 0; i < lines.length && cards.length < MAX_CARDS_HEURISTIC; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx < line.length - 1) {
      const front = line.slice(0, colonIdx).trim();
      const back = line.slice(colonIdx + 1).trim();
      if (front.length > 0 && back.length > 0 && !seen.has(front)) {
        seen.add(front);
        cards.push({ front, back });
      }
    }
  }
  for (let i = 0; i < lines.length && cards.length < MAX_CARDS_HEURISTIC; i++) {
    const line = lines[i];
    if (line.indexOf(":") >= 0) continue;
    const looksLikeHeading = line.length > 0 && line.length < 120 && !/^[-*•]\s/.test(line);
    if (!looksLikeHeading) continue;
    const bullets = [];
    let j = i + 1;
    while (j < lines.length && (/^[-*•]\s/.test(lines[j]) || /^\d+\.\s/.test(lines[j]))) {
      bullets.push(lines[j].replace(/^[-*•]\s/, "").replace(/^\d+\.\s/, "").trim());
      j++;
    }
    if (bullets.length > 0) {
      const front = line;
      const back = bullets.join("; ");
      if (!seen.has(front)) {
        seen.add(front);
        cards.push({ front, back });
      }
      i = j - 1;
    }
  }
  return cards.slice(0, MAX_CARDS_HEURISTIC);
}

/** Stub: generate cards with AI. Not implemented unless API key is present. */
export async function generateCardsWithAI(text) {
  // TODO: when OPENAI_API_KEY (or similar) is present, call OpenAI to generate Q/A pairs from text.
  // Return array of { front, back }. Do not call OpenAI yet.
  return [];
}

/** Upload PDF to Supabase Storage (bucket "pdfs", path userId/timestamp.pdf). Returns path or null. */
export async function uploadPdfToStorage(userId, file) {
  const sb = await getSupabase();
  if (!sb) return null;
  const path = `${userId}/${Date.now()}.pdf`;
  const { error } = await sb.storage.from("pdfs").upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  if (error) {
    console.warn("PDF upload failed:", error);
    return null;
  }
  return path;
}

export function renderImportPdfFlow(appEl, state, { save, setScreen, renderAll, currentUserId, blankCard }) {
  let step = "file";
  let file = null;
  let extractedText = "";
  let pageRange = "";
  let deckTitle = "";
  let generatedCards = [];
  let errorMsg = "";

  function toCard(row) {
    return {
      id: uid(),
      front: row.front || "",
      back: row.back || "",
      stage: 1,
      createdAt: Date.now(),
      lastSeenAt: null,
      stage3Mastered: false,
      longAnswer: false,
    };
  }

  function render() {
    if (step === "file") {
      appEl.innerHTML = `
        <section class="card">
          <h2 style="margin:0; text-align:center;">Import from PDF</h2>
          ${errorMsg ? `<div style="color:#dc2626; font-size:13px; margin-top:12px; padding:8px; background:#fff1f2; border-radius:8px;">${errorMsg}</div>` : ""}
          <p class="small" style="margin-top:12px;">Upload a PDF to extract text and generate cards (heuristic).</p>
          <form id="pdfForm" style="margin-top:16px;">
            <label class="label">PDF file</label>
            <input type="file" id="pdfFile" accept=".pdf,application/pdf" required style="margin-bottom:12px;" />
            <label class="label" for="pageRange">Page range (optional, e.g. 1-5)</label>
            <input type="text" id="pageRange" placeholder="1-10" style="margin-bottom:12px;" />
            <div class="btns" style="margin-top:16px;">
              <button type="submit" class="primary">Extract text</button>
              <button type="button" id="cancelPdf">Cancel</button>
            </div>
          </form>
        </section>
      `;
      appEl.querySelector("#pdfForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        errorMsg = "";
        file = appEl.querySelector("#pdfFile").files[0];
        pageRange = (appEl.querySelector("#pageRange").value || "").trim() || null;
        if (!file) { errorMsg = "Select a PDF file."; render(); return; }
        const result = await extractTextFromPdf(file, pageRange);
        if (!result.success) { errorMsg = result.error || "Extraction failed."; render(); return; }
        extractedText = result.text;
        if (currentUserId) uploadPdfToStorage(currentUserId, file);
        step = "preview";
        render();
      });
      appEl.querySelector("#cancelPdf").addEventListener("click", () => {
        state.importPdf = false;
        save();
        renderAll();
      });
      return;
    }

    if (step === "preview") {
      appEl.innerHTML = `
        <section class="card">
          <h2 style="margin:0; text-align:center;">Import from PDF</h2>
          <p class="small" style="margin-top:12px;">Extracted text (first ${PREVIEW_CHARS} chars):</p>
          <textarea id="previewText" readonly style="width:100%; min-height:120px; margin-top:8px; padding:8px; font-size:13px;"></textarea>
          <label class="label" for="deckTitlePdf" style="margin-top:12px;">Deck title</label>
          <input type="text" id="deckTitlePdf" placeholder="My deck" style="margin-bottom:12px;" />
          <div class="btns" style="margin-top:16px;">
            <button type="button" class="primary" id="genHeuristic">Generate cards (heuristic)</button>
            <button type="button" id="backToFile">Back</button>
          </div>
        </section>
      `;
      const preview = extractedText.slice(0, PREVIEW_CHARS) + (extractedText.length > PREVIEW_CHARS ? "…" : "");
      appEl.querySelector("#previewText").value = preview;
      appEl.querySelector("#deckTitlePdf").value = deckTitle || "";
      appEl.querySelector("#genHeuristic").addEventListener("click", () => {
        deckTitle = (appEl.querySelector("#deckTitlePdf").value || "").trim() || "Imported deck";
        generatedCards = generateCardsFromText(extractedText);
        step = "review";
        render();
      });
      appEl.querySelector("#backToFile").addEventListener("click", () => { step = "file"; errorMsg = ""; render(); });
      return;
    }

    if (step === "review") {
      appEl.innerHTML = `
        <section class="card">
          <h2 style="margin:0; text-align:center;">Import from PDF</h2>
          <p class="small" style="margin-top:12px;">Generated ${generatedCards.length} cards. Add to your deck?</p>
          <div style="margin-top:12px; max-height:200px; overflow:auto;">
            ${generatedCards.slice(0, 15).map((c, i) => `<div class="small" style="margin-top:4px;">${i + 1}. ${(c.front || "").slice(0, 40)}… → ${(c.back || "").slice(0, 30)}…</div>`).join("")}
            ${generatedCards.length > 15 ? `<div class="small" style="margin-top:4px;">… and ${generatedCards.length - 15} more</div>` : ""}
          </div>
          <div class="btns" style="margin-top:16px;">
            <button type="button" class="primary" id="confirmImport">Add to deck</button>
            <button type="button" id="cancelImport">Cancel</button>
          </div>
        </section>
      `;
      appEl.querySelector("#confirmImport").addEventListener("click", () => {
        const newCards = generatedCards.map(toCard);
        state.cards = (state.cards || []).concat(newCards);
        state.importPdf = false;
        save();
        renderAll();
      });
      appEl.querySelector("#cancelImport").addEventListener("click", () => {
        state.importPdf = false;
        save();
        renderAll();
      });
      return;
    }
  }

  render();
}
