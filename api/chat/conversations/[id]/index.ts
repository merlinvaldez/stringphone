import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../../src/auth/vercel.js";
import { updateConversationLanguages } from "../../../../src/db/queries/conversations.js";

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

    if (request.method !== "PATCH") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await request.json().catch(() => null);

    if (!body || !body.sourceLanguage || !body.targetLanguage) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const conversationsIndex = pathParts.indexOf("conversations");

    if (conversationsIndex < 0 || conversationsIndex + 1 >= pathParts.length) {
      return jsonResponse({ error: "Invalid route" }, 400);
    }

    try {
      const conversation = await updateConversationLanguages({
        conversationId: pathParts[conversationsIndex + 1],
        userId: authenticatedRequest.appUser.id,
        sourceLanguage: body.sourceLanguage,
        targetLanguage: body.targetLanguage,
      });

      if (!conversation) {
        return jsonResponse({ error: "Conversation not found or unauthorized" }, 404);
      }

      return jsonResponse(conversation);
    } catch (error) {
      console.error("Failed to update conversation languages", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  },
};
