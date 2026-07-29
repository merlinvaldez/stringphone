import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import { archiveLesson } from "../../src/db/queries/lessons.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    if (request.method !== "DELETE") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authenticatedRequest = await requireAuthenticatedVercelAppRequest(request);

    if ("errorResponse" in authenticatedRequest) {
      return authenticatedRequest.errorResponse;
    }

    if (!authenticatedRequest.appUser) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const lessonsIndex = pathParts.indexOf("lessons");

    if (lessonsIndex < 0 || lessonsIndex + 1 >= pathParts.length) {
      return jsonResponse({ error: "Invalid route" }, 400);
    }

    const lessonId = pathParts[lessonsIndex + 1];

    try {
      const lesson = await archiveLesson({
        lessonId,
        userId: authenticatedRequest.appUser.id,
      });

      if (!lesson) {
        return jsonResponse({ error: "Lesson not found or unauthorized" }, 404);
      }

      return jsonResponse(lesson);
    } catch (error) {
      console.error("Failed to archive lesson", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  },
};
