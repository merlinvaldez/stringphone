create table public.users ( -- Create the app-owned users table in the default public schema.
  id serial primary key, -- Give each app user row its own internal numeric primary key.
  clerk_user_id text not null unique, -- Store the Clerk identity and enforce one app row per Clerk user.
  email text, -- Keep email optional in phase 1 because the bootstrap flow only needs a minimal record.
  display_name text, -- Keep display name optional until later profile or onboarding work exists.
  created_at timestamptz not null default now(), -- Record when the row was first created.
  updated_at timestamptz not null default now() -- Record the last update timestamp, starting at creation time.
); -- End the users table definition.