# StringPhone AI Partner

**Status:** Proposed on `feat/8-ai-partner` for issue [#8](https://github.com/merlinvaldez/stringphone/issues/8) on 2026-07-30.  
**Product:** StringPhone  
**Audience:** people using StringPhone chat alone who want a conversational practice partner that behaves like a local speaker of the interlocutor language.

## Outcome

StringPhone adds an AI chat-partner mode inside the existing `Chat` surface, controlled by slash commands.

- Typing `/` in the chat composer reveals the available slash-command list.
- Typing `/aipartner` toggles the AI partner on or off for the current chat.
- When the partner is on, the first real user turn seeds a partner persona, scenario, and stable voice.
- After each successful user turn, StringPhone generates a follow-up AI partner reply in the interlocutor language, renders that reply as a `partner` message in the same thread, and includes playable audio in the partner's own voice.

This feature complements StringPhone's translation-first chat. It does not replace shared chat, lessons, or the existing user voice-cloning path.

## Product intent

- Let a solo learner practice a realistic back-and-forth when no human partner is available.
- Keep the interaction inside the current bilingual chat thread rather than creating a separate assistant screen.
- Preserve StringPhone's language-pair mental model:
  - `my language` is the user's language
  - `their language` is the partner's native or dominant language for the conversation
- Preserve existing translation and TTS infrastructure where it already fits.
- Avoid turning StringPhone into a generic AI tools shell.

## V1 principles

### The partner is an interlocutor, not a meta-assistant

The AI partner should sound like a real person in the target-language setting implied by the user's first turn. It should not answer like a help bot, product assistant, or teacher unless that persona is clearly implied by the conversation context.

### Slash commands are control input, not chat content

`/` opens command discovery and `/aipartner` drives chat state. Slash commands are not saved as normal conversation messages.

### Voice belongs to the partner

AI partner playback must never reuse the signed-in user's saved self-voice sample. The partner gets its own stable provider voice for the life of the conversation.

### Human chat must keep working

If AI reply generation fails, the user's message still succeeds. The feature may degrade the partner reply, but it must not break translation chat, history, lessons, or shared-room flows.

## Non-goals for V1

- No multiple AI commands beyond `/aipartner`.
- No editable partner persona prompt in the UI.
- No explicit partner gallery, voice picker, or character presets.
- No autoplay requirement for every incoming AI reply.
- No shared-room plus AI-partner hybrid session.
- No global partner memory across separate conversations.
- No custom user-created cloned AI voices.
- No slash-command persistence in saved message history.
- No explicit `/aipartner reset` command in V1.

## Current repo constraints

The implementation must fit the current StringPhone code paths.

- Chat orchestration lives in `client/src/StringPhoneApp.jsx`.
- The composer and thread UI live in `client/src/components/chat/*`.
- Typed chat already uses `POST /chat/messages/text`.
- Voice chat already uses `POST /chat/messages/voice`.
- Saved conversation rows live in `public.conversations` and `public.messages`.
- Persisted messages currently distinguish `sender in ('self', 'partner')`.
- Typed playback currently uses `POST /api/speech/output`, which prefers the signed-in user's saved voice samples when available.
- Shared-room chat is a separate transport and already introduces mode locks and special handling.

Those constraints mean the AI partner should be implemented as a chat-specific layer on top of the current text and voice flows, not by mutating the translation endpoint into a chatbot.

## User experience

### Command discovery

When the composer value begins with `/`, a compact command menu opens above the composer.

Initial command set:

| Command | Purpose |
| --- | --- |
| `/aipartner` | Toggle the AI partner for the current chat |

Behavior:

- Typing `/` opens the menu automatically.
- The menu stays local to the composer and does not create a message row.
- The user can keep typing `/aipartner`, or choose it with click, Enter, Tab, or arrow-key selection.
- Typing an unknown slash command shows a compact inline notice such as `Unknown command`.
- Sending the exact text `/` does nothing except keep command discovery visible or show `Select a command`.

### Toggle behavior

`/aipartner` is a state toggle for the current chat context.

When the partner is off:

- sending `/aipartner` turns it on;
- the UI shows a compact confirmation such as `AI partner on`;
- a persistent local status chip appears near the composer or header, for example `Partner on`;
- if the current conversation already has a saved AI partner profile, the toggle resumes that profile;
- otherwise the next real user turn seeds the persona and voice.

When the partner is on:

- sending `/aipartner` turns it off;
- the UI shows a compact confirmation such as `AI partner off`;
- the status chip updates immediately;
- previous AI messages stay in history;
- no more automatic AI replies are generated until the feature is re-enabled.

### First-turn seeding

The first non-command user turn after initial enablement seeds the partner profile.

That turn may be:

- a typed chat message; or
- a voice message whose transcript is already produced by the normal StringPhone voice flow.

The seed turn gives the model the strongest hint about:

- the setting or scenario;
- the relationship between speakers;
- the desired tone;
- whether the partner should sound casual, formal, playful, practical, etc.

The initial seed is conversation-specific. Starting a new chat yields a new partner. Re-enabling inside the same conversation resumes the existing partner rather than inventing a second one.

### Reply behavior

While AI partner mode is on, every successful user turn in chat may trigger one partner reply.

User-turn flow:

1. The user sends a normal text or voice turn.
2. StringPhone completes the existing translation flow for that turn.
3. The user turn is rendered and, when signed in, saved normally.
4. If AI partner mode is enabled and there is no in-flight partner reply, StringPhone requests one AI follow-up.
5. The reply is generated in the interlocutor language, translated back into the user's language, synthesized into partner audio, and appended to the thread as a `partner` message.

The partner reply should:

- be grounded in recent conversation context;
- sound like a local speaker of the current `their language`;
- move the conversation forward rather than explaining the app;
- stay concise enough for chat, usually one to three sentences;
- keep role consistency after the first seed turn.

### Rendering rules

AI partner replies should feel native to the current chat thread instead of introducing a new assistant card type.

Recommended V1 rendering:

- persist and hydrate AI partner replies as `sender: "partner"`;
- render replies as voice-backed partner messages:
  - `kind: "voice"` when synthesized audio is available;
  - fallback to `kind: "text"` if text generation succeeded but TTS failed;
- `originalText` and `transcript` both contain the partner's native-language reply;
- `translatedText` contains the user's-language translation;
- the bubble can show a subtle label such as `AI partner` or the partner display name after seeding.

The current `MessageBubble` layout already works well for this shape because partner voice bubbles can show:

- the partner-language text;
- the user's-language translation; and
- an embedded audio player.

### Shared-room behavior

AI partner is incompatible with shared-room chat in V1.

If shared-room chat is active:

- `/` may still list commands;
- `/aipartner` must not enable;
- the user gets a compact notice such as `AI partner is unavailable while shared chat is active`.

This mirrors the repo's existing lock behavior for incompatible chat states.

## Conversation behavior rules

### Language direction

The AI partner always behaves like the interlocutor, so its reply directions are reversed from the user's outgoing turn.

If the user message uses:

- source: `my language`
- target: `their language`

then the partner reply should be stored and rendered as:

- original text in `their language`
- translated text in `my language`

This matches current partner-bubble expectations in `MessageBubble.jsx`.

### Partner profile continuity

Within one conversation, the partner profile should remain stable across turns:

- same display name;
- same persona summary;
- same voice provider and voice id;
- same general tone and scenario unless the conversation naturally drifts.

Turning the partner off and back on inside the same conversation resumes that profile. Starting a new chat creates a new profile.

### Voice-input support

The partner should reply after either:

- a user text turn; or
- a user voice turn once the transcript is available.

This keeps the feature useful for actual speaking practice instead of only typed practice.

## Persistence model

V1 should support both signed-in persistence and signed-out temporary use.

### Signed-in behavior

When the user is signed in and the current chat has a persisted conversation id:

- the AI partner session is stored server-side per conversation;
- generated AI replies are written into `public.messages`;
- reopening the saved conversation restores:
  - partner enabled state,
  - partner persona metadata,
  - partner voice metadata,
  - prior AI partner messages and their audio playback.

### Signed-out behavior

When the user is not signed in:

- AI partner state exists only in local in-memory chat state;
- the current page session can still support `/aipartner`;
- reloading the page clears that state;
- no conversation or partner profile is persisted to the database.

This keeps the feature aligned with the current guest-accessible chat experience without overstating persistence.

## Data model

### New conversation-level table: `public.ai_partner_sessions`

Recommended migration: add a new table for stable per-conversation partner state.

| Field | Purpose |
| --- | --- |
| `id` | session identity |
| `conversation_id` | unique link to the saved StringPhone conversation |
| `user_id` | owner of the conversation and session |
| `enabled` | whether auto-replies are currently active |
| `seeded_at` | when the partner persona was first established |
| `disabled_at` | last explicit turn-off time |
| `seed_message_id` | first saved user message that seeded the profile |
| `partner_language` | normalized `their language` code for this session |
| `display_name` | short partner name surfaced in UI |
| `persona_summary` | compact identity summary used for later turns |
| `scenario_summary` | compact setting summary inferred from the seed turn |
| `style_summary` | tone/speaking-style summary |
| `voice_provider` | `mistral`, `cartesia`, or `elevenlabs` |
| `voice_id` | provider-specific stable voice id |
| `voice_label` | optional human-readable voice label |
| `metadata` | optional JSONB for future-safe extensibility |
| `created_at`, `updated_at` | audit timestamps |

Notes:

- `conversation_id` should be unique because V1 supports only one partner profile per conversation.
- `enabled` should default to `false`.
- `metadata` should default to `{}` instead of storing a null blob.

### Message schema extension: `message_origin`

Persisted messages need a durable way to distinguish human partner content from AI partner content.

Recommended migration on `public.messages`:

| Field | Purpose |
| --- | --- |
| `message_origin` | `human` or `ai_partner` |

Recommended constraint:

```sql
message_origin text not null default 'human'
  check (message_origin in ('human', 'ai_partner'))
```

Why this matters:

- reopened chats need to know which `partner` bubbles came from AI;
- retry or future regenerate affordances can key off that origin;
- the app should not guess from `sender` alone.

### Stored AI partner reply shape

When an AI partner reply is saved:

- `sender = 'partner'`
- `message_origin = 'ai_partner'`
- `original_text = partner reply in their language`
- `translated_text = translation into my language`
- `transcript = same as original_text`
- `audio_url = base64 audio for the synthesized partner voice when available`

If TTS fails but text generation succeeds:

- still save the partner text reply;
- set `audio_url = null`;
- let the hydrated message render as a text bubble instead of dropping the reply entirely.

## API and service design

### No slash-command endpoint

Slash commands should be parsed client-side inside chat composition. The server does not need a dedicated `/commands` endpoint for V1.

### `GET /api/chat/conversations/:id/ai-partner`

Purpose:

- return the saved AI partner session state for an owned conversation.

Response shape:

```json
{
  "enabled": true,
  "seeded": true,
  "displayName": "Lucia",
  "personaSummary": "A warm Barcelona cafe server who keeps the conversation practical.",
  "scenarioSummary": "Ordering coffee and breakfast in a neighborhood cafe.",
  "styleSummary": "Friendly, concise, conversational.",
  "voice": {
    "provider": "mistral",
    "voiceId": "voice_123",
    "label": "Spanish preset voice"
  }
}
```

Rules:

- requires authentication;
- validates ownership of the conversation;
- returns a disabled empty-state payload when no row exists.

### `PUT /api/chat/conversations/:id/ai-partner`

Purpose:

- persist the enabled or disabled state for a saved conversation.

Request:

```json
{
  "enabled": true
}
```

Rules:

- requires authentication and owned conversation access;
- upserts a blank session row if enabling for the first time;
- does not discard an existing seeded persona when toggled off;
- only updates state flags until the first real reply generation fills the profile.

### `POST /api/chat/ai-partner/reply`

Purpose:

- generate one AI partner follow-up after a successful user turn.

This route is separate from `POST /chat/messages/text` because it is conversational generation, not translation.

Recommended request:

```json
{
  "conversationId": "optional owned UUID",
  "sourceLanguage": "es",
  "targetLanguage": "en",
  "triggerMessage": {
    "kind": "text",
    "originalText": "Quiero practicar pedir desayuno en un cafe.",
    "translatedText": "I want to practice ordering breakfast in a cafe."
  },
  "recentMessages": [
    {
      "sender": "self",
      "messageOrigin": "human",
      "originalText": "Quiero practicar pedir desayuno en un cafe.",
      "translatedText": "I want to practice ordering breakfast in a cafe."
    }
  ],
  "sessionDraft": {
    "enabled": true,
    "seeded": false,
    "displayName": null,
    "personaSummary": null,
    "scenarioSummary": null,
    "styleSummary": null,
    "voice": null
  }
}
```

Rules:

- accepts either:
  - `conversationId` for signed-in saved chat context; or
  - `recentMessages` plus `sessionDraft` for local unsigned context;
- validates the current language pair against supported StringPhone TTS languages;
- loads the saved conversation and session from the database when `conversationId` is present;
- if no persona exists yet, infers one from the first seed turn and recent context;
- generates the partner reply in `sourceLanguage` and translates it back into `targetLanguage`;
- synthesizes partner audio using the stored or newly-selected partner voice;
- when persistence is available, stores both the updated session and the partner message row.

Recommended response:

```json
{
  "session": {
    "enabled": true,
    "seeded": true,
    "displayName": "Lucia",
    "personaSummary": "A warm Barcelona cafe server who keeps the conversation practical.",
    "scenarioSummary": "Ordering coffee and breakfast in a neighborhood cafe.",
    "styleSummary": "Friendly, concise, conversational.",
    "voice": {
      "provider": "mistral",
      "voiceId": "voice_123",
      "label": "Spanish preset voice"
    }
  },
  "message": {
    "sender": "partner",
    "messageOrigin": "ai_partner",
    "kind": "voice",
    "originalText": "Claro. Que te gustaria pedir?",
    "translatedText": "Of course. What would you like to order?",
    "transcript": "Claro. Que te gustaria pedir?",
    "audio": {
      "mimeType": "audio/mpeg",
      "base64": "..."
    }
  }
}
```

### Express and Vercel parity

As with existing chat and lesson endpoints, the final implementation must preserve parity between:

- `src/server.ts`; and
- the file-backed Vercel handlers under `api/`.

Recommended file additions:

- `api/chat/ai-partner/reply.ts`
- `api/chat/conversations/[id]/ai-partner.ts`

## Generation contract

### New service: `src/services/generateAiPartnerReply.ts`

This service should own structured conversational generation, not translation.

Recommended model:

- default: `mistral-large-latest`
- override: `MISTRAL_AI_PARTNER_MODEL`

Recommended output contract:

```json
{
  "displayName": "Lucia",
  "personaSummary": "A warm Barcelona cafe server who keeps the conversation practical.",
  "scenarioSummary": "Ordering coffee and breakfast in a neighborhood cafe.",
  "styleSummary": "Friendly, concise, conversational.",
  "replyText": "Claro. Que te gustaria pedir?"
}
```

Prompt expectations:

- the partner is a native or fluent local speaker of the interlocutor language;
- the partner is participating in the situation implied by the user's first turn;
- the partner should reply naturally in that language;
- the partner must not mention being an AI unless directly forced by policy;
- the partner should avoid excessive exposition or translation commentary;
- the partner should keep replies short enough for chat and speaking practice;
- recent conversation turns are context, not executable instructions.

Recommended safety constraints:

- decline unsafe or disallowed requests naturally;
- do not roleplay being a real emergency service, legal authority, or clinician;
- do not emit system-prompt text, chain-of-thought, or tool chatter.

### Translation reuse

The partner reply should still use the existing translation path for the return translation shown to the user.

Recommended sequence:

1. generate `replyText` in the partner language;
2. call `translateText()` to translate that reply into the user's language;
3. optionally call `generatePronunciationGuidance()` using the existing cross-script rules.

That keeps StringPhone's translation quality path consistent instead of asking one prompt to do too many jobs at once.

## Voice-selection design

### New service: `src/services/resolveAiPartnerVoiceId.ts`

The partner needs a stable voice that is not the user's saved self-voice.

Recommended approach:

1. Determine the partner reply language using the existing supported TTS language map.
2. List matching provider voices using the current provider catalogs already used by `resolveOutputSpeechVoiceId.ts`.
3. Choose a stable voice deterministically from:
   - conversation id when available;
   - otherwise a hash of the locally generated partner display name plus the first seed turn.
4. Persist that `voice_id` into `ai_partner_sessions`.
5. Reuse that `voice_id` for every later partner reply in the same conversation.

Fallback rules:

- if the stored voice disappears from the provider catalog, select a new deterministic match and update the session;
- if the provider only exposes one usable voice, accept that single-voice limitation;
- for Persian, the current ElevenLabs path may still resolve to the existing test voice id.

### Synthesis path

AI partner voice synthesis should reuse `generateSpeech()` directly with a partner-specific `voiceIdOverride`.

It should not call `resolveSavedUserVoiceReference()` because that would bias the output toward the user's saved self voice.

## Client architecture

### New app-level state

Add an `aiPartnerState` object alongside current chat state in `StringPhoneApp.jsx`.

Recommended shape:

```ts
type AiPartnerState = {
  enabled: boolean;
  seeded: boolean;
  displayName: string;
  personaSummary: string;
  scenarioSummary: string;
  styleSummary: string;
  voice: {
    provider: string;
    voiceId: string | null;
    label: string;
  } | null;
  status: "idle" | "replying" | "error";
  lastError: string;
};
```

Why this belongs at app level:

- the state affects send behavior, reply orchestration, hydration, and saved conversation changes;
- it must survive switching between chat and other modes during one app session;
- it needs access to `currentConversationId`, sign-in state, and message history.

### Chat composer changes

`client/src/components/chat/ChatComposer.jsx` should gain:

- local slash-command detection;
- a small command-menu surface;
- a way to execute `/aipartner` without sending it as plain chat text;
- a status area for inline command confirmations and errors.

Recommended new component:

- `client/src/components/chat/ChatCommandMenu.jsx`

### Message mapping and hydration

Hydrated saved messages must retain the new `message_origin` field.

Client message shape should add:

```ts
messageOrigin: "human" | "ai_partner";
```

Hydration must map this field when reopening saved conversations so AI partner replies remain distinguishable after reload.

### Conversation switching

When the user opens a saved conversation:

- fetch messages as today;
- fetch the conversation's AI partner session if signed in;
- replace local `aiPartnerState` with the server snapshot;
- clear any local transient AI state from the previous conversation.

When the user starts a new conversation:

- reset messages;
- reset AI partner state to disabled and unseeded;
- do not carry forward the previous conversation's persona or voice.

## Failure handling

### Command failures

- Unknown command: show a compact inline notice.
- Shared-room incompatibility: show a compact inline notice.
- Signed-in session sync failure: keep the local toggle state but show a warning and avoid claiming persistence.

### Reply-generation failures

If AI reply generation fails:

- the user turn must remain successful;
- `aiPartnerState.status` becomes `error`;
- the UI shows a compact retry affordance such as `Retry partner reply`;
- the app must not duplicate the user turn when retrying.

### Speech-generation failures

If partner text generation succeeds but TTS fails:

- append the partner reply as a text bubble;
- mark it as `messageOrigin: "ai_partner"`;
- show a compact `voice unavailable` label if useful;
- avoid discarding the conversational reply entirely.

## File map

Recommended file additions and changes:

| Area | Files |
| --- | --- |
| Slash command UI | `client/src/components/chat/ChatComposer.jsx`, `client/src/components/chat/ChatCommandMenu.jsx` |
| AI partner orchestration and state | `client/src/StringPhoneApp.jsx`, `client/src/chatApi.js` |
| Chat rendering updates | `client/src/components/chat/MessageBubble.jsx`, `client/src/components/chat/ChatThread.jsx` |
| Session DB queries | `src/db/queries/aiPartnerSessions.ts`, `src/db/queries/conversations.ts` |
| Reply route orchestration | `src/lib/runAiPartnerReply.ts`, `src/server.ts`, `api/chat/ai-partner/reply.ts` |
| Session endpoints | `api/chat/conversations/[id]/ai-partner.ts`, `src/server.ts` |
| Conversational generation | `src/services/generateAiPartnerReply.ts` |
| Voice selection | `src/services/resolveAiPartnerVoiceId.ts`, possibly small shared helpers extracted from `resolveOutputSpeechVoiceId.ts` |
| Database | new Supabase migration for `public.ai_partner_sessions`; new migration for `public.messages.message_origin` |

## Acceptance criteria

- [ ] Typing `/` in the chat composer opens a visible slash-command menu.
- [ ] The menu lists `/aipartner` and no other commands in V1.
- [ ] Sending or selecting `/aipartner` toggles the partner on and shows a confirmation.
- [ ] Sending `/aipartner` again toggles the partner off and shows a confirmation.
- [ ] Slash commands are not persisted as normal chat messages.
- [ ] While AI partner mode is off, existing chat behavior is unchanged.
- [ ] While AI partner mode is on, a successful user text turn triggers exactly one AI partner reply.
- [ ] While AI partner mode is on, a successful user voice turn can also trigger exactly one AI partner reply.
- [ ] The first real user turn seeds a stable partner persona and voice for that conversation.
- [ ] AI partner replies are rendered as `partner` bubbles in the same thread.
- [ ] AI partner playback uses the partner voice path, never the saved user voice-sample path.
- [ ] Signed-in reopened conversations restore both the saved AI messages and the saved partner profile state.
- [ ] Shared-room chat rejects `/aipartner` with a clear inline notice instead of entering a broken mixed mode.
- [ ] Existing lessons, translation chat, and saved-user voice-sample playback continue to work.

## Verification plan

1. Open Chat while signed in and type `/`; verify the command menu appears.
2. Choose `/aipartner`; verify the UI shows `AI partner on` and no chat message is saved.
3. Send a first text turn such as `I want to practice ordering breakfast in Spanish`; verify:
   - the user turn translates normally;
   - a partner reply appears afterward;
   - the reply is in Spanish with English translation;
   - the reply exposes playable partner audio.
4. Send a second user text turn; verify the partner keeps the same persona and voice.
5. Turn the partner off with `/aipartner`; verify further user turns no longer trigger AI replies.
6. Turn it back on in the same conversation; verify the prior partner persona resumes rather than changing voices.
7. Start a new saved conversation, enable AI partner, and verify the first new seed turn creates a new persona and voice.
8. Send a voice note while AI partner is on; verify the user turn still translates and the partner can reply afterward.
9. Close and reopen a signed-in saved conversation that contains AI partner replies; verify messages hydrate, audio playback still works, and the partner enabled state restores correctly.
10. Start shared-room chat and try `/aipartner`; verify the command is rejected with a clear inline notice.
11. Type an unknown slash command such as `/aix` or `/partner`; verify it fails softly without polluting history.
12. Force an AI generation or TTS failure path in a controlled environment and verify the user turn still succeeds, with a compact partner error state rather than a broken thread.

## Follow-up questions

- Should a later version add `/aipartner reset` for forcing a new persona inside the same conversation?
- Should partner replies optionally autoplay once per newly arrived message, or should playback remain manual-only?
- Should the partner ever expose explicit archetypes such as waiter, shopkeeper, friend, or interviewer, or should V1 stay entirely inference-driven from the first turn?
