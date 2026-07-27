import { getAuth, type ExpressRequestWithAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { getUserByClerkId, type AppUser } from "../db/queries/users.js";

export type AuthenticatedAppRequest = ExpressRequestWithAuth & {
  appUser: AppUser | null;
  clerkUserId: string;
};

function toExpressRequestWithAuth(request: Request) {
  return request as ExpressRequestWithAuth;
}

function toAuthenticatedAppRequest(request: Request) {
  return request as Partial<AuthenticatedAppRequest>;
}

export function getAuthenticatedAppRequest(request: Request) {
  const authenticatedRequest = toAuthenticatedAppRequest(request);

  if (!authenticatedRequest.clerkUserId) {
    throw new Error("Authenticated request state was not loaded");
  }

  return authenticatedRequest as AuthenticatedAppRequest;
}

export async function requireAuthenticatedAppRequest(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const { userId } = getAuth(toExpressRequestWithAuth(request));

  if (!userId) {
    return response.status(401).json({ error: "Unauthorized" });
  }

  try {
    const appUser = await getUserByClerkId(userId);
    const authenticatedRequest = toAuthenticatedAppRequest(request);

    authenticatedRequest.clerkUserId = userId;
    authenticatedRequest.appUser = appUser;

    return next();
  } catch (error) {
    console.error("Failed to load authenticated app user", error);
    return response
      .status(502)
      .json({ error: "Failed to load authenticated app user" });
  }
}
