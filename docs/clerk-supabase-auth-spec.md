# StringPhone Clerk + Supabase Auth Spec

Status: In Progress
Date: 2026-05-16
Repo: StringPhone

Primary Client References:

- `/c:/Users/merli/Desktop/repos/stringphone/client/src/main.jsx`
- `/c:/Users/merli/Desktop/repos/stringphone/client/src/App.jsx`
- `/c:/Users/merli/Desktop/repos/stringphone/client/src/Login.jsx`
- `/c:/Users/merli/Desktop/repos/stringphone/client/src/Signup.jsx`
- `/c:/Users/merli/Desktop/repos/stringphone/client/src/StringPhoneApp.jsx`
- `/c:/Users/merli/Desktop/repos/stringphone/client/src/sharedRoomApi.js`
- `/c:/Users/merli/Desktop/repos/stringphone/client/package.json`

Primary Backend References:

- `/c:/Users/merli/Desktop/repos/stringphone/src/server.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/src/lib/realtimeRooms.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/api/chat/rooms.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/api/speech/translate.ts`
- `/c:/Users/merli/Desktop/repos/stringphone/vercel.json`
- `/c:/Users/merli/Desktop/repos/stringphone/package.json`

## 1. Feature Summary

StringPhone will gain a guest-first authentication foundation using Clerk for identity and Supabase Postgres for app-owned user records.

This auth rollout is not a product pivot into an account-gated app. The translation experience at `/` remains usable without signing in. The new work adds dedicated login and signup routes, a minimal authenticated account record, and shared backend auth plumbing so the repo can safely grow into account-linked features later.

Phase 1 only creates the base account layer:

- Clerk handles sign up, sign in, sign out, and session state.
- Supabase Postgres stores one minimal `users` row per Clerk user.
- The backend verifies Clerk auth before reading or writing app-owned user data.
- The current translation endpoints and current live-room token model remain public.

## 2. Locked Product Decisions

- StringPhone remains usable as a guest on `/`.
- Auth adds dedicated `/login/*` and `/signup/*` routes instead of modal-only auth.
- Redirect target after sign-in and sign-up is `/`.
- Phase 1 creates only a minimal Supabase-backed user record.
- No onboarding form is included in this rollout.
- No room persistence or message history persistence is included in this rollout.
- No account-linked ownership changes are made to the current shared-room flow in this rollout.
- Clerk remains the only auth provider.
- Supabase is introduced here as Postgres storage for app data, not as the primary auth system.

## 3. Goals

- Add Clerk-based sign up and sign in to StringPhone without breaking guest access.
- Mirror the same broad VoteFeed stack shape: React + Vite + Clerk on the client, Clerk-verified server requests, and `pg` access into Supabase Postgres.
- Create dedicated auth pages that work in local dev and on Vercel.
- Create a minimal `users` table keyed by `clerk_user_id`.
- Add authenticated `bootstrap` and `me` user endpoints with identical payload shapes across local Express and deployed Vercel API routes.
- Preserve current public translation and shared-room behavior while introducing account infrastructure.

## 4. Non-Goals For Phase 1

- No requirement to sign in before using StringPhone translation modes.
- No profile settings page.
- No persistent saved room list or conversation history.
- No room ownership migration from `participantSessionToken` to Clerk identity.
- No RLS-based client-side Supabase access pattern.
- No Supabase Auth, magic links, or secondary auth provider.
- No audio blob persistence in local storage or session storage.
- No rewrite of the current translation pipeline.

## 5. Current Repo Constraints

This spec must respect the current repo shape:

- `client/src/main.jsx` now wraps the routed app in both `ClerkProvider` and the app-specific `AuthProvider`.
- `client/src/App.jsx` now owns the route shell for `/`, `/login/*`, and `/signup/*`.
- `client/package.json` now includes Clerk and `react-router-dom`.
- `StringPhoneApp.jsx` is a single-screen application shell that owns app mode, languages, recording state, shared-room state, and invite query handling.
- Shared chat rooms currently use in-memory room records from `src/lib/realtimeRooms.ts`.
- Shared room access is currently guarded only by `participantSessionToken`, which is intentionally out of scope for this auth rollout.
- `src/server.ts` serves local Express routes, while `api/` contains deployed Vercel handlers for production parity.
- `src/server.ts` currently allows only `Content-Type` in CORS headers, so authenticated local requests will need `Authorization` added.
- The repo does not currently contain a DB client layer, a `supabase/` folder, or user query helpers.

