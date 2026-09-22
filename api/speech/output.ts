import { bufferToUint8Array } from "../../src/lib/binary.js";
import { runOutputTextToSpeech } from "../../src/lib/runOutputTextToSpeech.js";

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
      const body = await request.json().catch(() => null);
      const result = await runOutputTextToSpeech({
        text: body?.text,
        language: body?.language,
        speechVoice: body?.speechVoice,
      });

      if (result.ok === false) {
        return jsonResponse(result.body, result.status);
      }

      return new Response(bufferToUint8Array(result.audioBuffer), {
        status: 200,
        headers: {
          "Content-Type": result.contentType,
          "Content-Disposition":
            'inline; filename="stringphone-output-speech.wav"',
        },
      });
    } catch (error) {
      console.error("Output speech generation failed", error);
      return jsonResponse({ error: "Output speech generation failed" }, 502);
    }
  },
};
