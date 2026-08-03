import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import {
  CollectionRequestError,
  getLanguageCollectionForUser,
} from "../../src/services/languageCollections.js";

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
      const pathParts = url.pathname.split("/");
      const collectionsIndex = pathParts.indexOf("collections");

      if (collectionsIndex < 0 || collectionsIndex + 1 >= pathParts.length) {
        return jsonResponse({ error: "Invalid route" }, 400);
      }

      const collection = await getLanguageCollectionForUser({
        userId: authenticatedRequest.appUser.id,
        languageCode: pathParts[collectionsIndex + 1],
        query: url.searchParams.get("q"),
      });

      if (!collection) {
        return jsonResponse({ error: "Collection not found" }, 404);
      }

      return jsonResponse(collection);
    } catch (error) {
      console.error("Failed to fetch collection detail", error);
      return jsonResponse(
        { error: error instanceof Error ? error.message : "Failed to fetch collection" },
        error instanceof CollectionRequestError ? error.status : 500,
      );
    }
  },
};
