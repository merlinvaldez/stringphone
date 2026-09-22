import { runVoiceChatMessage } from "../../../src/lib/runVoiceChatMessage.js";

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
      const sourceAudio = formData.get("sourceAudio");
      const sourceAudioFile =
        sourceAudio instanceof File
          ? {
              buffer: Buffer.from(await sourceAudio.arrayBuffer()),
              filename: sourceAudio.name || "source-audio.webm",
              mimeType: sourceAudio.type || undefined,
            }
          : undefined;
      const result = await runVoiceChatMessage({
        sourceLanguage: formData.get("sourceLanguage"),
        targetLanguage: formData.get("targetLanguage"),
        sourceAudioFile,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse({
        transcript: result.transcript,
        translatedText: result.translatedText,
        originalPronunciation: result.originalPronunciation,
        translatedPronunciation: result.translatedPronunciation,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        audio: {
          mimeType: result.audioMimeType,
          base64: result.audioBuffer.toString("base64"),
        },
        sourceAudio: {
          mimeType: result.sourceAudioMimeType,
          base64: result.sourceAudioBuffer.toString("base64"),
        },
      });
    } catch (error) {
      console.error("Voice chat translation failed", error);
      return jsonResponse({ error: "Voice chat translation failed" }, 502);
    }
  },
};
