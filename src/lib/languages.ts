export type TtsProvider = "mistral" | "cartesia" | "elevenlabs";

export type WritingSystem =
  | "latin"
  | "arabic"
  | "bengali"
  | "cyrillic"
  | "devanagari"
  | "georgian"
  | "greek"
  | "gujarati"
  | "gurmukhi"
  | "han"
  | "hangul"
  | "hebrew"
  | "japanese"
  | "kannada"
  | "malayalam"
  | "tamil"
  | "telugu"
  | "thai";

export type SupportedTtsLanguage = {
  code: string;
  name: string;
  provider: TtsProvider;
  writingSystem: WritingSystem;
  aliases: readonly string[];
};

export const SUPPORTED_TTS_LANGUAGE_OPTIONS: readonly SupportedTtsLanguage[] = [
  {
    code: "en",
    name: "English",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["english"],
  },
  {
    code: "fr",
    name: "French",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["french"],
  },
  {
    code: "es",
    name: "Spanish",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["spanish"],
  },
  {
    code: "pt",
    name: "Portuguese",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["portuguese"],
  },
  {
    code: "it",
    name: "Italian",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["italian"],
  },
  {
    code: "nl",
    name: "Dutch",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["dutch"],
  },
  {
    code: "de",
    name: "German",
    provider: "mistral",
    writingSystem: "latin",
    aliases: ["german"],
  },
  {
    code: "hi",
    name: "Hindi",
    provider: "mistral",
    writingSystem: "devanagari",
    aliases: ["hindi"],
  },
  {
    code: "ar",
    name: "Arabic",
    provider: "mistral",
    writingSystem: "arabic",
    aliases: ["arabic"],
  },
  {
    code: "fa",
    name: "Persian",
    provider: "elevenlabs",
    writingSystem: "arabic",
    aliases: ["farsi", "persian"],
  },
  {
    code: "zh",
    name: "Chinese",
    provider: "cartesia",
    writingSystem: "han",
    aliases: ["chinese", "mandarin"],
  },
  {
    code: "ja",
    name: "Japanese",
    provider: "cartesia",
    writingSystem: "japanese",
    aliases: ["japanese"],
  },
  {
    code: "ko",
    name: "Korean",
    provider: "cartesia",
    writingSystem: "hangul",
    aliases: ["korean"],
  },
  {
    code: "pl",
    name: "Polish",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["polish"],
  },
  {
    code: "ru",
    name: "Russian",
    provider: "cartesia",
    writingSystem: "cyrillic",
    aliases: ["russian"],
  },
  {
    code: "sv",
    name: "Swedish",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["swedish"],
  },
  {
    code: "tr",
    name: "Turkish",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["turkish"],
  },
  {
    code: "tl",
    name: "Tagalog",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["tagalog", "filipino"],
  },
  {
    code: "bg",
    name: "Bulgarian",
    provider: "cartesia",
    writingSystem: "cyrillic",
    aliases: ["bulgarian"],
  },
  {
    code: "ro",
    name: "Romanian",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["romanian"],
  },
  {
    code: "cs",
    name: "Czech",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["czech"],
  },
  {
    code: "el",
    name: "Greek",
    provider: "cartesia",
    writingSystem: "greek",
    aliases: ["greek"],
  },
  {
    code: "fi",
    name: "Finnish",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["finnish"],
  },
  {
    code: "hr",
    name: "Croatian",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["croatian"],
  },
  {
    code: "ms",
    name: "Malay",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["malay"],
  },
  {
    code: "sk",
    name: "Slovak",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["slovak"],
  },
  {
    code: "da",
    name: "Danish",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["danish"],
  },
  {
    code: "ta",
    name: "Tamil",
    provider: "cartesia",
    writingSystem: "tamil",
    aliases: ["tamil"],
  },
  {
    code: "uk",
    name: "Ukrainian",
    provider: "cartesia",
    writingSystem: "cyrillic",
    aliases: ["ukrainian"],
  },
  {
    code: "hu",
    name: "Hungarian",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["hungarian"],
  },
  {
    code: "no",
    name: "Norwegian",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["norwegian"],
  },
  {
    code: "vi",
    name: "Vietnamese",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["vietnamese"],
  },
  {
    code: "bn",
    name: "Bengali",
    provider: "cartesia",
    writingSystem: "bengali",
    aliases: ["bengali"],
  },
  {
    code: "th",
    name: "Thai",
    provider: "cartesia",
    writingSystem: "thai",
    aliases: ["thai"],
  },
  {
    code: "he",
    name: "Hebrew",
    provider: "cartesia",
    writingSystem: "hebrew",
    aliases: ["hebrew"],
  },
  {
    code: "ka",
    name: "Georgian",
    provider: "cartesia",
    writingSystem: "georgian",
    aliases: ["georgian"],
  },
  {
    code: "id",
    name: "Indonesian",
    provider: "cartesia",
    writingSystem: "latin",
    aliases: ["indonesian"],
  },
  {
    code: "te",
    name: "Telugu",
    provider: "cartesia",
    writingSystem: "telugu",
    aliases: ["telugu"],
  },
  {
    code: "gu",
    name: "Gujarati",
    provider: "cartesia",
    writingSystem: "gujarati",
    aliases: ["gujarati"],
  },
  {
    code: "kn",
    name: "Kannada",
    provider: "cartesia",
    writingSystem: "kannada",
    aliases: ["kannada"],
  },
  {
    code: "ml",
    name: "Malayalam",
    provider: "cartesia",
    writingSystem: "malayalam",
    aliases: ["malayalam"],
  },
  {
    code: "mr",
    name: "Marathi",
    provider: "cartesia",
    writingSystem: "devanagari",
    aliases: ["marathi"],
  },
  {
    code: "pa",
    name: "Punjabi",
    provider: "cartesia",
    writingSystem: "gurmukhi",
    aliases: ["punjabi"],
  },
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

const WRITING_SYSTEM_LABELS: Record<WritingSystem, string> = {
  latin: "Latin alphabet",
  arabic: "Arabic script",
  bengali: "Bengali script",
  cyrillic: "Cyrillic script",
  devanagari: "Devanagari script",
  georgian: "Georgian script",
  greek: "Greek script",
  gujarati: "Gujarati script",
  gurmukhi: "Gurmukhi script",
  han: "Chinese characters",
  hangul: "Hangul",
  hebrew: "Hebrew script",
  japanese: "Japanese writing",
  kannada: "Kannada script",
  malayalam: "Malayalam script",
  tamil: "Tamil script",
  telugu: "Telugu script",
  thai: "Thai script",
};

export function getSupportedTtsLanguage(targetLanguage: unknown) {
  if (typeof targetLanguage !== "string" || !targetLanguage.trim()) {
    return null;
  }

  return SUPPORTED_TTS_LANGUAGE_LOOKUP[targetLanguage.trim().toLowerCase()] ?? null;
}

export function normalizeTargetLanguage(targetLanguage: unknown) {
  return getSupportedTtsLanguage(targetLanguage)?.name ?? null;
}

export function getWritingSystemLabel(languageCode: unknown) {
  const language = getSupportedTtsLanguage(languageCode);

  if (!language) {
    return null;
  }

  return WRITING_SYSTEM_LABELS[language.writingSystem];
}

export function requiresPhoneticGuide(
  textLanguageCode: unknown,
  readerLanguageCode: unknown,
) {
  const textLanguage = getSupportedTtsLanguage(textLanguageCode);
  const readerLanguage = getSupportedTtsLanguage(readerLanguageCode);

  if (!textLanguage || !readerLanguage) {
    return false;
  }

  return textLanguage.writingSystem !== readerLanguage.writingSystem;
}
