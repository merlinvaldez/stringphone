import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";
import { createOpenAiResponse } from "./openai.js";
import { ENGLISH_UI_STRINGS, UI_STRING_KEYS, type UiStrings } from "./uiStrings.js";

type TranslationLanguagePayload = {
  code: string;
  label: string;
};

export type RunUiTranslationsInput = {
  targetLanguage: unknown;
};

export type RunUiTranslationsResult =
  | {
      ok: true;
      targetLanguage: TranslationLanguagePayload;
      strings: UiStrings;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

const uiTranslationCache = new Map<string, UiStrings>();

function coerceUiStrings(payload: unknown) {
  const strings: Record<keyof UiStrings, string> = { ...ENGLISH_UI_STRINGS };

  if (!payload || typeof payload !== "object") {
    return strings;
  }

  for (const key of UI_STRING_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      strings[key] = value.trim();
    }
  }

  return strings as UiStrings;
}

export async function runUiTranslations(
  input: RunUiTranslationsInput,
): Promise<RunUiTranslationsResult> {
  const targetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (!targetLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "targetLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (targetLanguage.code === "en") {
    return {
      ok: true,
      targetLanguage: {
        code: targetLanguage.code,
        label: targetLanguage.name,
      },
      strings: { ...ENGLISH_UI_STRINGS },
    };
  }

  const cachedStrings = uiTranslationCache.get(targetLanguage.code);
  if (cachedStrings) {
    return {
      ok: true,
      targetLanguage: {
        code: targetLanguage.code,
        label: targetLanguage.name,
      },
      strings: cachedStrings,
    };
  }

  const content = await createOpenAiResponse({
    model: process.env.OPENAI_UI_TRANSLATION_MODEL?.trim() || undefined,
    jsonObject: true,
    instructions:
      "You localize compact mobile UI copy. Translate the JSON values into the requested target language. Keep the same keys. Preserve placeholders exactly, including {language} and {seconds}. Keep strings short, natural, and suitable for buttons, labels, and status messages. Return only a JSON object.",
    input: `Target language: ${targetLanguage.name}\n\nSource JSON:\n${JSON.stringify(
      ENGLISH_UI_STRINGS,
    )}`,
  });

  const translatedStrings = coerceUiStrings(JSON.parse(content));
  uiTranslationCache.set(targetLanguage.code, translatedStrings);

  return {
    ok: true,
    targetLanguage: {
      code: targetLanguage.code,
      label: targetLanguage.name,
    },
    strings: translatedStrings,
  };
}
