import "../../../src/lib/mistral.js";
import {
  getOptionalAuthenticatedVercelAppRequest,
  jsonResponse,
} from "../../../src/auth/vercel.js";
import { runAiPartnerReply } from "../../../src/lib/runAiPartnerReply.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authenticatedRequest =
      await getOptionalAuthenticatedVercelAppRequest(request);
    const body = await request.json().catch(() => null);

    try {
      const result = await runAiPartnerReply({
        conversationId: body?.conversationId,
        userId: authenticatedRequest?.appUser?.id ?? null,
        userLanguage: body?.userLanguage,
        partnerLanguage: body?.partnerLanguage,
        recentMessages: body?.recentMessages,
        sessionDraft: body?.sessionDraft,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result);
    } catch (error) {
      console.error("AI partner reply failed", error);
      return jsonResponse({ error: "AI partner reply failed" }, 502);
    }
  },
};
