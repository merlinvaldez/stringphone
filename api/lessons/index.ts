import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import { getLessons } from "../../src/db/queries/lessons.js";
import {
  LessonGenerationError,
} from "../../src/services/generateLanguageLesson.js";
import {
  createLanguageLessonForUser,
  LessonRequestError,
} from "../../src/services/createLanguageLessonForUser.js";

export const config = {
  runtime: "nodejs",
};

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

    try {
      const lesson = await createLanguageLessonForUser({
        userId: authenticatedRequest.appUser.id,
        body,
      });

      return jsonResponse(lesson, 201);
    } catch (error) {
      console.error("Failed to create lesson", error);
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Failed to create lesson" },
        error instanceof LessonGenerationError || error instanceof LessonRequestError
          ? error.status
          : 500,
      );
    }
  },
};
