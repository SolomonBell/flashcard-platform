// Local AI-like grader for long answer cards
// No external services, deterministic scoring

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
  "from", "as", "is", "was", "are", "were", "been", "be", "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might", "must", "can", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "what", "which", "who", "where", "when", "why", "how"
]);

function extractKeyPoints(text) {
  if (!text || !text.trim()) return [];
  
  // Split by lines first (preserve line breaks)
  const lines = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);
  
  // Then split each line by sentences, bullets, or markers
  const points = [];
  for (const line of lines) {
    // Check if line starts with bullet markers
    if (/^[•\-\*]\s+/.test(line)) {
      points.push(line.replace(/^[•\-\*]\s+/, "").trim());
    } else {
      // Split by sentence endings
      const sentences = line.split(/[.!?]\s+/).map(s => s.trim()).filter(s => s.length > 0);
      points.push(...sentences);
    }
  }
  
  // Filter out trivial points (too short or just punctuation)
  return points.filter(p => p.length > 10 || p.split(/\s+/).length > 2);
}

function extractKeywords(text) {
  if (!text || !text.trim()) return [];
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 4 && !STOPWORDS.has(w));
  
  // Remove duplicates
  return [...new Set(words)];
}

function fuzzyMatchPoint(expectedPoint, userText) {
  const expectedLower = expectedPoint.toLowerCase();
  const userLower = userText.toLowerCase();
  
  // Exact match
  if (userLower.includes(expectedLower) || expectedLower.includes(userLower)) {
    return true;
  }
  
  // Keyword overlap: if most keywords from expected are in user answer
  const expectedKeywords = extractKeywords(expectedPoint);
  if (expectedKeywords.length === 0) return false;
  
  const matchedKeywords = expectedKeywords.filter(kw => userLower.includes(kw));
  const matchRatio = matchedKeywords.length / expectedKeywords.length;
  
  return matchRatio >= 0.6; // 60% keyword overlap
}

export function gradeLongAnswer({ promptFront, expectedAnswer, userAnswer, cardStage }) {
  if (!expectedAnswer || !userAnswer) {
    return {
      correct: false,
      score: 0,
      missingPoints: [],
      incorrectClaims: [],
      feedback: "Please provide an answer.",
    };
  }

  const expected = expectedAnswer.trim();
  const user = userAnswer.trim();
  
  if (!expected || !user) {
    return {
      correct: false,
      score: 0,
      missingPoints: [],
      incorrectClaims: [],
      feedback: "Please provide an answer.",
    };
  }

  // Extract key points from expected answer
  const keyPoints = extractKeyPoints(expected);
  const expectedKeywords = extractKeywords(expected);
  const userKeywords = extractKeywords(user);
  
  // Score based on key point matches
  let matchedPoints = 0;
  const missingPointsList = [];
  
  for (const point of keyPoints) {
    if (fuzzyMatchPoint(point, user)) {
      matchedPoints += 1;
    } else {
      // Only add to missing if it's a substantial point (not just a single word)
      if (point.length > 20 || point.split(/\s+/).length > 3) {
        missingPointsList.push(point);
      }
    }
  }
  
  const pointScore = keyPoints.length > 0 ? matchedPoints / keyPoints.length : 0;
  
  // Score based on keyword overlap
  const keywordOverlap = expectedKeywords.length > 0
    ? userKeywords.filter(kw => expectedKeywords.includes(kw)).length / expectedKeywords.length
    : 0;
  
  // Combined score (weighted: 60% points, 40% keywords)
  const score = keyPoints.length > 0
    ? pointScore * 0.6 + keywordOverlap * 0.4
    : keywordOverlap;
  
  // Threshold based on stage
  const threshold = cardStage === 3 ? 0.85 : 0.70;
  const correct = score >= threshold;
  
  // Generate feedback (1-3 short sentences, actionable)
  let feedback = "";
  const topMissing = missingPointsList.slice(0, 3);
  
  if (correct) {
    feedback = "Good answer! You covered the key concepts.";
  } else {
    if (topMissing.length > 0) {
      // Build actionable feedback
      const firstMissing = topMissing[0];
      if (topMissing.length === 1) {
        feedback = `Your answer is missing: ${firstMissing}. Include this concept in your response.`;
      } else if (topMissing.length === 2) {
        feedback = `Your answer is missing: ${firstMissing}. Also consider: ${topMissing[1]}.`;
      } else {
        feedback = `Your answer is missing several key points. Focus on: ${firstMissing}. Also include: ${topMissing[1]}.`;
      }
    } else if (score < 0.5) {
      feedback = "Your answer doesn't cover enough of the expected content. Review the material and include more key concepts.";
    } else {
      feedback = "Your answer is close but missing some important details. Review the key concepts and try to be more comprehensive.";
    }
  }
  
  return {
    correct,
    score: Math.round(score * 100) / 100, // Round to 2 decimals
    missingPoints: topMissing,
    matchedPoints: matchedPoints, // Optional, for future use
    incorrectClaims: [], // Keep empty for now
    feedback,
  };
}
