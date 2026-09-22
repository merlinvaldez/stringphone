import { getUserByClerkId, type AppUser } from "../db/queries/users.js";
import { clerkClient } from "./clerkClient.js";

type AuthenticatedVercelAppRequest =
  | {
      clerkUserId: string;
      appUser: AppUser | null;
    }
  | {
      errorResponse: Response;
    };

const authRouteHeaders = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
};

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

export function authRouteOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: authRouteHeaders,
  });
}

function createVercelAuthRequest(request: Request) {
  // Clerk only needs the URL and request headers to resolve the session. Passing
  // the original Request makes Clerk's Request wrapper try to reuse the body
  // stream, which can fail with `TypeError: unusable` on Vercel. Keep the body
  // available for the route handler by authenticating against a header-only
  // request instead.
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
  });
}

export async function getOptionalAuthenticatedVercelAppRequest(
  request: Request,
): Promise<{ clerkUserId: string; appUser: AppUser | null } | null> {
  try {
    const requestState = await clerkClient.authenticateRequest(
      createVercelAuthRequest(request),
    );
    const auth = requestState.toAuth();

    if (!auth?.userId) {
      return null;
    }

    const appUser = await getUserByClerkId(auth.userId);

    return {
      clerkUserId: auth.userId,
      appUser,
    };
  } catch (error) {
    console.error("Failed to resolve optional authenticated Vercel request", error);
    return null;
  }
}

export async function requireAuthenticatedVercelAppRequest(
  request: Request,
): Promise<AuthenticatedVercelAppRequest> {
  try {
    const requestState = await clerkClient.authenticateRequest(
      createVercelAuthRequest(request),
    );
    const auth = requestState.toAuth();

    if (!auth?.userId) {
      return {
        errorResponse: jsonResponse(
          { error: "Unauthorized" },
          401,
          authRouteHeaders,
        ),
      };
    }

    const appUser = await getUserByClerkId(auth.userId);

    return {
      clerkUserId: auth.userId,
      appUser,
    };
  } catch (error) {
    console.error("Failed to verify authenticated Vercel request", error);
    return {
      errorResponse: jsonResponse(
        { error: "Failed to verify authenticated request" },
        502,
        authRouteHeaders,
      ),
    };
  }
}
