import {
  buildAiPartnerSessionSnapshot,
  getAiPartnerSession,
  upsertAiPartnerSession,
} from "../db/queries/aiPartnerSessions.js";
import {
  createMessage,
  getConversation,
  getMessages,
} from "../db/queries/conversations.js";
import {
  getSupportedTtsLanguage,
  requiresPhoneticGuide,
} from "./languages.js";
import { generateSpeech } from "../services/generateSpeech.js";
import {
  AiPartnerGenerationError,
  generateAiPartnerReply,
  type AiPartnerContextMessage,
} from "../services/generateAiPartnerReply.js";
import { generatePronunciationGuidance } from "../services/generatePronunciationGuidance.js";
import { refreshConversationTitle } from "../services/refreshConversationTitle.js";
import { resolveAiPartnerVoiceId } from "../services/resolveAiPartnerVoiceId.js";
import { translateText } from "../services/translateText.js";

type PersistedContextMessage = AiPartnerContextMessage & {
  id?: string;
};

function coerceContextMessages(
  value: unknown,
): PersistedContextMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const sender =
        candidate.sender === "partner" ? "partner" : candidate.sender === "self" ? "self" : null;
      const originalText =
        typeof candidate.originalText === "string"
          ? candidate.originalText.replace(/\s+/g, " ").trim().slice(0, 400)
          : "";
      const translatedText =
        typeof candidate.translatedText === "string"
          ? candidate.translatedText.replace(/\s+/g, " ").trim().slice(0, 400)
          : "";

      if (!sender || (!originalText && !translatedText)) {
        return null;
      }

      return {
        id: typeof candidate.id === "string" ? candidate.id : undefined,
        sender,
        messageOrigin:
          candidate.messageOrigin === "ai_partner" ? "ai_partner" : "human",
        originalText,
        translatedText,
      } satisfies PersistedContextMessage;
    })
    .filter((message): message is PersistedContextMessage => message !== null);
}

function mapSavedConversationMessages(
  messages: Array<Record<string, unknown>>,
): PersistedContextMessage[] {
  return messages
    .map((message) => ({
      id: typeof message.id === "string" ? message.id : undefined,
      sender: message.sender === "partner" ? "partner" : "self",
      messageOrigin:
        message.message_origin === "ai_partner" ? "ai_partner" : "human",
      originalText:
        typeof message.original_text === "string" ? message.original_text : "",
      translatedText:
        typeof message.translated_text === "string"
          ? message.translated_text
          : "",
    }))
    .filter((message) => message.originalText || message.translatedText);
}

function coerceDraftProfile(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const voiceValue =
    candidate.voice && typeof candidate.voice === "object"
      ? (candidate.voice as Record<string, unknown>)
      : null;

  return {
    enabled: candidate.enabled !== false,
    displayName:
      typeof candidate.displayName === "string" ? candidate.displayName : "",
    personaSummary:
      typeof candidate.personaSummary === "string"
        ? candidate.personaSummary
        : "",
    scenarioSummary:
      typeof candidate.scenarioSummary === "string"
        ? candidate.scenarioSummary
        : "",
    styleSummary:
      typeof candidate.styleSummary === "string" ? candidate.styleSummary : "",
    voiceProvider:
      typeof voiceValue?.provider === "string" ? voiceValue.provider : "",
    voiceId: typeof voiceValue?.voiceId === "string" ? voiceValue.voiceId : "",
    voiceLabel: typeof voiceValue?.label === "string" ? voiceValue.label : "",
    metadata:
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {},
  };
}

function buildGeneratedSessionSnapshot(input: {
  partnerLanguageCode: string;
  generatedReply: {
    displayName: string;
    personaSummary: string;
    scenarioSummary: string;
    styleSummary: string;
  };
  resolvedVoice: {
    provider: string;
    voiceId: string;
    voiceLabel: string;
  };
  metadata: Record<string, unknown>;
}) {
  return {
    enabled: true,
    seeded: true,
    partnerLanguage: input.partnerLanguageCode,
    displayName: input.generatedReply.displayName,
    personaSummary: input.generatedReply.personaSummary,
    scenarioSummary: input.generatedReply.scenarioSummary,
    styleSummary: input.generatedReply.styleSummary,
    voice: {
      provider: input.resolvedVoice.provider,
      voiceId: input.resolvedVoice.voiceId,
      label: input.resolvedVoice.voiceLabel,
    },
    metadata: input.metadata,
  };
}

