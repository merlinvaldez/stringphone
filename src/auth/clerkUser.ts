import { clerkClient } from "./clerkClient.js";

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

export async function getClerkUserIdentity(clerkUserId: string) {
  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail =
    clerkUser.emailAddresses.find(
      (emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    null;
  const displayName =
    normalizeOptionalText(clerkUser.fullName) ??
    normalizeOptionalText(clerkUser.username) ??
    normalizeOptionalText(primaryEmail);

  return {
    clerkUserId,
    email: normalizeOptionalText(primaryEmail),
    displayName,
  };
}