## 6. Product Intent

This rollout is a foundation layer, not a finished account product.

The app should communicate:

- you can try StringPhone immediately
- creating an account is optional in this phase
- auth exists so future saved features can be tied to a real user record

The UI should not interrupt the core translation flow with a forced gate. The auth entry points should be visible, but secondary to the core translation controls.

## 7. Target Architecture

### 7.1 Client

Target client stack for this rollout:

- React + Vite
- React Router
- `ClerkProvider`
- a small `AuthProvider` similar in role to VoteFeed's auth context

Recommended client structure:

- `client/src/main.jsx` wraps the app in `ClerkProvider` and `AuthProvider`
- `client/src/App.jsx` owns routing
- `client/src/StringPhoneApp.jsx` remains the root product screen mounted at `/`
- `client/src/Login.jsx` renders Clerk `SignIn`
- `client/src/Signup.jsx` renders Clerk `SignUp`
- `client/src/AuthContext.jsx` exposes app auth state and helpers
- `client/src/useClerkAuthFetch.js` or equivalent wraps bearer-token fetch behavior

### 7.2 Server

Target server stack for this rollout:

- local Express with Clerk middleware
- Vercel API handlers with matching bearer-token verification
- shared `pg` query helpers for app-owned users

The backend should treat Clerk as the source of identity and Supabase Postgres as the source of app-owned user records.

### 7.3 Data

Target data stack for this rollout:

- Supabase project for Postgres hosting
- `DATABASE_URL` consumed through `pg`
- minimal `users` table with upsert behavior on `clerk_user_id`

No client-side Supabase SDK auth flow is needed in this phase.

## 8. Routes And Public Interfaces

### 8.1 New Client Routes

- `/`
- `/login/*`
- `/signup/*`

`/` continues to render the current StringPhone experience.

`/login/*` and `/signup/*` render dedicated Clerk pages with guards that redirect already-signed-in users back to `/`.

### 8.2 New User Endpoints

Deployed Vercel routes:

- `POST /api/users/me/bootstrap`
- `GET /api/users/me`

Local Express parity routes:

- `POST /users/me/bootstrap`
- `GET /users/me`

Both environments must return the same JSON shape.

### 8.3 Auth Context Contract

The client auth layer should expose:

- `isLoaded`
- `isSignedIn`
- `authFetch`
- `account`
- `refreshAccount`
- `signOut`

Recommended shape:

```ts
type AuthContextValue = {
  isLoaded: boolean;
  isSignedIn: boolean;
  account: {
    id: number;
    clerk_user_id: string;
    email: string | null;
    display_name: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  refreshAccount: () => Promise<void>;
  signOut: () => Promise<void>;
};
```

### 8.4 Supabase User Record Shape

The first app-owned user row should contain:

```sql
id serial primary key,
clerk_user_id text not null unique,
email text,
display_name text,
created_at timestamptz not null default now(),
updated_at timestamptz not null default now()
```

This is intentionally minimal for phase 1.

## 9. Auth User Flows

### 9.1 Guest Flow

1. User lands on `/`.
2. User can use the current translation flows without signing in.
3. User sees a visible auth CTA in the app shell.
4. No public translation route is blocked by auth in this phase.

### 9.2 Signup Flow

1. Guest clicks `Sign Up`.
2. App stores lightweight return state in `sessionStorage`.
3. App routes to `/signup`.
4. Clerk completes account creation.
5. Clerk redirects the user back to `/`.
6. Client calls `POST /api/users/me/bootstrap`.
7. Server verifies the Clerk identity, upserts the minimal user row, and returns it.
8. App refreshes auth context state and restores the pre-auth mode and language context.

### 9.3 Login Flow

1. Guest clicks `Log In`.
2. App stores lightweight return state in `sessionStorage`.
3. App routes to `/login`.
4. Clerk completes sign in.
5. Clerk redirects the user back to `/`.
6. Client calls `POST /api/users/me/bootstrap` if no account is loaded yet.
7. Client refreshes `GET /api/users/me`.
8. App restores pre-auth mode and language context.

### 9.4 Already Signed-In Guard Flow

- Visiting `/login` while signed in redirects to `/`.
- Visiting `/signup` while signed in redirects to `/`.

## 10. UI Direction

The auth UI should stay aligned with the existing StringPhone app instead of feeling like a separate product.

