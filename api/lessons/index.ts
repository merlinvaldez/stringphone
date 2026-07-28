import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import { getConversation } from "../../src/db/queries/conversations.js";
import { createLesson, getLessons } from "../../src/db/queries/lessons.js";
import {
  generateLanguageLesson,
  type LessonSourceMessage,
} from "../../src/services/generateLanguageLesson.js";

export const config = {
  runtime: "nodejs",
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
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as Record<string, unknown>;
      const originalText =
        typeof candidate.originalText === "string"
          ? candidate.originalText.trim().slice(0, 500)
          : "";
      const translatedText =
        typeof candidate.translatedText === "string"
          ? candidate.translatedText.trim().slice(0, 500)
          : "";

      if (!originalText && !translatedText) return null;

      return { originalText, translatedText };
    })
    .filter((entry): entry is LessonSourceMessage => entry !== null)
    .slice(-12);
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    const authenticatedRequest = await requireAuthenticatedVercelAppRequest(request);

    if ("errorResponse" in authenticatedRequest) {
      return authenticatedRequest.errorResponse;
    }

    if (!authenticatedRequest.appUser) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    if (request.method === "GET") {
      try {
        return jsonResponse(await getLessons(authenticatedRequest.appUser.id));
      } catch (error) {
        console.error("Failed to fetch lessons", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await request.json().catch(() => null);
    const source = body?.source === "chat" || body?.source === "topic" ? body.source : null;
    const topic = typeof body?.topic === "string" ? body.topic.trim().slice(0, 160) : "";
    const messages = coerceMessages(body?.messages);

    if (!source || !isLanguageCode(body?.sourceLanguage) || !isLanguageCode(body?.targetLanguage)) {
      return jsonResponse({ error: "A lesson source and two valid languages are required" }, 400);
    }

    if (source === "topic" && topic.length < 2) {
      return jsonResponse({ error: "Enter a topic or situation for the lesson" }, 400);
    }

    if (source === "chat" && messages.length === 0) {
      return jsonResponse({ error: "Send a chat message before creating a chat lesson" }, 400);
    }

    const conversationId =
      typeof body?.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;

    try {
      if (conversationId) {
        const conversation = await getConversation(
          conversationId,
          authenticatedRequest.appUser.id,
        );

        if (!conversation) {
          return jsonResponse({ error: "Conversation not found or unauthorized" }, 404);
        }
      }

      const content = await generateLanguageLesson({
        source,
        topic,
        sourceLanguageCode: body.sourceLanguage.trim().toLowerCase(),
        targetLanguageCode: body.targetLanguage.trim().toLowerCase(),
        messages,
      });
      const lesson = await createLesson({
        userId: authenticatedRequest.appUser.id,
        source,
        sourceConversationId: conversationId,
        topic: content.topic,
        sourceLanguage: body.sourceLanguage.trim().toLowerCase(),
        targetLanguage: body.targetLanguage.trim().toLowerCase(),
        content,
      });

      return jsonResponse(lesson, 201);
    } catch (error) {
      console.error("Failed to create lesson", error);
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Failed to create lesson" },
        500,
      );
    }
  },
};
