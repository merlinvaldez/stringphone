import { runLiveConversationTranslation } from "../../../src/lib/runLiveConversationTranslation.js";

export const config = { runtime: "nodejs" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

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

    try {
      const body = await request.json().catch(() => null);
      const result = await runLiveConversationTranslation({
        utteranceId: body?.utteranceId,
        revision: body?.revision,
        sourceLanguage: body?.sourceLanguage,
        targetLanguage: body?.targetLanguage,
        transcript: body?.transcript,
        sender: body?.sender,
      });

      if (!result.ok) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result);
    } catch (error) {
      console.error("Live draft translation failed", error);
      return jsonResponse({ error: "Live draft translation failed." }, 502);
    }
  },
};
