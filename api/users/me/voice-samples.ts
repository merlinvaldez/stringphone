import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../src/auth/vercel.js";
import { runSaveUserVoiceSample } from "../../../src/lib/runSaveUserVoiceSample.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const authenticatedRequest =
      await requireAuthenticatedVercelAppRequest(request);

    if ("errorResponse" in authenticatedRequest) {
      return authenticatedRequest.errorResponse;
    }

    if (!authenticatedRequest.appUser) {
      return jsonResponse({ error: "User not found" }, 404);
    }

    try {
      const formData = await request.formData();
      const voiceSample = formData.get("voiceSample");
      const result = await runSaveUserVoiceSample({
        userId: authenticatedRequest.appUser.id,
        conversationId: formData.get("conversationId"),
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

      return jsonResponse({ id: result.voiceSampleId }, 201);
    } catch (error) {
      console.error("Failed to save deployed user voice sample", error);
      return jsonResponse({ error: "Failed to save voice sample" }, 502);
    }
  },
};
