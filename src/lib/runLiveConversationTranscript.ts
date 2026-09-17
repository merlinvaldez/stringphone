import {
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { createMessage, getConversation } from "../db/queries/conversations.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import { refreshConversationTitle } from "../services/refreshConversationTitle.js";
import { runLiveConversationTranslation } from "./runLiveConversationTranslation.js";

type ChatLanguagePayload = {
  code: string;
  label: string;
};

export type RunLiveConversationTranscriptResult =
  | {
      ok: true;
      utteranceId: string;
      revision: number;
      detectedSourceLanguage: ChatLanguagePayload & {
        confidence: number;
        ambiguous: boolean;
      };
      sourceLanguage: ChatLanguagePayload;
      targetLanguage: ChatLanguagePayload;
      sender: "self" | "partner";
      transcript: string;
      translatedText: string;
      originalPronunciation: string;
      translatedPronunciation: string;
      savedMessage: { id: string } | null;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * Converts a completed GPT Live transcript into the existing StringPhone
 * bilingual message shape. Audio stays in the realtime session; this helper
 * owns only selected-language classification, translation, and persistence.
 */
export async function runLiveConversationTranscript(input: {
  utteranceId: unknown;
  revision: unknown;
  sourceLanguage: unknown;
  targetLanguage: unknown;
  transcript: unknown;
  translatedText?: unknown;
  liveMode?: unknown;
  conversationId?: unknown;
  userId?: number | null;
}): Promise<RunLiveConversationTranscriptResult> {
  const myLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const theirLanguage = getSupportedTtsLanguage(input.targetLanguage);
  const conversationId = normalizeOptionalText(input.conversationId);

  if (conversationId) {
    if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
      return { ok: false, status: 401, body: { error: "Unauthorized" } };
    }

    const conversation = await getConversation(conversationId, input.userId);

    if (!conversation) {
      return {
        ok: false,
        status: 404,
        body: { error: "Conversation not found or unauthorized" },
      };
    }
  }

  const translation = await runLiveConversationTranslation({
    utteranceId: input.utteranceId,
    revision: input.revision,
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    transcript: input.transcript,
    translatedText: input.translatedText,
    liveMode: input.liveMode,
  });

  if (!translation.ok) {
    return translation;
  }

  const transcript = translation.transcript;
  const spokenLanguage = getSupportedTtsLanguage(
    translation.sourceLanguage.code,
  );
  const translationLanguage = getSupportedTtsLanguage(
    translation.targetLanguage.code,
  );

  if (!myLanguage || !theirLanguage || !spokenLanguage || !translationLanguage) {
    return {
      ok: false,
      status: 400,
      body: { error: "Selected live languages are not supported" },
    };
  }

  const { translatedText } = translation;
  let originalPronunciation = "";
  let translatedPronunciation = "";

  if (
    requiresPhoneticGuide(spokenLanguage.code, translationLanguage.code) ||
    requiresPhoneticGuide(translationLanguage.code, spokenLanguage.code)
  ) {
    try {
      const guidance = await generatePronunciationGuidance({
        originalText: transcript,
        translatedText,
        sourceLanguageCode: spokenLanguage.code,
        sourceLanguage: spokenLanguage.name,
        targetLanguageCode: translationLanguage.code,
        targetLanguage: translationLanguage.name,
      });

      originalPronunciation = guidance.originalPronunciation;
      translatedPronunciation = guidance.translatedPronunciation;
    } catch (error) {
      console.error("Live transcript pronunciation guidance failed", error);
    }
  }

  let savedMessageId = "";

  if (conversationId && Number.isInteger(input.userId) && input.userId) {
    try {
      const message = await createMessage({
        conversationId,
        sender: translation.sender,
        messageOrigin: "human",
        originalText: transcript,
        originalPronunciation,
        translatedText,
        translatedPronunciation,
        transcript,
        audioUrl: null,
      });

      savedMessageId = typeof message?.id === "string" ? message.id : "";

      await refreshConversationTitle({
        conversationId,
        userId: input.userId,
        sourceLanguageCode: myLanguage.code,
        targetLanguageCode: theirLanguage.code,
      });
    } catch (error) {
      console.error("Failed to persist live conversation transcript", error);
    }
  }

  return {
    ok: true,
    utteranceId: translation.utteranceId,
    revision: translation.revision,
    detectedSourceLanguage: translation.detectedSourceLanguage,
    sourceLanguage: translation.sourceLanguage,
    targetLanguage: translation.targetLanguage,
    sender: translation.sender,
    transcript,
    translatedText,
    originalPronunciation,
    translatedPronunciation,
    savedMessage: savedMessageId ? { id: savedMessageId } : null,
  };
}
