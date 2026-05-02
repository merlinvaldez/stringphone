export const SUPPORTED_TTS_LANGUAGES: Record<string, string> = {
  en: "English",
  english: "English",
  fr: "French",
  french: "French",
  es: "Spanish",
  spanish: "Spanish",
  pt: "Portuguese",
  portuguese: "Portuguese",
  it: "Italian",
  italian: "Italian",
  nl: "Dutch",
  dutch: "Dutch",
  de: "German",
  german: "German",
  hi: "Hindi",
  hindi: "Hindi",
  ar: "Arabic",
  arabic: "Arabic",
  fa: "Persian",
  farsi: "Persian",
  persian: "Persian",
};

export const CANONICAL_TTS_LANGUAGES = [
  "English",
  "French",
  "Spanish",
  "Portuguese",
  "Italian",
  "Dutch",
  "German",
  "Hindi",
  "Arabic",
  "Persian",
] as const;

export function normalizeTargetLanguage(targetLanguage: unknown) {
  if (typeof targetLanguage !== "string" || !targetLanguage.trim()) {
    return null;
  }

  return SUPPORTED_TTS_LANGUAGES[targetLanguage.trim().toLowerCase()] ?? null;
}
