import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages.js";
import { translateText } from "../services/translateText.js";

type ChatLanguagePayload = {
  code: string;
  label: string;
};

export type RunTextChatMessageInput = {
  text: unknown;
  sourceLanguage: unknown;
  targetLanguage: unknown;
};

export type RunTextChatMessageResult =
  | {
      ok: true;
      originalText: string;
      translatedText: string;
      sourceLanguage: ChatLanguagePayload;
      targetLanguage: ChatLanguagePayload;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runTextChatMessage(
  input: RunTextChatMessageInput,
): Promise<RunTextChatMessageResult> {
  const originalText =
    typeof input.text === "string" ? input.text.trim() : "";
  const sourceLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const targetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (!originalText) {
    return {
      ok: false,
      status: 400,
      body: { error: "text is required" },
    };
  }

  if (!sourceLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "sourceLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

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

  const translatedText = await translateText({
    text: originalText,
    targetLanguage: targetLanguage.name,
  });

  return {
    ok: true,
    originalText,
    translatedText,
    sourceLanguage: {
      code: sourceLanguage.code,
      label: sourceLanguage.name,
    },
    targetLanguage: {
      code: targetLanguage.code,
      label: targetLanguage.name,
    },
  };
}
