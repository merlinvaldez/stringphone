import { getOptionalAuthenticatedVercelAppRequest } from "../../../src/auth/vercel.js";
import { runLiveConversationTranscript } from "../../../src/lib/runLiveConversationTranscript.js";

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
      const authenticatedRequest =
        await getOptionalAuthenticatedVercelAppRequest(request);
      const result = await runLiveConversationTranscript({
        utteranceId: body?.utteranceId,
        revision: body?.revision,
        sourceLanguage: body?.sourceLanguage,
        targetLanguage: body?.targetLanguage,
        transcript: body?.transcript,
        translatedText: body?.translatedText,
        liveMode: body?.liveMode,
        conversationId: body?.conversationId,
        userId: authenticatedRequest?.appUser?.id ?? null,
      });

      if (!result.ok) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result);
    } catch (error) {
      console.error("Live transcript processing failed", error);
      return jsonResponse({ error: "Live transcription failed." }, 502);
    }
  },
};