Recommended direction:

- keep the current translation screen on `/`
- add a compact account control in the top-right area of the existing shell
- signed-out state shows `Sign Up` and `Log In`
- signed-in state shows a compact display name or account label plus `Log Out`

This should be visible without overpowering the current translation controls or the floating mode switcher.

## 11. Session Storage Rules

This rollout needs a lightweight auth return-state bridge similar in purpose to VoteFeed's signup redirect bridge.

Add one new session storage key for auth return context, for example:

- `stringphone_auth_return_state_v1`

It should only store lightweight UI context such as:

- `appMode`
- `myLanguageCode`
- `theirLanguageCode`
- current `join` query token when present

It must not store:

- audio blobs
- message history
- Clerk tokens
- server-issued auth data

The current shared-room session key may remain unchanged because that behavior is outside this auth rollout.

## 12. Backend Behavior

### 12.1 User Bootstrap

`POST /api/users/me/bootstrap` should:

- require a valid Clerk session
- read the authenticated Clerk user id from the verified request
- resolve the user's primary email and a display name from Clerk identity data
- upsert into Supabase Postgres on `clerk_user_id`
- return the resulting app user row

The endpoint should not accept arbitrary guest identity input as the source of truth.

### 12.2 Current User

`GET /api/users/me` should:

- require a valid Clerk session
- look up the app user row by `clerk_user_id`
- return `404` if the Clerk session exists but the app user row has not been bootstrapped yet
- return the minimal user object when found

### 12.3 Public Routes That Stay Unchanged

These stay public in phase 1:

- `/speech/translate`
- `/chat/messages/text`
- `/chat/messages/voice`
- `/chat/rooms`
- `/chat/rooms/join`
- current shared room message and retry endpoints

This auth rollout must not retroactively gate those flows.

## 13. Local Express And Vercel Parity

The repo already supports both local Express development and deployed Vercel `api/` handlers. The auth rollout must preserve that split.

Required parity work:

- local Express gets Clerk middleware plus user lookup helpers
- local Express CORS allows `Authorization`
- Vercel API routes verify bearer tokens in `Authorization`
- shared query helpers are reused by both local and deployed user endpoints
- response payloads and status codes match between local and deployed environments

Recommended shared backend pieces:

- `src/db/client.ts`
- `src/db/queries/users.ts`
- `src/auth/` helper utilities for resolving the authenticated Clerk identity

## 14. Supabase Repo Scaffolding

Add minimal Supabase scaffolding so the auth work has a durable schema home in the repo.

Recommended artifacts:

- `supabase/config.toml`
- `supabase/migrations/<timestamp>_create_users.sql`

Phase 1 does not need:

- Supabase Edge Functions
- storage buckets
- RLS policies for a browser-side Supabase client

This repo is using Supabase as hosted Postgres behind backend-owned `pg` queries, so the schema artifact is the important part here.

## 15. Environment And Rollout Notes

### 15.1 Local Environment

Expected local env values:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `CLIENT_ORIGIN`

`CLIENT_ORIGIN` should continue covering local Vite ports such as:

- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`

### 15.2 Clerk Dashboard

Clerk redirect configuration should include:

- the active deployed StringPhone origin
- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`

Fallback redirect behavior should return users to `/`.

### 15.3 Vercel

