import {
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
          "Access-Control-Allow-Methods": "POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const contentType = request.headers.get("content-type") ?? "";
      let conversationId: unknown;
      let language: unknown;
      let samples: unknown;

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        conversationId = formData.get("conversationId");
        language = formData.get("language");

        const uploadedEntries = formData.getAll("samples");
        const parsedSamples: RawVoiceCloneSample[] = [];
        for (const item of uploadedEntries) {
          if (item && typeof item !== "string") {
            const file = item as File;
            parsedSamples.push({
              buffer: Buffer.from(await file.arrayBuffer()),
              filename: file.name || "sample.wav",
              mimeType: file.type || undefined,
            });
          }
        }
        samples = parsedSamples;
      } else {
        const body = await request.json().catch(() => null);
        conversationId = body?.conversationId;
        language = body?.language;
        samples = body?.samples;
      }

      const result = await runChatVoiceCloning({
        conversationId,
        language,
        samples,
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
