/**
 * Local AI grading proxy server.
 *
 * Forwards POST /grade requests to the Anthropic API, working around the
 * browser's CORS restriction on direct calls to api.anthropic.com.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node server/aiProxy.js
 *
 * Listens on http://localhost:3001
 * No external dependencies — uses only Node built-ins.
 */

"use strict";

const http  = require("http");
const https = require("https");

const PORT = process.env.PORT || 3001;  // process.env.PORT is required for Railway
const ANTHROPIC_HOST = "api.anthropic.com";
const ANTHROPIC_PATH = "/v1/messages";
const MODEL = "claude-3-haiku-20240307";

// ── CORS helper ─────────────────────────────────────────────────────────────

// Update ALLOWED_ORIGINS before deploying to production.
// Add your production domain (e.g. "https://firststepstudy.com") to the list.
const ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "https://flashcard-platform-azure.vercel.app",
  "https://firststepstudy.com",
  "https://www.firststepstudy.com",
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Proxy-Secret");
  res.setHeader("Vary", "Origin");
}

// ── Proxy secret ─────────────────────────────────────────────────────────────

// Set PROXY_SECRET env var when running the server and add the same value
// to src/config.js as proxySecret so the frontend includes it on every request.
// This stops casual abuse from tools like curl; it is not a substitute for RLS.
const PROXY_SECRET = process.env.PROXY_SECRET || "";

// ── Rate limiter (per-IP, in-memory, 10 req / 60 s) ──────────────────────────

const MAX_BODY_BYTES   = 2 * 1024 * 1024;  // 2 MB
const RATE_LIMIT_MAX   = 10;
const RATE_LIMIT_WINDOW = 60_000;           // ms

const _rateLimiter = new Map();

function checkRateLimit(ip) {
  const now  = Date.now();
  let   entry = _rateLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  }
  entry.count++;
  _rateLimiter.set(ip, entry);
  return entry.count <= RATE_LIMIT_MAX;
}

// Purge expired entries every 5 minutes to prevent unbounded memory growth.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateLimiter) {
    if (now > entry.resetAt) _rateLimiter.delete(ip);
  }
}, 5 * 60_000).unref();

// ── Anthropic forwarding ─────────────────────────────────────────────────────

function buildPrompt(promptFront, expectedAnswer, userAnswer) {
  return `You are grading a student's written answer using a teacher-provided reference answer.

Question:
${promptFront}

Reference Answer:
${expectedAnswer}

Student Answer:
${userAnswer}

Treat the reference answer as the grading rubric.
Students may paraphrase, but they must include all major ideas from the reference answer.

Your task:
1. Identify the major ideas in the reference answer.
2. Check whether each major idea appears in the student answer.
3. If any major idea is missing, list it clearly and specifically.
4. Write feedback directly to the student, naming what was missing.

Return ONLY valid JSON in this format:

{
  "correct": boolean,
  "missingPoints": ["specific missing idea 1", "specific missing idea 2"],
  "incorrectClaims": [],
  "feedback": "Explain exactly which idea or ideas were missing from the student's answer."
}

Rules:
- Do not give vague feedback like "missing key ideas" unless you also name them.
- Keep missingPoints concrete and short.
- If the answer is incomplete, feedback must explicitly mention the missing idea(s).
- correct = true only if all major ideas from the reference answer are present.
- Write feedback as if you are explaining what the teacher expected.
- If something is missing, phrase it as: "The expected answer includes…" followed by the missing idea.
- Do NOT use the phrase "reference answer" anywhere in the feedback field.
- Keep feedback concise: 1–2 sentences maximum.`;
}

function callAnthropic(apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);

    const options = {
      hostname: ANTHROPIC_HOST,
      path: ANTHROPIC_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ status: res.statusCode, body: data });
      });
    });

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── Request handler ──────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data  = "";
    let bytes = 0;
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        return reject(new Error("Request body too large (2 MB max)"));
      }
      data += chunk;
    });
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error("Invalid JSON in request body")); }
    });
    req.on("error", reject);
  });
}

// ── Process-level safety net ─────────────────────────────────────────────────
// Prevents the process from dying silently on any unhandled async error.

process.on("uncaughtException",  (err) => console.error("[uncaughtException]",  err));
process.on("unhandledRejection", (err) => console.error("[unhandledRejection]", err));

