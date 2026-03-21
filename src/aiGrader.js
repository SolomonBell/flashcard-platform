import { config } from "./config.js";
const PROXY_URL = `${config?.aiProxyUrl || "http://localhost:3001"}/grade`;

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

  try {
    const response = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptFront, expectedAnswer, userAnswer }),
    });

    if (!response.ok) {
      console.error("Proxy error:", response.status, await response.text());
      return ERROR_RESULT;
    }

    return await response.json();
  } catch (err) {
    console.error("gradeLongAnswer error:", err);
    return ERROR_RESULT;
  }
}
