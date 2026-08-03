import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import { listLanguageCollectionsForUser } from "../../src/services/languageCollections.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    if (request.method !== "GET") {
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
      const url = new URL(request.url);
      return jsonResponse(
        await listLanguageCollectionsForUser({
          userId: authenticatedRequest.appUser.id,
          query: url.searchParams.get("q"),
        }),
      );
    } catch (error) {
      console.error("Failed to fetch collections", error);
      return jsonResponse({ error: "Internal Server Error" }, 500);
    }
  },
};
