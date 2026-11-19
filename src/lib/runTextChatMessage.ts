import { requiresPhoneticGuide } from "./languages.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import { translateText } from "../services/translateText.js";

import { validateTextChatMessage } from "../../shared/validation.js";
import type { TextChatMessageInput, TextChatMessageResult } from "../../shared/messages.js";

export type RunTextChatMessageInput = TextChatMessageInput;
export type RunTextChatMessageResult = TextChatMessageResult;

export async function runTextChatMessage(
  input: RunTextChatMessageInput,
): Promise<RunTextChatMessageResult> {
  const validated = validateTextChatMessage(input);
  if (validated.ok === false) return validated;
  const { originalText, sourceLanguage, targetLanguage } = validated;

  const translatedText = await translateText({
    text: originalText,
    sourceLanguage: sourceLanguage.name,
    targetLanguage: targetLanguage.name,
  });
  let originalPronunciation = "";
  let translatedPronunciation = "";

  if (
    requiresPhoneticGuide(sourceLanguage.code, targetLanguage.code) ||
    requiresPhoneticGuide(targetLanguage.code, sourceLanguage.code)
  ) {
    try {
      const guidance = await generatePronunciationGuidance({
        originalText,
        translatedText,
        sourceLanguageCode: sourceLanguage.code,
        sourceLanguage: sourceLanguage.name,
        targetLanguageCode: targetLanguage.code,
        targetLanguage: targetLanguage.name,
      });

      originalPronunciation = guidance.originalPronunciation;
      translatedPronunciation = guidance.translatedPronunciation;
    } catch (error) {
      console.error("Pronunciation guidance failed");
    }
  }

  return {
    ok: true,
    originalText,
    translatedText,
    originalPronunciation,
    translatedPronunciation,
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
