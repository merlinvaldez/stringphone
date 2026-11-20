import { getSupportedTtsLanguage } from "./languages";

export const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  nl: "Nederlands",
  hi: "हिन्दी",
  ar: "العربية",
  fa: "فارسی",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  pl: "Polski",
  ru: "Русский",
  sv: "Svenska",
  tr: "Türkçe",
  tl: "Tagalog",
  bg: "Български",
  ro: "Română",
  cs: "Čeština",
  el: "Ελληνικά",
  fi: "Suomi",
  hr: "Hrvatski",
  ms: "Bahasa Melayu",
  sk: "Slovenčina",
  da: "Dansk",
  ta: "தமிழ்",
  uk: "Українська",
  hu: "Magyar",
  no: "Norsk",
  vi: "Tiếng Việt",
  bn: "বাংলা",
  th: "ไทย",
  he: "עברית",
  ka: "ქართული",
  id: "Bahasa Indonesia",
  te: "తెలుగు",
  gu: "ગુજરાતી",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  mr: "मराठी",
  pa: "ਪੰਜਾਬੀ",
};

export function getNativeLanguageName(code: string, fallbackName?: string): string {
  const normalized = (code || "").trim().toLowerCase();
  if (normalized && Object.prototype.hasOwnProperty.call(NATIVE_LANGUAGE_NAMES, normalized)) {
    return NATIVE_LANGUAGE_NAMES[normalized];
  }

  const english = fallbackName ?? getSupportedTtsLanguage(code)?.name ?? code;
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      const displayName = new Intl.DisplayNames([code], { type: "language" }).of(code);
      if (displayName && displayName.trim()) {
        return displayName;
      }
    }
  } catch {
    // Fallback to English name when runtime Intl lacks DisplayNames locale data
  }

  return english;
}

// Preserve web picker order and flag fallbacks; names come from the canonical catalog.
const PICKER_FLAGS = [
  { code: "en", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
  { code: "es", flag: "\uD83C\uDDEA\uD83C\uDDF8" },
  { code: "fr", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
  { code: "de", flag: "\uD83C\uDDE9\uD83C\uDDEA" },
  { code: "pt", flag: "\uD83C\uDDF5\uD83C\uDDF9" },
  { code: "it", flag: "\uD83C\uDDEE\uD83C\uDDF9" },
  { code: "nl", flag: "\uD83C\uDDF3\uD83C\uDDF1" },
  { code: "hi", flag: "\uD83C\uDDEE\uD83C\uDDF3" },
  { code: "ar", flag: "\uD83C\uDDF8\uD83C\uDDE6" },
  { code: "fa", flag: "\uD83C\uDDEE\uD83C\uDDF7" },
  { code: "zh", flag: "CN" },
  { code: "ja", flag: "JP" },
  { code: "ko", flag: "KR" },
  { code: "pl", flag: "PL" },
  { code: "ru", flag: "RU" },
  { code: "sv", flag: "SE" },
  { code: "tr", flag: "TR" },
  { code: "tl", flag: "PH" },
  { code: "bg", flag: "BG" },
  { code: "ro", flag: "RO" },
  { code: "cs", flag: "CZ" },
  { code: "el", flag: "GR" },
  { code: "fi", flag: "FI" },
  { code: "hr", flag: "HR" },
  { code: "ms", flag: "MY" },
  { code: "sk", flag: "SK" },
  { code: "da", flag: "DK" },
  { code: "ta", flag: "IN" },
  { code: "uk", flag: "UA" },
  { code: "hu", flag: "HU" },
  { code: "no", flag: "NO" },
  { code: "vi", flag: "VN" },
  { code: "bn", flag: "BD" },
  { code: "th", flag: "TH" },
  { code: "he", flag: "IL" },
  { code: "ka", flag: "GE" },
  { code: "id", flag: "ID" },
  { code: "te", flag: "IN" },
  { code: "gu", flag: "IN" },
  { code: "kn", flag: "IN" },
  { code: "ml", flag: "IN" },
  { code: "mr", flag: "IN" },
  { code: "pa", flag: "IN" },
] as const;

export const LANGUAGE_OPTIONS = PICKER_FLAGS.map(({ code, flag }) => {
  const englishName = getSupportedTtsLanguage(code)!.name;
  return {
    code,
    englishName,
    nativeName: getNativeLanguageName(code, englishName),
    flag,
  };
});
