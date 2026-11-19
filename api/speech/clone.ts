import {
  clearCachedServerChatVoiceClonesForConversation,
  runChatVoiceCloning,
  type RawVoiceCloneSample,
} from "../../src/lib/runChatVoiceCloning.js";

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
          "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    if (request.method === "DELETE") {
      try {
        const body = await request.json().catch(() => null);
        const queryConversationId = new URL(request.url).searchParams.get(
          "conversationId",
        );
        const rawConversationId =
          typeof body?.conversationId === "string" && body.conversationId.trim()
            ? body.conversationId.trim()
            : typeof queryConversationId === "string" && queryConversationId.trim()
              ? queryConversationId.trim()
              : "";

        if (!rawConversationId) {
          return jsonResponse({ error: "conversationId is required" }, 400);
        }

        const clearedCount =
          clearCachedServerChatVoiceClonesForConversation(rawConversationId);
        return jsonResponse(
          {
            ok: true,
            conversationId: rawConversationId,
            clearedCount,
          },
          200,
        );
      } catch {
        console.error("Chat voice clone clearing failed");
        return jsonResponse({ error: "Chat voice clone clearing failed" }, 502);
      }
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const contentType = request.headers.get("content-type") ?? "";
      let conversationId: unknown;
      let language: unknown;
      let samples: unknown;
      let forceRefresh: unknown;

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        conversationId = formData.get("conversationId");
        language = formData.get("language");
        forceRefresh = formData.get("forceRefresh");

        const uploadedEntries = formData.getAll("samples");
        const uploadedTranscripts = formData.getAll("transcripts");
        const parsedSamples: RawVoiceCloneSample[] = [];
        for (let i = 0; i < uploadedEntries.length; i += 1) {
          const item = uploadedEntries[i];
          if (item && typeof item !== "string") {
            const file = item as File;
            const transcriptItem = uploadedTranscripts[i];
            parsedSamples.push({
              buffer: Buffer.from(await file.arrayBuffer()),
              filename: file.name || "sample.wav",
              mimeType: file.type || undefined,
              transcript:
                typeof transcriptItem === "string" ? transcriptItem : undefined,
            });
          }
        }
        samples = parsedSamples;
      } else {
        const body = await request.json().catch(() => null);
        conversationId = body?.conversationId;
        language = body?.language;
        samples = body?.samples;
        forceRefresh = body?.forceRefresh;
      }

      const result = await runChatVoiceCloning({
        conversationId,
        language,
        samples,
        forceRefresh,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result as unknown as Record<string, unknown>, 200);
    } catch {
      console.error("Chat voice clone processing failed");
      return jsonResponse({ error: "Chat voice clone processing failed" }, 502);
    }
  },
};
