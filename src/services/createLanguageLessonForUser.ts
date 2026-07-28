import { getConversation } from "../db/queries/conversations.js";
import { createLesson } from "../db/queries/lessons.js";
import {
  generateLanguageLesson,
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

export async function createLanguageLessonForUser(params: {
  userId: number;
  body: unknown;
}) {
  const parsedBody = parseLessonRequestBody(params.body);

  if (parsedBody.conversationId) {
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

  return createLesson({
    userId: params.userId,
    source: parsedBody.source,
    sourceConversationId: parsedBody.conversationId,
    topic: content.topic,
    sourceLanguage: parsedBody.sourceLanguage,
    targetLanguage: parsedBody.targetLanguage,
    content,
  });
}
