import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../src/auth/vercel.js";
import {
  archiveLanguageCollectionEntryForUser,
  CollectionRequestError,
  saveLanguageCollectionEntryForUser,
} from "../../src/services/languageCollections.js";

export const config = {
  runtime: "nodejs",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return authRouteOptionsResponse();
    }

    if (request.method !== "POST" && request.method !== "DELETE") {
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
      if (request.method === "DELETE") {
        const url = new URL(request.url);
        const archivedEntry = await archiveLanguageCollectionEntryForUser({
          userId: authenticatedRequest.appUser.id,
          entryId: url.searchParams.get("entryId"),
        });

        if (!archivedEntry) {
          return jsonResponse({ error: "Collection entry not found" }, 404);
        }

        return jsonResponse(archivedEntry);
      }

      const body = await request.json().catch(() => null);
      return jsonResponse(
        await saveLanguageCollectionEntryForUser({
          userId: authenticatedRequest.appUser.id,
          body,
        }),
        201,
      );
    } catch (error) {
      console.error(
        request.method === "DELETE"
          ? "Failed to archive collection entry"
          : "Failed to save collection entry",
        error,
      );
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : request.method === "DELETE"
                ? "Failed to archive collection entry"
                : "Failed to save collection entry",
        },
        error instanceof CollectionRequestError ? error.status : 500,
      );
    }
  },
};
