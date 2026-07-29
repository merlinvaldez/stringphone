import { randomUUID } from "crypto";
import { getConversation } from "../db/queries/conversations.js";
import { createLesson } from "../db/queries/lessons.js";
import {
  generateLanguageLesson,
  type GeneratedLesson,
  type LessonSourceMessage,
} from "./generateLanguageLesson.js";

export class LessonRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LessonRequestError";
    this.status = status;
  }
}

export type ParsedLessonRequest = {
  source: "chat" | "topic";
  topic: string;
  sourceLanguage: string;
  targetLanguage: string;
  messages: LessonSourceMessage[];
  conversationId: string | null;
};

export type GeneratedLessonRecord = {
  id: string;
  source: "chat" | "topic";
  source_conversation_id: string | null;
  topic: string;
  source_language: string;
  target_language: string;
  content: GeneratedLesson;
  created_at: string;
};

function isLanguageCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z]{2,3}$/i.test(value.trim());
}

function coerceMessages(value: unknown): LessonSourceMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const candidate = entry as Record<string, unknown>;
      const originalText =
        typeof candidate.originalText === "string"
          ? candidate.originalText.trim().slice(0, 500)
          : "";
      const translatedText =
        typeof candidate.translatedText === "string"
          ? candidate.translatedText.trim().slice(0, 500)
          : "";

      if (!originalText && !translatedText) {
        return null;
      }

      return { originalText, translatedText };
    })
    .filter((entry): entry is LessonSourceMessage => entry !== null)
    .slice(-12);
}

export function parseLessonRequestBody(body: unknown): ParsedLessonRequest {
  const candidate =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const source =
    candidate.source === "chat" || candidate.source === "topic"
      ? candidate.source
      : null;
  const topic =
    typeof candidate.topic === "string"
      ? candidate.topic.trim().slice(0, 160)
      : "";
  const messages = coerceMessages(candidate.messages);
  const conversationId =
    typeof candidate.conversationId === "string" && candidate.conversationId.trim()
      ? candidate.conversationId.trim()
      : null;

  if (
    !source ||
    !isLanguageCode(candidate.sourceLanguage) ||
    !isLanguageCode(candidate.targetLanguage)
  ) {
    throw new LessonRequestError(
      "A lesson source and two valid languages are required",
      400,
    );
  }

  if (source === "topic" && topic.length < 2) {
    throw new LessonRequestError(
      "Enter a topic or situation for the lesson",
      400,
    );
  }

  if (source === "chat" && messages.length === 0) {
    throw new LessonRequestError(
      "Send a chat message before creating a chat lesson",
      400,
    );
  }

  return {
    source,
    topic,
    sourceLanguage: candidate.sourceLanguage.trim().toLowerCase(),
    targetLanguage: candidate.targetLanguage.trim().toLowerCase(),
    messages,
    conversationId,
  };
}

async function buildGeneratedLessonRecord(params: {
  body: unknown;
  userId: number | null;
}): Promise<GeneratedLessonRecord> {
  const parsedBody = parseLessonRequestBody(params.body);

  if (!params.userId && parsedBody.source !== "topic") {
    throw new LessonRequestError(
      "Sign in to create a lesson from this chat",
      401,
    );
  }

  if (parsedBody.conversationId) {
    if (!params.userId) {
      throw new LessonRequestError(
        "Sign in to create a lesson from this chat",
        401,
      );
    }

    const conversation = await getConversation(
      parsedBody.conversationId,
      params.userId,
    );

    if (!conversation) {
      throw new LessonRequestError(
        "Conversation not found or unauthorized",
        404,
      );
    }
  }

  const content = await generateLanguageLesson({
    source: parsedBody.source,
    topic: parsedBody.topic,
    sourceLanguageCode: parsedBody.sourceLanguage,
    targetLanguageCode: parsedBody.targetLanguage,
    messages: parsedBody.messages,
  });

  return {
    id: randomUUID(),
    source: parsedBody.source,
    source_conversation_id: parsedBody.conversationId,
    topic: content.topic,
    source_language: parsedBody.sourceLanguage,
    target_language: parsedBody.targetLanguage,
    content,
    created_at: new Date().toISOString(),
  };
}

export async function createLanguageLessonForUser(params: {
  userId: number;
  body: unknown;
}) {
  const generatedLesson = await buildGeneratedLessonRecord({
    body: params.body,
    userId: params.userId,
  });

  return createLesson({
    userId: params.userId,
    source: generatedLesson.source,
    sourceConversationId: generatedLesson.source_conversation_id,
    topic: generatedLesson.topic,
    sourceLanguage: generatedLesson.source_language,
    targetLanguage: generatedLesson.target_language,
    content: generatedLesson.content,
  });
}

export async function createGuestLanguageLesson(params: {
  body: unknown;
}) {
  return buildGeneratedLessonRecord({
    body: params.body,
    userId: null,
  });
}
