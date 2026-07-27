import { type QueryResultRow } from "pg";
import { db } from "../client.js";

export interface AppUser extends QueryResultRow {
  id: number;
  clerk_user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

type UpsertUserByClerkIdInput = {
  clerkUserId: string;
  email?: string | null;
  displayName?: string | null;
};

const returningColumns = `
  id,
  clerk_user_id,
  email,
  display_name,
  created_at,
  updated_at
`;

function normalizeRequiredText(value: string, fieldName: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmedValue;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length > 0 ? trimmedValue : null;
}

export async function getUserByClerkId(
  clerkUserId: string,
): Promise<AppUser | null> {
  const normalizedClerkUserId = normalizeRequiredText(
    clerkUserId,
    "clerkUserId",
  );
  const result = await db.query<AppUser>(
    `
      SELECT ${returningColumns}
      FROM public.users
      WHERE clerk_user_id = $1
      LIMIT 1
    `,
    [normalizedClerkUserId],
  );

  return result.rows[0] ?? null;
}

export async function upsertUserByClerkId({
  clerkUserId,
  email,
  displayName,
}: UpsertUserByClerkIdInput): Promise<AppUser> {
  const normalizedClerkUserId = normalizeRequiredText(
    clerkUserId,
    "clerkUserId",
  );
  const normalizedEmail = normalizeOptionalText(email);
  const normalizedDisplayName = normalizeOptionalText(displayName);
  const result = await db.query<AppUser>(
    `
      INSERT INTO public.users (
        clerk_user_id,
        email,
        display_name
      )
      VALUES ($1, $2, $3)
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET
        email = COALESCE(EXCLUDED.email, public.users.email),
        display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
        updated_at = now()
      RETURNING ${returningColumns}
    `,
    [normalizedClerkUserId, normalizedEmail, normalizedDisplayName],
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error("Failed to upsert user");
  }

  return user;
}
