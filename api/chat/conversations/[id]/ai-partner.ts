import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../../src/auth/vercel.js";
import {
  buildAiPartnerSessionSnapshot,
  getAiPartnerSession,
  upsertAiPartnerSession,
} from "../../../../src/db/queries/aiPartnerSessions.js";
import { getConversation } from "../../../../src/db/queries/conversations.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    const authenticatedRequest =
      await requireAuthenticatedVercelAppRequest(request);

    if ("errorResponse" in authenticatedRequest) {
      return authenticatedRequest.errorResponse;
    }

    if (!authenticatedRequest.appUser) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const conversationsIndex = pathParts.indexOf("conversations");

    if (conversationsIndex < 0 || conversationsIndex + 1 >= pathParts.length) {
      return jsonResponse({ error: "Invalid route" }, 400);
    }

    const conversationId = pathParts[conversationsIndex + 1];
    const conversation = await getConversation(
      conversationId,
      authenticatedRequest.appUser.id,
    );

    if (!conversation) {
      return jsonResponse({ error: "Conversation not found or unauthorized" }, 404);
    }

    if (request.method === "GET") {
      try {
        const session = await getAiPartnerSession({
          conversationId,
          userId: authenticatedRequest.appUser.id,
        });

        return jsonResponse(
          buildAiPartnerSessionSnapshot(session, conversation.target_language),
        );
      } catch (error) {
        console.error("Failed to fetch AI partner session", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    if (request.method !== "PUT") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = await request.json().catch(() => null);

    if (typeof body?.enabled !== "boolean") {
      return jsonResponse({ error: "enabled must be a boolean" }, 400);
    }

    try {
      const session = await upsertAiPartnerSession({
        conversationId,
        userId: authenticatedRequest.appUser.id,
        partnerLanguage: conversation.target_language,
        enabled: body.enabled,
      });

      return jsonResponse(
        buildAiPartnerSessionSnapshot(session, conversation.target_language),
      );
    } catch (error) {
      console.error("Failed to update AI partner session", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  },
};
