import { createClerkClient } from "@clerk/backend";
import "dotenv/config";

const secretKey = process.env.CLERK_SECRET_KEY?.trim();
const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

if (!secretKey) {
  throw new Error("Missing CLERK_SECRET_KEY in the environment");
}

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in the environment");
}

export const clerkClient = createClerkClient({
  publishableKey,
  secretKey,
});
