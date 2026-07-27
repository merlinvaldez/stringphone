import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../src/auth/vercel.js";
import {
  createConversation,
  getConversations,
} from "../../../src/db/queries/conversations.js";

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
        const conversations = await getConversations(authenticatedRequest.appUser.id);
        return jsonResponse(conversations);
      } catch (error) {
        console.error("Failed to fetch conversations", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);

      if (!body || !body.title || !body.sourceLanguage || !body.targetLanguage) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      try {
        const conversation = await createConversation({
          userId: authenticatedRequest.appUser.id,
          title: body.title,
          sourceLanguage: body.sourceLanguage,
          targetLanguage: body.targetLanguage,
        });
        return jsonResponse(conversation);
      } catch (error) {
        console.error("Failed to create conversation", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },
};