const server = http.createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  try {

  setCorsHeaders(req, res);

  // Health check — Railway and uptime monitors use this.
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || (req.url !== "/grade" && req.url !== "/generate-deck")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Too many requests. Please wait a minute." }));
    return;
  }

  // ── Proxy secret ────────────────────────────────────────────────────────────
  if (PROXY_SECRET && req.headers["x-proxy-secret"] !== PROXY_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (req.url === "/generate-deck") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }));
      return;
    }

    let input;
    try {
      input = await readBody(req);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }

    const { text } = input;
    if (!text?.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "text is required." }));
      return;
    }

    const maxChars = 40000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) + "\n[... content truncated ...]" : text;

    const deckPrompt = `You are a flashcard generator. Read the following text and create as many high-quality flashcards as the material warrants — enough to cover all important facts, definitions, concepts, and ideas, but without padding or repetition.

Rules:
- Each "front" is a concise question or prompt (1 sentence max)
- Each "back" is the correct answer (as short as possible while still complete)
- Cover every significant, testable idea in the text
- Do not repeat the same concept twice even with different wording
- Do not include trivial, obvious, or filler cards
- Generate more cards for dense material, fewer for sparse material — let the content guide the count

Text:
${truncatedText}

Return ONLY valid JSON — an array of objects, no markdown fences, no commentary:
[
  { "front": "question", "back": "answer" },
  ...
]`;

    const anthropicBody = {
      model: MODEL,
      max_tokens: 3000,
      temperature: 0.3,
      messages: [{ role: "user", content: deckPrompt }],
    };

    let anthropicResponse;
    try {
      anthropicResponse = await callAnthropic(apiKey, anthropicBody);
    } catch (e) {
      console.error("Anthropic request failed:", e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Upstream request to Anthropic failed." }));
      return;
    }

    if (anthropicResponse.status !== 200) {
      let parsedError = null;
      try { parsedError = JSON.parse(anthropicResponse.body); } catch (_) {}
      console.error("[generate-deck] Anthropic error", {
        status: anthropicResponse.status,
        model: MODEL,
        endpoint: ANTHROPIC_PATH,
        errorType: parsedError?.error?.type ?? null,
        errorMessage: parsedError?.error?.message ?? null,
        rawBody: anthropicResponse.body,
      });
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Anthropic returned ${anthropicResponse.status}` }));
      return;
    }

    let claudeText;
    try {
      const parsed = JSON.parse(anthropicResponse.body);
      claudeText = parsed?.content?.[0]?.text ?? "";
    } catch (e) {
      console.error("[generate-deck] Failed to parse Anthropic response body:", anthropicResponse.body);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Could not parse Anthropic response." }));
      return;
    }

    const jsonText = claudeText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let cards;
    try {
      cards = JSON.parse(jsonText);
      if (!Array.isArray(cards)) throw new Error("Expected array");
    } catch (e) {
      console.error("Claude returned non-JSON for deck generation:", claudeText);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Claude did not return valid JSON." }));
      return;
    }

    const result = cards
      .filter(c => typeof c.front === "string" && typeof c.back === "string")
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ cards: result }));
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }));
    return;
  }

  let input;
  try {
    input = await readBody(req);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
    return;
  }

  const { promptFront, expectedAnswer, userAnswer } = input;

  if (!expectedAnswer?.trim() || !userAnswer?.trim()) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "expectedAnswer and userAnswer are required." }));
    return;
  }

  const anthropicBody = {
    model: MODEL,
    max_tokens: 400,
    temperature: 0,
    messages: [{
      role: "user",
      content: buildPrompt(promptFront || "", expectedAnswer, userAnswer),
    }],
  };

  let anthropicResponse;
  try {
    anthropicResponse = await callAnthropic(apiKey, anthropicBody);
  } catch (e) {
    console.error("Anthropic request failed:", e.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Upstream request to Anthropic failed." }));
    return;
  }

  if (anthropicResponse.status !== 200) {
    let parsedError = null;
    try { parsedError = JSON.parse(anthropicResponse.body); } catch (_) {}
    console.error("[grade] Anthropic error", {
      status: anthropicResponse.status,
      model: MODEL,
      endpoint: ANTHROPIC_PATH,
      errorType: parsedError?.error?.type ?? null,
      errorMessage: parsedError?.error?.message ?? null,
      rawBody: anthropicResponse.body,
    });
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Anthropic returned ${anthropicResponse.status}` }));
    return;
  }

  // Parse Anthropic response and extract the model's text content
  let claudeText;
  try {
    const parsed = JSON.parse(anthropicResponse.body);
    claudeText = parsed?.content?.[0]?.text ?? "";
  } catch (e) {
    console.error("Failed to parse Anthropic response:", e.message);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Could not parse Anthropic response." }));
    return;
  }

  // Strip markdown code fences if Claude wraps the JSON anyway
  const jsonText = claudeText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let gradeResult;
  try {
    gradeResult = JSON.parse(jsonText);
  } catch (e) {
    console.error("Claude returned non-JSON:", claudeText);
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Claude did not return valid JSON." }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    correct:         Boolean(gradeResult.correct),
    missingPoints:   Array.isArray(gradeResult.missingPoints)   ? gradeResult.missingPoints   : [],
    incorrectClaims: Array.isArray(gradeResult.incorrectClaims) ? gradeResult.incorrectClaims : [],
    feedback:        typeof gradeResult.feedback === "string"   ? gradeResult.feedback        : "",
  }));

  } catch (err) {
    console.error("[handler crash]", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI grading proxy listening on 0.0.0.0:${PORT}`);
  console.log(`POST http://localhost:${PORT}/grade`);
});
