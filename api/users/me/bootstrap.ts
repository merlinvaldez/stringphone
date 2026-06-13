import { getClerkUserIdentity } from "../../../src/auth/clerkUser.js";
import {
  authRouteOptionsResponse,
  jsonResponse,
  requireAuthenticatedVercelAppRequest,
} from "../../../src/auth/vercel.js";
import { upsertUserByClerkId } from "../../../src/db/queries/users.js";

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

    try {
      const clerkIdentity = await getClerkUserIdentity(
        authenticatedRequest.clerkUserId,
      );
      const appUser = await upsertUserByClerkId({
        clerkUserId: clerkIdentity.clerkUserId,
        email: clerkIdentity.email,
        displayName: clerkIdentity.displayName,
      });

      return jsonResponse(appUser);
    } catch (error) {
      console.error("Failed to bootstrap current deployed user", error);
      return jsonResponse({ error: "Failed to bootstrap current user" }, 502);
    }
  },
};
