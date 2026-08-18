import { mistral } from "../lib/mistral.js";

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
    const response = await mistral.chat.complete({
      model:
        process.env.MISTRAL_LIVE_LANGUAGE_MODEL ??
        process.env.MISTRAL_TRANSLATION_MODEL ??
        "mistral-small-latest",
      responseFormat: { type: "json_object" },
      maxTokens: 120,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Classify the transcript as one of exactly two selected languages. Never identify, infer, or return any third language. Return only JSON with this shape:
{
  "languageCode": "${myLanguageCode} | ${theirLanguageCode}",
  "confidence": 0.0
}
Use "${myLanguageCode}" only for ${input.myLanguage}. Use "${theirLanguageCode}" only for ${input.theirLanguage}. If the transcript is mixed, unclear, or too short, choose the closer of those two selected languages with low confidence.`,
        },
        {
          role: "user",
          content: `Transcript:\n${input.transcript}`,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return fallback;
    }

    const parsed = JSON.parse(content) as {
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
