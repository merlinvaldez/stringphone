import "../../../src/lib/mistral.js";
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
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const formData = await request.formData();
    const sourceAudio = formData.get("sourceAudio");
    const voiceSample = formData.get("voiceSample");

    const result = await runVoiceChatMessage({
      sourceLanguage: formData.get("sourceLanguage"),
      targetLanguage: formData.get("targetLanguage"),
      sourceAudioFile:
        sourceAudio instanceof File
          ? {
              buffer: Buffer.from(await sourceAudio.arrayBuffer()),
              filename: sourceAudio.name || "source-audio.webm",
              mimeType: sourceAudio.type || undefined,
            }
          : undefined,
      voiceSampleFile:
        voiceSample instanceof File
          ? {
              buffer: Buffer.from(await voiceSample.arrayBuffer()),
              filename: voiceSample.name || "voice-sample.webm",
              mimeType: voiceSample.type || undefined,
            }
          : undefined,
    });

    if (!result.ok) {
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
    });
  },
};
