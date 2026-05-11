import { mistral } from "../lib/mistral.js";

type GeneratePronunciationGuidanceInput = {
  originalText: string;
  translatedText: string;
  sourceLanguageCode?: string;
  sourceLanguage: string;
  targetLanguageCode?: string;
  targetLanguage: string;
};

type PronunciationGuidance = {
  originalPronunciation: string;
  translatedPronunciation: string;
};

function coercePronunciationValue(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim().replace(/^pronounce:\s*/i, "");

  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function coercePronunciationGuidance(value: unknown): PronunciationGuidance {
  if (!value || typeof value !== "object") {
    return {
      originalPronunciation: "",
      translatedPronunciation: "",
    };
  }

  return {
    originalPronunciation: coercePronunciationValue(
      (value as { originalPronunciation?: unknown }).originalPronunciation,
    ),
    translatedPronunciation: coercePronunciationValue(
      (value as { translatedPronunciation?: unknown }).translatedPronunciation,
    ),
  };
}

export async function generatePronunciationGuidance(
  input: GeneratePronunciationGuidanceInput,
): Promise<PronunciationGuidance> {
  const scriptRules = [
    input.targetLanguageCode === "fa"
      ? "For originalPronunciation, use Persian script only. Never use Latin letters."
      : null,
    input.sourceLanguageCode === "fa"
      ? "For translatedPronunciation, use Persian script only. Never use Latin letters."
      : null,
    input.targetLanguageCode === "en"
      ? "For originalPronunciation, use Latin letters only."
      : null,
    input.sourceLanguageCode === "en"
      ? "For translatedPronunciation, use Latin letters only."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const response = await mistral.chat.complete({
    model: process.env.MISTRAL_TRANSLATION_MODEL ?? "mistral-small-latest",
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          `You generate short pronunciation guides for bilingual chat bubbles. Return only a JSON object with the keys originalPronunciation and translatedPronunciation. Do not translate the meaning. Do not include labels, quotation marks, or parentheses. Do not use IPA. For originalPronunciation, write a phonetic guide that a target-language speaker can read aloud to approximate the original text, using the target language's writing system. For translatedPronunciation, write a phonetic guide that a source-language speaker can read aloud to approximate the translated text, using the source language's writing system. When the writing system is Latin-based, use a simple sound-it-out style and add stress capitalization or hyphens only when helpful. ${scriptRules}`,
      },
      {
        role: "user",
        content: `Source language: ${input.sourceLanguage}
Source language code: ${input.sourceLanguageCode ?? ""}
Target language: ${input.targetLanguage}
Target language code: ${input.targetLanguageCode ?? ""}

Original text:
${input.originalText}

Translated text:
${input.translatedText}

Return JSON only.

Example shape:
{"originalPronunciation":"...", "translatedPronunciation":"..."}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Pronunciation guidance response did not contain JSON text.");
  }

  return coercePronunciationGuidance(JSON.parse(content));
}
