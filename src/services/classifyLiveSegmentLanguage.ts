import { createOpenAiResponse } from "../lib/openai.js";

export type LiveSegmentLanguageClassification = {
  languageCode: string;
  confidence: number;
};

function coerceConfidence(value: unknown) {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(1, Math.max(0, numericValue));
}

function normalizeLanguageCode(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function classifyLiveSegmentLanguage(input: {
  transcript: string;
  myLanguageCode: string;
  myLanguage: string;
  theirLanguageCode: string;
  theirLanguage: string;
}): Promise<LiveSegmentLanguageClassification> {
  const myLanguageCode = normalizeLanguageCode(input.myLanguageCode);
  const theirLanguageCode = normalizeLanguageCode(input.theirLanguageCode);
  const fallback = {
    languageCode: myLanguageCode,
    confidence: 0,
  };

  if (!input.transcript.trim() || !myLanguageCode || !theirLanguageCode) {
    return fallback;
  }

  if (myLanguageCode === theirLanguageCode) {
    return {
      languageCode: myLanguageCode,
      confidence: 1,
    };
  }

  try {
    const response = await createOpenAiResponse({
      model:
        process.env.OPENAI_LIVE_LANGUAGE_MODEL?.trim() ||
        process.env.OPENAI_TRANSLATION_MODEL?.trim() ||
        "gpt-4o-mini",
      instructions: `Classify the transcript as one of exactly two selected languages. Never identify, infer, or return any third language. Return only JSON with this shape:
{
  "languageCode": "${myLanguageCode} | ${theirLanguageCode}",
  "confidence": 0.0
}
Use "${myLanguageCode}" only for ${input.myLanguage}. Use "${theirLanguageCode}" only for ${input.theirLanguage}. If the transcript is mixed, unclear, or too short, choose the closer of those two selected languages with low confidence.`,
      input: `Transcript:\n${input.transcript}`,
    });

    const parsed = JSON.parse(response) as {
      languageCode?: unknown;
      confidence?: unknown;
    };
    const languageCode = normalizeLanguageCode(parsed.languageCode);

    if (languageCode === myLanguageCode || languageCode === theirLanguageCode) {
      return {
        languageCode,
        confidence: coerceConfidence(parsed.confidence),
      };
    }
  } catch (error) {
    console.error("Live segment language classification failed", error);
  }

  return fallback;
}
