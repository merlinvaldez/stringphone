import { getOptionalAuthenticatedVercelAppRequest } from "../../../src/auth/vercel.js";
import { createLiveTranscriptionClientSecret } from "../../../src/lib/createLiveTranscriptionClientSecret.js";

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
      const result = await createLiveTranscriptionClientSecret({
        sourceLanguage: body?.sourceLanguage,
        targetLanguage: body?.targetLanguage,
        userId: authenticatedRequest?.appUser?.id ?? null,
        forceFallback: body?.forceFallback === true,
        fallbackReason: body?.fallbackReason,
      });

      if (!result.ok) {
        return jsonResponse(result.body, result.status);
      }

      return jsonResponse(result.body);
    } catch (error) {
      console.error("Live transcription token creation failed", error);
      return jsonResponse({ error: "Unable to start live transcription." }, 502);
    }
  },
};
