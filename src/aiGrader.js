import { config } from "./config.js";
const PROXY_URL     = `${config?.aiProxyUrl    || "http://localhost:3001"}/grade`;
const PROXY_SECRET  =  config?.proxySecret     || "";

// ── Grading cache ─────────────────────────────────────────────────────────────
// In-memory, session-scoped. Identical inputs (same card + same answer) reuse
// the cached result instead of calling the proxy again. Only successful
// responses are cached; errors always retry.
const _gradeCache = new Map();

function _cacheKey(promptFront, expectedAnswer, userAnswer) {
  const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return `${norm(promptFront)}||${norm(expectedAnswer)}||${norm(userAnswer)}`;
}

const ERROR_RESULT = {
  correct: false,
  score: 0,
  missingPoints: [],
  incorrectClaims: [],
  feedback: "AI grading unavailable. Please check your internet connection.",
};

/**
 * Grades a long-answer card by calling the local proxy server,
 * which forwards the request to the Anthropic Claude API.
 *
 * @param {{ promptFront: string, expectedAnswer: string, userAnswer: string, cardStage: number }}
 * @returns {Promise<{ correct: boolean, score: number, missingPoints: string[], incorrectClaims: string[], feedback: string }>}
 */
export async function gradeLongAnswer({ promptFront, expectedAnswer, userAnswer }) {
  if (!expectedAnswer?.trim() || !userAnswer?.trim()) {
    return { ...ERROR_RESULT, feedback: "Please provide an answer." };
  }

  const key = _cacheKey(promptFront, expectedAnswer, userAnswer);
  if (_gradeCache.has(key)) return _gradeCache.get(key);

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(PROXY_SECRET ? { "X-Proxy-Secret": PROXY_SECRET } : {}),
      },
      body: JSON.stringify({ promptFront, expectedAnswer, userAnswer }),
    });

    if (!response.ok) {
      console.error("Proxy error:", response.status, await response.text());
      return ERROR_RESULT;
    }

    const result = await response.json();
    _gradeCache.set(key, result);
    return result;
  } catch (err) {
    console.error("gradeLongAnswer error:", err);
    return ERROR_RESULT;
  }
}