Vercel needs matching environment variables for:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`

If `VITE_API_BASE_URL` is used in production, it must continue resolving to the same deployed `/api` surface.

## 16. Implementation Checklist

Progress snapshot as of 2026-05-16:

- Client and server auth dependencies are installed.
- The app now routes through `client/src/App.jsx`.
- Clerk is bootstrapped in `client/src/main.jsx`.
- Dedicated Clerk-powered `/login/*` and `/signup/*` pages are implemented.
- Signed-in redirect guards and fallback redirects to `/` are implemented.
- The app-specific `AuthProvider` is wired and the first visible guest-first account controls are live in `StringPhoneApp.jsx`.
- The next unfinished slice starts with auth return-state handling, then backend account bootstrap/loading.

### Phase 1: Dependencies And Routing

- [x] Add client dependencies for Clerk and `react-router-dom`.
- [x] Add server dependencies for Clerk middleware and `pg`.
- [x] Introduce `client/src/App.jsx` and route the current app shell through `/`.
- [x] Wrap the client entrypoint with `ClerkProvider` and a VoteFeed-style `AuthProvider`.
- [x] Add dedicated `Login` and `Signup` pages that render Clerk `SignIn` and `SignUp`.
- [x] Add signed-in guards so `/login` and `/signup` redirect to `/`.
- [x] Set Clerk fallback redirects to `/`.

### Phase 2: Visible Guest-First Auth UI

- [x] Add a visible signed-out CTA inside the current app shell without blocking translation use.
- [x] Add a signed-in account affordance with a logout action.
- [ ] Add session storage return-state handling so mode and language context survive Clerk redirects.
- [ ] Do not persist audio blobs or message history in the new auth-return state.

### Phase 3: Supabase And Backend User Layer

- [ ] Add `supabase/` scaffolding and a migration for the minimal `users` table.
- [ ] Add a shared DB client for `DATABASE_URL`.
- [ ] Add `upsertUserByClerkId`.
- [ ] Add `getUserByClerkId`.
- [ ] Add local Express auth handling and attach the app user lookup to authenticated requests.
- [ ] Add matching Vercel token verification helpers for authenticated user routes.
- [ ] Add `POST /users/me/bootstrap` and `GET /users/me` locally.
- [ ] Add `POST /api/users/me/bootstrap` and `GET /api/users/me` for deployed parity.
- [ ] Update local Express CORS to allow `Authorization`.

### Phase 4: Scope Protection And Rollout Notes

- [ ] Keep `/speech/translate`, `/chat/messages/*`, and the current shared-room routes public.
- [ ] Keep the current `participantSessionToken` room model out of scope for phase 1 auth.
- [ ] Document Clerk dashboard redirect setup.
- [ ] Document required Vercel environment variables.
- [ ] Document Supabase `DATABASE_URL` setup and migration application steps.

## 17. Acceptance Criteria

This auth foundation is complete for phase 1 when all of the following are true:

- Guests can still open `/` and use StringPhone without signing in.
- `/signup` creates a Clerk account and returns to `/`.
- `/login` signs in an existing user and returns to `/`.
- Already-signed-in users who visit `/login` or `/signup` are redirected to `/`.
- The app can bootstrap a minimal Supabase user row for the current Clerk user.
- `GET /api/users/me` returns the current app user when bootstrapped.
- Unauthenticated requests to auth-protected user endpoints return `401`.
- Public translation endpoints and public shared-room flows still work for signed-out users.
- Local Express and deployed Vercel user endpoints match in payload shape and basic behavior.

## 18. Verification Checklist

- [ ] Open `/` while signed out and confirm all current translation modes still work.
- [ ] Click `Sign Up`, complete Clerk signup, and confirm the app returns to `/`.
- [ ] Confirm the app calls user bootstrap and creates a minimal `users` row in Supabase.
- [ ] Click `Log In`, complete Clerk sign in, and confirm the app returns to `/`.
- [ ] Visit `/login` while already signed in and confirm it redirects to `/`.
- [ ] Visit `/signup` while already signed in and confirm it redirects to `/`.
- [ ] Call `GET /api/users/me` with a valid Clerk session and confirm it returns the current app user.
- [ ] Call `POST /api/users/me/bootstrap` with a valid Clerk session and confirm it upserts the current app user.
- [ ] Call both user endpoints without auth and confirm they return `401`.
- [ ] Re-test current shared-room create, join, send, and retry flows while signed out.
- [ ] Re-test current `/speech/translate` and `/chat/messages/*` behavior while signed out.
- [ ] Confirm local Express and deployed Vercel auth-protected user endpoints return the same field names and status behavior.

## 19. Recommended Validation Commands

After implementation, these are the minimum validation commands to run from this repo:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' --prefix client run build
& 'C:\Program Files\nodejs\npm.cmd' --prefix client run dev
```

And for backend auth checks once the endpoints exist:

```powershell
Invoke-RestMethod -Method Get -Uri http://localhost:3001/users/me
Invoke-RestMethod -Method Post -Uri http://localhost:3001/users/me/bootstrap
```

The unauthenticated calls above should return `401` once auth protection is in place.

## 20. Final Recommendation

Build this as a narrow, guest-first auth foundation.

That means:

- add Clerk cleanly
- add routed login and signup pages
- add the minimum viable Supabase `users` table
- add shared backend auth plumbing
- keep current translation and shared-room flows public
- avoid broadening phase 1 into persistence, onboarding, or ownership refactors
