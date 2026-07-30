import "../../src/lib/mistral.js";
import { bufferToUint8Array } from "../../src/lib/binary.js";
import { runSpeechTranslation } from "../../src/lib/runSpeechTranslation.js";

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
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

    const result = await runSpeechTranslation({
      responseMode: formData.get("responseMode"),
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

    if (result.ok === false) {
      return jsonResponse(result.body, result.status);
    }

    if (result.wantsJson) {
      return jsonResponse({
        transcript: result.transcript,
        translation: result.translation,
        targetLanguage: result.targetLanguage,
        audio: {
          mimeType: "audio/mpeg",
          base64: result.audioBuffer.toString("base64"),
        },
      });
    }

    return new Response(bufferToUint8Array(result.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="translated-speech.mp3"',
      },
    });
  },
};
