import { createOpenAiResponse } from "../lib/openai.js";
import {
  getWritingSystemLabel,
  requiresPhoneticGuide,
} from "../lib/languages.js";

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

type GeneratePronunciationLineInput = {
  text: string;
  textLanguage: string;
  textLanguageCode?: string;
  readerLanguage: string;
  readerLanguageCode?: string;
  disallowedCopyText?: string;
};

const PERSIAN_SCRIPT_REGEX = /[\u0600-\u06FF]/;
const LATIN_SCRIPT_REGEX = /[A-Za-z]/;
const HAN_SCRIPT_REGEX = /[\u4E00-\u9FFF]/;

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

function normalizeComparableText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function getScriptInstruction(input: GeneratePronunciationLineInput) {
  if (input.textLanguageCode === "zh" && input.readerLanguageCode !== "fa") {
    return "Use standard Mandarin Hanyu Pinyin with tone marks (e.g., Nǐ hǎo, Xièxie). Use Latin letters with tone diacritics only; never output Chinese characters. This is a Pinyin pronunciation guide, not a meaning translation.";
  }

  const languageCode = input.readerLanguageCode;
  const writingSystemLabel = getWritingSystemLabel(languageCode);

  if (languageCode === "fa") {
    return "Use Persian script only. Never use Latin letters. This is a sound-out guide, not a Persian translation.";
  }

  if (languageCode === "en" || languageCode === "zh") {
    return "Use Latin letters only. Do not use Persian script or Chinese characters. This is a sound-out guide, not a meaning translation.";
  }

  if (writingSystemLabel) {
    return `Use the reader's everyday ${writingSystemLabel}. Return a pronunciation guide, not a meaning translation.`;
  }

  return "Use the everyday writing system that the reader language uses. Return a pronunciation guide, not a meaning translation.";
}

function getDirectionExample(input: GeneratePronunciationLineInput) {
  if (input.textLanguageCode === "zh" && input.readerLanguageCode !== "fa") {
    return `Example:
Input text: 你好，很高兴认识你！
Good output: Nǐ hǎo, hěn gāoxìng rènshi nǐ!
Bad output: Hello, nice to meet you!`;
  }

  if (input.readerLanguageCode === "fa" && input.textLanguageCode === "en") {
    return `Example:
Input text: Do you need help?
Good output: دو یو نید هِلپ؟
Bad output: آیا به کمک نیاز دارید؟`;
  }

  if (input.readerLanguageCode === "en" && input.textLanguageCode === "fa") {
    return `Example:
Input text: آیا به کمک نیاز دارید؟
Good output: aa-YAA be KO-mak ni-YAAZ daa-REED
Bad output: Do you need help?`;
  }

  if (input.readerLanguageCode === "fa") {
    return `Example:
Input text: Hey Grandma!
Good output: هِی گْرَندْما!
Bad output: سلام مامان بزرگ`;
  }

  if (input.readerLanguageCode === "en") {
    return `Example:
Input text: سلام مامان بزرگ
Good output: sa-LAM ma-MAAN bo-ZORG
Bad output: Hello Grandma`;
  }

  return "";
}

function validatePronunciationLine(
  value: string,
  input: GeneratePronunciationLineInput,
) {
  if (!value) {
    return "";
  }

  const normalizedValue = normalizeComparableText(value);
  const normalizedDisallowedCopy = input.disallowedCopyText
    ? normalizeComparableText(input.disallowedCopyText)
    : "";

  if (
    normalizedValue &&
    normalizedDisallowedCopy &&
    normalizedValue === normalizedDisallowedCopy
  ) {
    return "";
  }

  if (input.textLanguageCode === "zh" && input.readerLanguageCode !== "fa") {
    if (!LATIN_SCRIPT_REGEX.test(value) || HAN_SCRIPT_REGEX.test(value)) {
      return "";
    }
  }

  if (input.readerLanguageCode === "fa") {
    if (!PERSIAN_SCRIPT_REGEX.test(value) || LATIN_SCRIPT_REGEX.test(value)) {
      return "";
    }
  }

  if (input.readerLanguageCode === "en") {
    if (!LATIN_SCRIPT_REGEX.test(value) || PERSIAN_SCRIPT_REGEX.test(value)) {
      return "";
    }
  }

  return value;
}

async function generatePronunciationLine(
  input: GeneratePronunciationLineInput,
) {
  if (!requiresPhoneticGuide(input.textLanguageCode, input.readerLanguageCode)) {
    return "";
  }

  const response = await createOpenAiResponse({
    model:
      process.env.OPENAI_PRONUNCIATION_MODEL?.trim() ||
      process.env.OPENAI_TRANSLATION_MODEL?.trim() ||
      "gpt-4o-mini",
    instructions: `You write one-line pronunciation guides for chat bubbles. Return only the pronunciation line. Do not translate the meaning. Do not explain. Do not add labels, quotation marks, or parentheses. Do not use IPA unless the user's writing system already uses plain Latin letters. Preserve the original word order. ${getScriptInstruction(input)} ${getDirectionExample(input)}`,
    input: `Text language: ${input.textLanguage}
Text language code: ${input.textLanguageCode ?? ""}
Reader language: ${input.readerLanguage}
Reader language code: ${input.readerLanguageCode ?? ""}
${input.disallowedCopyText ? `Meaning-equivalent text to avoid copying:\n${input.disallowedCopyText}\n` : ""}
Text to sound out:
${input.text}

Return only the pronunciation line.`,
  });

  return validatePronunciationLine(coercePronunciationValue(response), input);
}

export async function generatePronunciationGuidance(
  input: GeneratePronunciationGuidanceInput,
): Promise<PronunciationGuidance> {
  const [originalPronunciationResult, translatedPronunciationResult] =
    await Promise.allSettled([
      generatePronunciationLine({
        text: input.originalText,
        textLanguage: input.sourceLanguage,
        textLanguageCode: input.sourceLanguageCode,
        readerLanguage: input.targetLanguage,
        readerLanguageCode: input.targetLanguageCode,
        disallowedCopyText: input.translatedText,
      }),
      generatePronunciationLine({
        text: input.translatedText,
        textLanguage: input.targetLanguage,
        textLanguageCode: input.targetLanguageCode,
        readerLanguage: input.sourceLanguage,
        readerLanguageCode: input.sourceLanguageCode,
        disallowedCopyText: input.originalText,
      }),
    ]);

  if (originalPronunciationResult.status === "rejected") {
    console.error("Original pronunciation guidance failed");
  }

  if (translatedPronunciationResult.status === "rejected") {
    console.error("Translated pronunciation guidance failed");
  }

  return {
    originalPronunciation:
      originalPronunciationResult.status === "fulfilled"
        ? originalPronunciationResult.value
        : "",
    translatedPronunciation:
      translatedPronunciationResult.status === "fulfilled"
        ? translatedPronunciationResult.value
        : "",
  };
}
