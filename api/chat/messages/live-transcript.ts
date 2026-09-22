import { getOptionalAuthenticatedVercelAppRequest } from "../../../src/auth/vercel.js";
import { runLiveConversationTranscript } from "../../../src/lib/runLiveConversationTranscript.js";

export const config = { runtime: "nodejs" };

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getFormString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
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
      // Clerk authentication clones the request, so it must run before the
      // multipart or JSON body is consumed below.
      const authenticatedRequest =
        await getOptionalAuthenticatedVercelAppRequest(request);
      const contentType = request.headers.get("content-type") ?? "";
      let body: Record<string, unknown> | null = null;
      let sourceAudioFile:
        | {
            buffer: Buffer;
            filename: string;
            mimeType?: string;
          }
        | undefined;

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        body = {
          utteranceId: getFormString(formData, "utteranceId"),
          revision: getFormString(formData, "revision"),
          sourceLanguage: getFormString(formData, "sourceLanguage"),
          targetLanguage: getFormString(formData, "targetLanguage"),
          transcript: getFormString(formData, "transcript"),
          translatedText: getFormString(formData, "translatedText"),
          liveMode: getFormString(formData, "liveMode"),
          sender: getFormString(formData, "sender"),
          conversationId: getFormString(formData, "conversationId"),
        };

        const sourceAudio = formData.get("sourceAudio");
        if (sourceAudio && typeof sourceAudio !== "string") {
          sourceAudioFile = {
            buffer: Buffer.from(await sourceAudio.arrayBuffer()),
            filename: sourceAudio.name || "stringphone-live-transcript.webm",
            mimeType: sourceAudio.type || undefined,
          };
        }
      } else {
        body = await request.json().catch(() => null);
      }

      const result = await runLiveConversationTranscript({
        utteranceId: body?.utteranceId,
        revision: body?.revision,
        sourceLanguage: body?.sourceLanguage,
        targetLanguage: body?.targetLanguage,
        transcript: body?.transcript,
        translatedText: body?.translatedText,
        liveMode: body?.liveMode,
        sender: body?.sender,
        conversationId: body?.conversationId,
        userId: authenticatedRequest?.appUser?.id ?? null,
        sourceAudioFile,
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
