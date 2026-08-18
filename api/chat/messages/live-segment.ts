import "../../../src/lib/mistral.js";
import { getOptionalAuthenticatedVercelAppRequest } from "../../../src/auth/vercel.js";
import { runLiveConversationSegment } from "../../../src/lib/runLiveConversationSegment.js";

export const config = {
  runtime: "nodejs",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
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
      const authenticatedRequest =
        await getOptionalAuthenticatedVercelAppRequest(request);
      const formData = await request.formData();
      const sourceAudio = formData.get("sourceAudio");
      const sourceAudioFile =
        sourceAudio instanceof File
          ? {
              buffer: Buffer.from(await sourceAudio.arrayBuffer()),
              filename: sourceAudio.name || "live-segment.webm",
              mimeType: sourceAudio.type || undefined,
            }
          : undefined;
      const result = await runLiveConversationSegment({
        sourceLanguage: formData.get("sourceLanguage"),
        targetLanguage: formData.get("targetLanguage"),
        conversationId: formData.get("conversationId"),
        userId: authenticatedRequest?.appUser?.id ?? null,
        sourceAudioFile,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result);
    } catch (error) {
      console.error("Live conversation segment failed", error);
      return jsonResponse({ error: "Live conversation segment failed" }, 502);
    }
  },
};
