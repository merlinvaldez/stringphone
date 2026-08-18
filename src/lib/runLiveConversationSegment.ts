import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { createMessage, getConversation } from "../db/queries/conversations.js";
import { classifyLiveSegmentLanguage } from "../services/classifyLiveSegmentLanguage.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import { refreshConversationTitle } from "../services/refreshConversationTitle.js";
import { transcribeAudio } from "../services/transcribeAudio.js";
import { translateText } from "../services/translateText.js";

type UploadedAudioFile = {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
};

type ChatLanguagePayload = {
  code: string;
  label: string;
};

export type RunLiveConversationSegmentResult =
  | {
      ok: true;
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
      savedMessage: {
        id: string;
      } | null;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function runLiveConversationSegment(input: {
  sourceLanguage: unknown;
  targetLanguage: unknown;
  conversationId?: unknown;
  userId?: number | null;
  sourceAudioFile?: UploadedAudioFile;
}): Promise<RunLiveConversationSegmentResult> {
  let myLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  let theirLanguage = getSupportedTtsLanguage(input.targetLanguage);
  const conversationId = normalizeOptionalText(input.conversationId);

  if (conversationId) {
    if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
      return {
        ok: false,
        status: 401,
        body: { error: "Unauthorized" },
      };
    }

    const conversation = await getConversation(conversationId, input.userId);

    if (!conversation) {
      return {
        ok: false,
        status: 404,
        body: { error: "Conversation not found or unauthorized" },
      };
    }

    myLanguage = getSupportedTtsLanguage(conversation.source_language);
    theirLanguage = getSupportedTtsLanguage(conversation.target_language);
  }

  if (!myLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "sourceLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!theirLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "targetLanguage is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  if (!input.sourceAudioFile) {
    return {
      ok: false,
      status: 400,
      body: { error: "sourceAudio file is required" },
    };
  }

  let transcript = "";

  try {
    transcript = (
      await transcribeAudio({
        audioBuffer: input.sourceAudioFile.buffer,
        filename: input.sourceAudioFile.filename,
        mimeType: input.sourceAudioFile.mimeType,
      })
    ).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (/no speech|empty|did not contain text/i.test(message)) {
      return {
        ok: false,
        status: 422,
        body: { error: "No speech was detected" },
      };
    }

    throw error;
  }

  if (!transcript) {
    return {
      ok: false,
      status: 422,
      body: { error: "No speech was detected" },
    };
  }

  const classification = await classifyLiveSegmentLanguage({
    transcript,
    myLanguageCode: myLanguage.code,
    myLanguage: myLanguage.name,
    theirLanguageCode: theirLanguage.code,
    theirLanguage: theirLanguage.name,
  });
  const detectedIsTheirLanguage =
    classification.languageCode === theirLanguage.code;
  const spokenLanguage = detectedIsTheirLanguage ? theirLanguage : myLanguage;
  const translationLanguage = detectedIsTheirLanguage ? myLanguage : theirLanguage;
  const sender = detectedIsTheirLanguage ? "partner" : "self";
  const translatedText = await translateText({
    text: transcript,
    sourceLanguage: spokenLanguage.name,
    targetLanguage: translationLanguage.name,
  });
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
      console.error("Live segment pronunciation guidance failed", error);
    }
  }

  let savedMessageId = "";

  if (conversationId && Number.isInteger(input.userId) && input.userId) {
    try {
      const message = await createMessage({
        conversationId,
        sender,
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
      console.error("Failed to persist live conversation segment", error);
    }
  }

  return {
    ok: true,
    detectedSourceLanguage: {
      code: spokenLanguage.code,
      label: spokenLanguage.name,
      confidence: classification.confidence,
      ambiguous:
        classification.confidence > 0 && classification.confidence < 0.55,
    },
    sourceLanguage: {
      code: spokenLanguage.code,
      label: spokenLanguage.name,
    },
    targetLanguage: {
      code: translationLanguage.code,
      label: translationLanguage.name,
    },
    sender,
    transcript,
    translatedText,
    originalPronunciation,
    translatedPronunciation,
    savedMessage: savedMessageId ? { id: savedMessageId } : null,
  };
}
