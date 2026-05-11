export type TtsProvider = "mistral" | "cartesia" | "elevenlabs";

export type SupportedTtsLanguage = {
  code: string;
  name: string;
  provider: TtsProvider;
  aliases: readonly string[];
};

export const SUPPORTED_TTS_LANGUAGE_OPTIONS: readonly SupportedTtsLanguage[] = [
  { code: "en", name: "English", provider: "mistral", aliases: ["english"] },
  { code: "fr", name: "French", provider: "mistral", aliases: ["french"] },
  { code: "es", name: "Spanish", provider: "mistral", aliases: ["spanish"] },
  { code: "pt", name: "Portuguese", provider: "mistral", aliases: ["portuguese"] },
  { code: "it", name: "Italian", provider: "mistral", aliases: ["italian"] },
  { code: "nl", name: "Dutch", provider: "mistral", aliases: ["dutch"] },
  { code: "de", name: "German", provider: "mistral", aliases: ["german"] },
  { code: "hi", name: "Hindi", provider: "mistral", aliases: ["hindi"] },
  { code: "ar", name: "Arabic", provider: "mistral", aliases: ["arabic"] },
  { code: "fa", name: "Persian", provider: "elevenlabs", aliases: ["farsi", "persian"] },
  { code: "zh", name: "Chinese", provider: "cartesia", aliases: ["chinese", "mandarin"] },
  { code: "ja", name: "Japanese", provider: "cartesia", aliases: ["japanese"] },
  { code: "ko", name: "Korean", provider: "cartesia", aliases: ["korean"] },
  { code: "pl", name: "Polish", provider: "cartesia", aliases: ["polish"] },
  { code: "ru", name: "Russian", provider: "cartesia", aliases: ["russian"] },
  { code: "sv", name: "Swedish", provider: "cartesia", aliases: ["swedish"] },
  { code: "tr", name: "Turkish", provider: "cartesia", aliases: ["turkish"] },
  { code: "tl", name: "Tagalog", provider: "cartesia", aliases: ["tagalog", "filipino"] },
  { code: "bg", name: "Bulgarian", provider: "cartesia", aliases: ["bulgarian"] },
  { code: "ro", name: "Romanian", provider: "cartesia", aliases: ["romanian"] },
  { code: "cs", name: "Czech", provider: "cartesia", aliases: ["czech"] },
  { code: "el", name: "Greek", provider: "cartesia", aliases: ["greek"] },
  { code: "fi", name: "Finnish", provider: "cartesia", aliases: ["finnish"] },
  { code: "hr", name: "Croatian", provider: "cartesia", aliases: ["croatian"] },
  { code: "ms", name: "Malay", provider: "cartesia", aliases: ["malay"] },
  { code: "sk", name: "Slovak", provider: "cartesia", aliases: ["slovak"] },
  { code: "da", name: "Danish", provider: "cartesia", aliases: ["danish"] },
  { code: "ta", name: "Tamil", provider: "cartesia", aliases: ["tamil"] },
  { code: "uk", name: "Ukrainian", provider: "cartesia", aliases: ["ukrainian"] },
  { code: "hu", name: "Hungarian", provider: "cartesia", aliases: ["hungarian"] },
  { code: "no", name: "Norwegian", provider: "cartesia", aliases: ["norwegian"] },
  { code: "vi", name: "Vietnamese", provider: "cartesia", aliases: ["vietnamese"] },
  { code: "bn", name: "Bengali", provider: "cartesia", aliases: ["bengali"] },
  { code: "th", name: "Thai", provider: "cartesia", aliases: ["thai"] },
  { code: "he", name: "Hebrew", provider: "cartesia", aliases: ["hebrew"] },
  { code: "ka", name: "Georgian", provider: "cartesia", aliases: ["georgian"] },
  { code: "id", name: "Indonesian", provider: "cartesia", aliases: ["indonesian"] },
  { code: "te", name: "Telugu", provider: "cartesia", aliases: ["telugu"] },
  { code: "gu", name: "Gujarati", provider: "cartesia", aliases: ["gujarati"] },
  { code: "kn", name: "Kannada", provider: "cartesia", aliases: ["kannada"] },
  { code: "ml", name: "Malayalam", provider: "cartesia", aliases: ["malayalam"] },
  { code: "mr", name: "Marathi", provider: "cartesia", aliases: ["marathi"] },
  { code: "pa", name: "Punjabi", provider: "cartesia", aliases: ["punjabi"] },
];

const SUPPORTED_TTS_LANGUAGE_LOOKUP = Object.fromEntries(
  SUPPORTED_TTS_LANGUAGE_OPTIONS.flatMap((language) => [
    [language.code, language] as const,
    [language.name.toLowerCase(), language] as const,
    ...language.aliases.map((alias) => [alias.toLowerCase(), language] as const),
  ]),
) as Record<string, SupportedTtsLanguage>;

export const SUPPORTED_TTS_LANGUAGES: Record<string, string> = Object.fromEntries(
  Object.entries(SUPPORTED_TTS_LANGUAGE_LOOKUP).map(([key, language]) => [
    key,
    language.name,
  ]),
);

export const CANONICAL_TTS_LANGUAGES = SUPPORTED_TTS_LANGUAGE_OPTIONS.map(
  (language) => language.name,
);

export function getSupportedTtsLanguage(targetLanguage: unknown) {
  if (typeof targetLanguage !== "string" || !targetLanguage.trim()) {
    return null;
  }

  return SUPPORTED_TTS_LANGUAGE_LOOKUP[targetLanguage.trim().toLowerCase()] ?? null;
}

export function normalizeTargetLanguage(targetLanguage: unknown) {
  return getSupportedTtsLanguage(targetLanguage)?.name ?? null;
}
