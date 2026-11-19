import { CANONICAL_TTS_LANGUAGES, getSupportedTtsLanguage } from "./languages";
import type { ProcessingFailure, TextChatMessageInput } from "./messages";

// Same normalization/error precedence as the existing server text handler.
// Text-chat limits are a separate endpoint policy; the speech limit is not applied here.
export function validateTextChatMessage(input: TextChatMessageInput) {
  const originalText = typeof input.text === "string" ? input.text.trim() : "";
  const sourceLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const targetLanguage = getSupportedTtsLanguage(input.targetLanguage);
  if (!originalText) {
    return { ok: false, status: 400, body: { error: "text is required" } } as ProcessingFailure;
  }
  if (!sourceLanguage || !targetLanguage) {
    return {
      ok: false, status: 400,
      body: {
        error: `${!sourceLanguage ? "sourceLanguage" : "targetLanguage"} is not supported`,
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    } as ProcessingFailure;
  }
  return { ok: true as const, originalText, sourceLanguage, targetLanguage };
}
