import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../../src/auth/vercel.js";
import {
  createMessage,
  getConversation,
  getMessages,
} from "../../../../src/db/queries/conversations.js";

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

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const messagesIndex = pathParts.indexOf('messages');
    if (messagesIndex < 1) {
      return jsonResponse({ error: "Invalid route" }, 400);
    }
    const conversationId = pathParts[messagesIndex - 1];

    try {
      const conversation = await getConversation(conversationId, authenticatedRequest.appUser.id);
      if (!conversation) {
        return jsonResponse({ error: "Conversation not found or unauthorized" }, 404);
      }
    } catch (error) {
      console.error("Failed to fetch conversation", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }

    if (request.method === "GET") {
      try {
        const messages = await getMessages(conversationId);
        return jsonResponse(messages);
      } catch (error) {
        console.error("Failed to fetch messages", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);

      if (!body || !body.sender || !body.originalText || !body.translatedText) {
        return jsonResponse({ error: "Missing required fields" }, 400);
      }

      try {
        const message = await createMessage({
          conversationId,
          sender: body.sender,
          originalText: body.originalText,
          translatedText: body.translatedText,
          transcript: body.transcript ?? null,
          audioUrl: body.audioUrl ?? null,
        });
        return jsonResponse(message);
      } catch (error) {
        console.error("Failed to create message", error);
        return jsonResponse({ error: "Internal Server Error" }, 500);
      }
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },
};
