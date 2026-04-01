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

// Allow any browser origin. The X-Proxy-Secret header is the real security gate;
// restricting by Origin adds negligible protection and breaks LAN / non-localhost access.
function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin) {
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

// ── Tagged-text card parser ───────────────────────────────────────────────────

/**
 * Parses the model's tagged plain-text output into card objects.
 *
 * Expected format:
 *   CARD
 *   FRONT: What is a "sect"?
 *   BACK: a subgroup within a larger religious body
 *
 * Returns an array of { front, back } objects with empty cards filtered out.
 * This format tolerates quotes, control characters, and any other text that
 * would break JSON.parse — there is nothing to escape or encode.
 */
function parseTaggedCards(text) {
  const cards = [];
  // Split on blank lines or lines containing only "CARD"
  const blocks = text.split(/(?:^|\n)\s*CARD\s*(?:\n|$)/i);
  for (const block of blocks) {
    let front = null;
    let back = null;
    for (const raw of block.split("\n")) {
      const line = raw.trimEnd();
      if (front === null && /^FRONT:\s*/i.test(line)) {
        front = line.replace(/^FRONT:\s*/i, "").trim();
      } else if (back === null && /^BACK:\s*/i.test(line)) {
        back = line.replace(/^BACK:\s*/i, "").trim();
      } else if (front !== null && back === null && !/^BACK:\s*/i.test(line) && line !== "") {
        // multi-line FRONT (rare but possible) — append
        front += " " + line.trim();
      } else if (back !== null && line !== "" && !/^FRONT:\s*/i.test(line)) {
        // multi-line BACK — append
        back += " " + line.trim();
      }
    }
    if (front && back) cards.push({ front: front.trim(), back: back.trim() });
  }
  return cards;
}

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
  // Health check — must respond before any other logic so Railway does not
  // consider the service unhealthy and restart the container.
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  try {

  console.log(`[req] ${req.method} ${req.url} origin=${req.headers.origin ?? "(none)"}`);

  setCorsHeaders(req, res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    console.log(`[cors] preflight → 204`);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || (req.url !== "/grade" && req.url !== "/generate-deck")) {
    console.log(`[req] 404 — unrecognized method/path`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  // ── Rate limit ──────────────────────────────────────────────────────────────
  const ip = req.socket.remoteAddress || "unknown";
  if (!checkRateLimit(ip)) {
    console.log(`[req] 429 — rate limit for ${ip}`);
    res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "60" });
    res.end(JSON.stringify({ error: "Too many requests. Please wait a minute." }));
    return;
  }

  // ── Proxy secret ────────────────────────────────────────────────────────────
  if (PROXY_SECRET && req.headers["x-proxy-secret"] !== PROXY_SECRET) {
    console.log(`[req] 401 — proxy secret mismatch`);
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (req.url === "/generate-deck") {
    console.log("[generate-deck] entered handler");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }));
      return;
    }

    let input;
    try {
      input = await readBody(req);
      console.log("[generate-deck] body parsed, text length:", input?.text?.length ?? 0);
    } catch (e) {
      console.error("[generate-deck] body parse error:", e.message);
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
    console.log("[generate-deck] validation passed");

    const maxChars = 40000;
    const truncatedText = text.length > maxChars ? text.slice(0, maxChars) + "\n[... content truncated ...]" : text;

    const deckPrompt = `You are a flashcard generator. Create as many high-quality flashcards as the text warrants — no padding, no repetition.

- FRONT: one concise question (1 sentence)
- BACK: shortest complete answer
- Cover every significant, testable idea
- Output ONLY the CARD/FRONT/BACK format below — no JSON, no markdown, no commentary

Text:
${truncatedText}

Respond in exactly this format, one card per concept:
CARD
FRONT: question here
BACK: answer here`;

    const anthropicBody = {
      model: MODEL,
      max_tokens: 3000,
      temperature: 0,
      messages: [{ role: "user", content: deckPrompt }],
    };

    // Railway's gateway timeout is 60 s. Time out the Anthropic call at 55 s so
    // Node can send a clean 502 before Railway returns an opaque 503.
    const ANTHROPIC_TIMEOUT_MS = 55_000;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Anthropic request timed out after ${ANTHROPIC_TIMEOUT_MS / 1000}s`)), ANTHROPIC_TIMEOUT_MS)
    );

    let anthropicResponse;
    console.log("[generate-deck] calling Anthropic, prompt chars:", deckPrompt.length);
    const t0 = Date.now();
    try {
      anthropicResponse = await Promise.race([callAnthropic(apiKey, anthropicBody), timeoutPromise]);
      console.log(`[generate-deck] Anthropic responded in ${Date.now() - t0}ms, status=${anthropicResponse.status}, body bytes=${anthropicResponse.body.length}`);
    } catch (e) {
      console.error(`[generate-deck] Anthropic call failed after ${Date.now() - t0}ms:`, e.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message.includes("timed out") ? "Deck generation timed out — try a shorter document." : "Upstream request to Anthropic failed." }));
      return;
    }

    // 529 overloaded — do not auto-retry; the payload is large and a duplicate
    // call would cost the same tokens with low odds of success. Return a clean
    // retryable error so the client can prompt the user to try again manually.
    if (anthropicResponse.status === 529) {
      console.warn("[generate-deck] Anthropic 529 overloaded — returning retryable error (no auto-retry)");
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "AI is currently overloaded. Please wait a moment and try again." }));
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
      console.log("[generate-deck] extracted model text, length:", claudeText.length);
    } catch (e) {
      console.error("[generate-deck] Failed to parse Anthropic response body:", anthropicResponse.body);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Could not parse Anthropic response." }));
      return;
    }

    // Primary path: tagged plain-text parsing (deterministic, no JSON escaping issues)
    console.log("[generate-deck] parsing tagged output, first 80 chars:", claudeText.slice(0, 80));
    let cards = parseTaggedCards(claudeText);
    let parsePath = "tagged";

    if (cards.length === 0) {
      // Fallback: model may have returned JSON despite instructions — try parsing it
      console.warn("[generate-deck] tagged parse yielded 0 cards — attempting JSON fallback");
      const jsonText = claudeText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();
      try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed) && parsed.length > 0) {
          cards = parsed;
          parsePath = "json-fallback";
          console.log("[generate-deck] JSON fallback parsed", cards.length, "cards");
        }
      } catch (_) {
        // JSON fallback also failed — log and return error
      }
    }

    if (cards.length === 0) {
      console.error("[generate-deck] all parse paths yielded 0 cards — raw text:", claudeText.slice(0, 300));
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Claude did not return parseable flashcard content." }));
      return;
    }

    console.log(`[generate-deck] parsed ${cards.length} cards via ${parsePath}`);

    const result = cards
      .filter(c => typeof c.front === "string" && typeof c.back === "string")
      .map(c => ({ front: c.front.trim(), back: c.back.trim() }));

    console.log("[generate-deck] sending", result.length, "cards → 200");
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

server.on("error", (err) => {
  console.error("[server error]", err);
  process.exit(1);  // Force Railway to show the real error and restart cleanly
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI grading proxy listening on 0.0.0.0:${PORT}`);
  console.log(`POST http://localhost:${PORT}/grade`);
});