export type RunAiPartnerReplyResult =
  | {
      ok: true;
      session: ReturnType<typeof buildAiPartnerSessionSnapshot>;
      message: {
        id: string | null;
        sender: "partner";
        messageOrigin: "ai_partner";
        kind: "text" | "voice";
        originalText: string;
        originalPronunciation: string;
        translatedText: string;
        translatedPronunciation: string;
        transcript: string;
        audio:
          | {
              mimeType: "audio/mpeg";
              base64: string;
            }
          | null;
      };
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

export async function runAiPartnerReply(input: {
  conversationId?: unknown;
  userId?: number | null;
  userLanguage?: unknown;
  partnerLanguage?: unknown;
  recentMessages?: unknown;
  sessionDraft?: unknown;
}): Promise<RunAiPartnerReplyResult> {
  const conversationId =
    typeof input.conversationId === "string" && input.conversationId.trim()
      ? input.conversationId.trim()
      : "";
  let userLanguageCode =
    typeof input.userLanguage === "string" ? input.userLanguage.trim() : "";
  let partnerLanguageCode =
    typeof input.partnerLanguage === "string" ? input.partnerLanguage.trim() : "";
  let contextMessages: PersistedContextMessage[] = [];
  const requestedContextMessages = coerceContextMessages(input.recentMessages);
  let persistedSession =
    null as Awaited<ReturnType<typeof getAiPartnerSession>> | null;
  let seedMessageId: string | null = null;

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

    userLanguageCode = conversation.source_language;
    partnerLanguageCode = conversation.target_language;
    persistedSession = await getAiPartnerSession({
      conversationId,
      userId: input.userId,
    });

    const savedMessages = await getMessages(conversationId);
    const savedContextMessages = mapSavedConversationMessages(savedMessages);
    contextMessages =
      requestedContextMessages.length > 0
        ? requestedContextMessages
        : savedContextMessages;
    const latestUserMessage =
      [...contextMessages]
        .reverse()
        .find(
          (message) =>
            message.sender === "self" && message.messageOrigin === "human",
        ) ?? null;

    seedMessageId =
      typeof latestUserMessage?.id === "string" ? latestUserMessage.id : null;
  } else {
    contextMessages = requestedContextMessages;
  }

  const userLanguage = getSupportedTtsLanguage(userLanguageCode);
  const partnerLanguage = getSupportedTtsLanguage(partnerLanguageCode);

  if (!userLanguage) {
    return {
      ok: false,
      status: 400,
      body: { error: "userLanguage is not supported" },
    };
  }

  if (!partnerLanguage) {
    return {
      ok: false,
      status: 400,
      body: { error: "partnerLanguage is not supported" },
    };
  }

  if (contextMessages.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "At least one recent message is required" },
    };
  }

  if (contextMessages[contextMessages.length - 1]?.sender !== "self") {
    return {
      ok: false,
      status: 409,
      body: { error: "The latest message must come from the user" },
    };
  }

  const draftProfile = coerceDraftProfile(input.sessionDraft);
  const existingProfile = {
    displayName:
      persistedSession?.display_name ?? draftProfile?.displayName ?? "",
    personaSummary:
      persistedSession?.persona_summary ?? draftProfile?.personaSummary ?? "",
    scenarioSummary:
      persistedSession?.scenario_summary ?? draftProfile?.scenarioSummary ?? "",
    styleSummary:
      persistedSession?.style_summary ?? draftProfile?.styleSummary ?? "",
  };

  let generatedReply;

  try {
    generatedReply = await generateAiPartnerReply({
      userLanguageCode: userLanguage.code,
      partnerLanguageCode: partnerLanguage.code,
      recentMessages: contextMessages,
      existingProfile,
    });
  } catch (error) {
    if (error instanceof AiPartnerGenerationError) {
      return {
        ok: false,
        status: error.status,
        body: { error: error.message },
      };
    }

    console.error("AI partner generation crashed", error);
    return {
      ok: false,
      status: 502,
      body: { error: "AI partner is temporarily unavailable. Please try again." },
    };
  }

  let translatedText = "";

  try {
    translatedText = await translateText({
      text: generatedReply.replyText,
      sourceLanguage: partnerLanguage.name,
      targetLanguage: userLanguage.name,
    });
  } catch (error) {
    console.error("AI partner translation failed", error);
  }

  let originalPronunciation = "";
  let translatedPronunciation = "";

  if (
    translatedText &&
    (
      requiresPhoneticGuide(partnerLanguage.code, userLanguage.code) ||
      requiresPhoneticGuide(userLanguage.code, partnerLanguage.code)
    )
  ) {
    try {
      const guidance = await generatePronunciationGuidance({
        originalText: generatedReply.replyText,
        translatedText,
        sourceLanguageCode: partnerLanguage.code,
        sourceLanguage: partnerLanguage.name,
        targetLanguageCode: userLanguage.code,
        targetLanguage: userLanguage.name,
      });

      originalPronunciation = guidance.originalPronunciation;
      translatedPronunciation = guidance.translatedPronunciation;
    } catch (error) {
      console.error("AI partner pronunciation guidance failed", error);
    }
  }

  const shouldReuseVoice =
    persistedSession?.voice_provider === partnerLanguage.provider;
  let resolvedVoice = {
    language: partnerLanguage,
    provider: partnerLanguage.provider,
    voiceId: "",
    voiceLabel: `${partnerLanguage.name} AI partner voice`,
  };

  try {
    resolvedVoice = await resolveAiPartnerVoiceId({
      languageCode: partnerLanguage.code,
      existingVoiceId: shouldReuseVoice ? persistedSession?.voice_id : null,
      existingVoiceLabel: shouldReuseVoice ? persistedSession?.voice_label : null,
    });
  } catch (error) {
    console.error("AI partner voice resolution failed", error);
  }

  let audioBuffer: Buffer | null = null;

  try {
    audioBuffer = await generateSpeech({
      text: generatedReply.replyText,
      targetLanguage: partnerLanguage,
      voiceIdOverride: resolvedVoice.voiceId,
    });
  } catch (error) {
    console.error("AI partner speech generation failed", error);
  }

  const sessionMetadata = persistedSession?.metadata ?? draftProfile?.metadata ?? {};
  let nextSessionSnapshot = buildGeneratedSessionSnapshot({
    partnerLanguageCode: partnerLanguage.code,
    generatedReply,
    resolvedVoice,
    metadata: sessionMetadata,
  });
  let persistedMessageId: string | null = null;

  if (conversationId && Number.isInteger(input.userId) && input.userId) {
    try {
      const savedSession = await upsertAiPartnerSession({
        conversationId,
        userId: input.userId,
        partnerLanguage: partnerLanguage.code,
        enabled: true,
        seededAt: persistedSession?.seeded_at ? undefined : new Date().toISOString(),
        disabledAt: null,
        seedMessageId:
          persistedSession?.seed_message_id || seedMessageId
            ? persistedSession?.seed_message_id ?? seedMessageId
            : null,
        displayName: generatedReply.displayName,
        personaSummary: generatedReply.personaSummary,
        scenarioSummary: generatedReply.scenarioSummary,
        styleSummary: generatedReply.styleSummary,
        voiceProvider: resolvedVoice.provider,
        voiceId: resolvedVoice.voiceId,
        voiceLabel: resolvedVoice.voiceLabel,
        metadata: sessionMetadata,
      });

      nextSessionSnapshot = buildAiPartnerSessionSnapshot(
        savedSession,
        partnerLanguage.code,
      );

      const savedMessage = await createMessage({
        conversationId,
        sender: "partner",
        messageOrigin: "ai_partner",
        originalText: generatedReply.replyText,
        originalPronunciation,
        translatedText,
        translatedPronunciation,
        transcript: generatedReply.replyText,
        audioUrl: audioBuffer ? audioBuffer.toString("base64") : null,
      });

      persistedMessageId =
        typeof savedMessage?.id === "string" ? savedMessage.id : null;

      try {
        await refreshConversationTitle({
          conversationId,
          userId: input.userId,
          sourceLanguageCode: userLanguage.code,
          targetLanguageCode: partnerLanguage.code,
        });
      } catch (error) {
        console.error("Failed to refresh conversation title after AI reply", error);
      }
    } catch (error) {
      console.error("Failed to persist AI partner reply", error);
    }
  }

  return {
    ok: true,
    session: nextSessionSnapshot,
    message: {
      id: persistedMessageId,
      sender: "partner",
      messageOrigin: "ai_partner",
      kind: audioBuffer ? "voice" : "text",
      originalText: generatedReply.replyText,
      originalPronunciation,
      translatedText,
      translatedPronunciation,
      transcript: generatedReply.replyText,
      audio: audioBuffer
        ? {
            mimeType: "audio/mpeg",
            base64: audioBuffer.toString("base64"),
          }
        : null,
    },
  };
}
