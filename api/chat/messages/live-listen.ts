import { runLiveListenChunk } from "../../../src/lib/runLiveListenChunk.js";

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
      const formData = await request.formData();
      const conversationId = formData.get("conversationId");
      const authenticatedRequest =
        typeof conversationId === "string" && conversationId.trim()
          ? await (
              await import("../../../src/auth/vercel.js")
            ).getOptionalAuthenticatedVercelAppRequest(request)
          : null;
      const sourceAudio = formData.get("sourceAudio");
      const sourceAudioFile =
        sourceAudio &&
        typeof sourceAudio !== "string" &&
        typeof sourceAudio.arrayBuffer === "function"
          ? {
              buffer: Buffer.from(await sourceAudio.arrayBuffer()),
              filename:
                typeof (sourceAudio as { name?: unknown }).name === "string" &&
                (sourceAudio as { name: string }).name
                  ? (sourceAudio as { name: string }).name
                  : "live-listen.webm",
              mimeType:
                typeof sourceAudio.type === "string" && sourceAudio.type
                  ? sourceAudio.type
                  : undefined,
            }
          : undefined;

      const result = await runLiveListenChunk({
        listenerLanguage: formData.get("listenerLanguage"),
        theirLanguage: formData.get("theirLanguage"),
        chunkId: formData.get("chunkId"),
        isPreview: formData.get("isPreview"),
        contextBias: formData.get("contextBias"),
        conversationId: formData.get("conversationId"),
        userId: authenticatedRequest?.appUser?.id ?? null,
        sourceAudioFile,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result);
    } catch {
      console.error("Live listen chunk failed");
      return jsonResponse({ error: "Live listen chunk failed" }, 502);
    }
  },
};
