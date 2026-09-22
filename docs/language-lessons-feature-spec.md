# StringPhone language lessons

**Status:** Lesson generation and persistence remain implemented in the repository, but the current client hides the lesson builder and lesson-history tab (verified 2026-09-22). Phrasebook is the visible learning surface.
**Product:** StringPhone  
**Audience:** people using StringPhone to communicate across two languages who want a short, practical way to reinforce a situation or recent exchange.

## Outcome

StringPhone adds a focused Lessons mode that turns either the current chat or a learner's requested topic into a three-minute practice card. The lesson is saved to the authenticated learner's history so they can revisit it without re-sending or re-generating a chat.

The feature deliberately complements StringPhone's translation-first chat. It does not try to become a linear course, streak system, camera tool, or pronunciation scorer. Because the current `LearningScreen` sets `SHOW_LESSON_BUILDING = false` and the history drawer sets `SHOW_LESSON_HISTORY = false`, this feature is currently dormant in the active UI even though its API, database, and rendering code remain available.

## Research grounding: Google Little Language Lessons

### Observed evidence

Google frames Little Language Lessons as a set of bite-sized experiments for putting language practice into everyday moments, rather than replacing conventional study. Its three patterns are a context-specific Tiny Lesson, a staged conversational Slang Hang, and an object-labelling Word Cam. [Google product blog](https://blog.google/products-and-platforms/products/education/little-language-lessons/)

The Tiny Lesson input is a specific situation such as directions or a lost passport, and its output emphasizes useful vocabulary, phrases, and grammar tips. Google describes its structured vocabulary/phrases output and separately-generated grammar guidance. [Google Developers case study](https://developers.googleblog.com/en/how-its-made-little-language-lessons-to-personalize-learning/)

The Slang Hang design reveals dialogue one turn at a time and lets learners translate a message; Google also cautions that model-generated slang can be inaccurate or fabricated. [Google Developers case study](https://developers.googleblog.com/en/how-its-made-little-language-lessons-to-personalize-learning/)

The public Labs page was not server-rendered in the research tool, so exact current visual tokens and every interaction state were not treated as requirements. A visual scan of public screenshots showed a deliberately minimal input, prominent generate action, and compact content sections/tabs; that informed hierarchy only.

### Product moves derived for StringPhone

| Reference signal | StringPhone decision | Why |
| --- | --- | --- |
| Start with a real situation | Offer **New topic** and **This chat** sources | The current exchange is the product's strongest contextual input. |
| Keep a lesson bite-sized | Cap output at four vocabulary items and three phrases | The learner should finish a lesson in one short sitting. |
| Separate content types | Show Key words, Say it naturally, Quick tip, and Try it as discrete cards | The structure is skimmable on a phone and supports return visits. |
| Avoid overclaiming model accuracy | Do not generate a dedicated slang mode or score learner free text | This limits invented cultural claims and false assessment. |
| Make language practice a useful interruption, not a new destination | Keep the lesson picker beside existing chat modes and histories | It stays adjacent to, rather than disruptive of, the chat workflow. |

## User experience

### Entry points

1. The current top-level learning slot is labeled **Phrasebook** and opens the authenticated collection browser.
2. The lesson builder is retained in `LessonScreen.jsx`, but `LearningScreen.jsx` currently forces the visible learning view to Phrasebook.
3. The History drawer currently exposes chat and Phrasebook tabs; the lesson tab is disabled by `SHOW_LESSON_HISTORY = false`.
4. The lesson API and saved lesson schema remain available for a future re-exposure of this UI.

All icon-only controls retain `aria-label`, `title`, `aria-selected`, and tab semantics.

### Cross-script phonetic guidance

StringPhone now treats phonetic spelling as a script-support affordance, not as a second translation layer.

- In chat, only the line written in a script different from the viewer's own language gets a phonetic guide.
- The guide is rendered in parentheses and uses the viewer's writing system rather than IPA by default.
- Same-script pairs such as English-Spanish or Hindi-Marathi do not show an extra phonetic line.
- Cross-script lesson content follows the same rule for target-language strings.

### Output-language text-to-speech playback

StringPhone now exposes on-demand playback for generated lesson text and typed chat output without changing the voice-note flow.

- In chat, the foreign-language line in a text bubble gets a speaker control:
  - outgoing text message: the translated practice-language line;
  - incoming shared-chat text message: the original foreign-language line.
- In lessons, the target-language title, vocabulary terms, vocabulary examples, phrases, and revealed sample answer each get their own speaker control.
- Playback is manual and ephemeral. Audio is generated on demand, cached in the current client session, and not written into lesson history rows.
- Saved chat hydration restores each message's language metadata, so the in-chat speaker control stays clickable after reopening history.
- `POST /api/speech/output` generates ephemeral `audio/wav` playback through OpenAI's TTS API. The request may select the configured `marin` or `onyx` voice, and no voice sample is persisted or cloned.
- Saved lesson rows in History use the target-language flag as their visual marker instead of a generic lesson icon.

### Lesson builder

The builder uses the currently selected language pair:

- **Home language:** current `myLang`; used for translations and explanations.
- **Practice language:** current `theirLang`; used for the terms, phrases, examples, and sample answer.

The learner selects one source:

- **New topic:** enters a practical intent such as “ordering breakfast at a café.”
- **This chat:** uses the most recent twelve ready chat messages. It requires at least one message.

The dormant builder's primary action is **Create lesson**. It is disabled for an empty chat source, shows an in-button loading state, and returns an actionable error when validation or generation fails. The active client requires sign-in for chat-derived lesson history; the backend also retains a guest lesson-generation path for unsaved results, but that path is not currently linked from the visible UI.

### Generated lesson

Every persisted lesson contains:

1. a target-language lesson title, a short home-language history label, one-sentence summary, and normalized topic;
2. up to four target-language vocabulary cards, each with a concise translation, example, and cross-script phonetic spelling when the learner needs one;
3. two or three natural phrases with a short use note and cross-script phonetic spelling when needed;
4. one quick usage or grammar tip;
5. one open Try it prompt with a revealable sample answer, including cross-script phonetic spelling when needed; and
6. a **New lesson** action to return to the builder.

The initial release intentionally does not include answer grading, progress scoring, editing, deletion, or a raw transcript viewer. These are follow-on decisions, not silent omissions.

## Data, privacy, and generation

### Lesson record

`public.lessons` is introduced by `supabase/migrations/20260728093000_create_lessons.sql`.

| Field | Purpose |
| --- | --- |
| `id`, `user_id`, `created_at` | user-owned saved-history identity and ordering |
| `source` | `chat` or `topic` creation provenance |
| `source_conversation_id` | optional link to the owned StringPhone conversation; null for unsaved or shared-chat context |
| `topic`, `source_language`, `target_language` | compact learner context for history and rendering |
| `content` | structured generated lesson JSON |

The history API returns structured lesson content so a prior lesson can open without another model call. The raw input transcript is not stored in the lesson row. A chat-derived lesson keeps only the generated lesson plus its optional conversation reference.

### Generation contract

`src/services/generateLanguageLesson.ts` calls the configured OpenAI Responses API model with JSON-object output and validates it before persistence. `OPENAI_LESSON_MODEL` can override the shared translation model for an intentional rollout change. The call limits output to 1100 tokens and keeps the generation focused because this is a short schema-constrained task. The contract requires compact strings, a short home-language history label, at least two vocabulary items, at least one phrase, one tip, and a sample answer. It constrains topic and message lengths, passes only the latest twelve eligible messages, and tells the model to treat chat context as reference text rather than instructions. When the learner's home language and practice language use different writing systems, the generation contract also requires phonetic spellings for the lesson title, vocabulary terms, examples, phrases, and sample answer in the learner's own writing system; otherwise those transliteration fields remain blank. An OpenAI request failure, blank response, invalid JSON, or incomplete lesson is logged server-side and returned to the client as a safe retryable error instead of being persisted.

`src/services/generatePronunciationGuidance.ts` applies the same cross-script rule to live chat bubbles. Pronunciation lines are only generated when the displayed text uses a different writing system than the reader's language, and the UI renders the result in parentheses under the foreign-script line only.

For chat lessons, the model is instructed not to repeat names, phone numbers, addresses, or other personal details. This is a reduction measure, not a guarantee that model output is free from all sensitive inference; users should not treat a generated lesson as a secure transcript export.

## API and ownership rules

### `GET /api/lessons`

Returns the authenticated user's lessons in reverse chronological order.

### `POST /api/lessons`

Accepts:

```json
{
  "source": "chat | topic",
  "topic": "required for topic lessons",
  "sourceLanguage": "en",
  "targetLanguage": "fr",
  "conversationId": "optional owned conversation UUID",
  "messages": [{ "originalText": "...", "translatedText": "..." }]
}
```

The route requires StringPhone authentication, validates both language codes, requires a topic or messages as appropriate, verifies ownership for a supplied conversation ID, generates structured content, and persists the result. It never accepts a lesson owner ID from the client.

### `POST /api/speech/output`

Accepts:

```json
{
  "text": "target-language text to speak",
  "language": "fr",
  "speechVoice": "marin | onyx"
}
```

The route is guest-accessible because it only generates ephemeral playback audio for already-visible UI text. It validates the requested language against the existing supported speech list, enforces a short text-length cap, and returns `audio/wav` bytes generated by OpenAI's TTS API. It does not persist audio.

## Implemented file map

| Area | Files |
| --- | --- |
| Lesson UI | `client/src/components/lessons/LessonScreen.jsx` |
| On-demand text playback UI | `client/src/components/audio/TextToSpeechButton.jsx`, `client/src/components/chat/MessageBubble.jsx`, `client/src/components/lessons/LessonScreen.jsx` |
| History toggle and saved-lesson list | `client/src/components/chat/ChatHistorySidebar.jsx` |
| Mode icon, state, and lesson orchestration | `client/src/StringPhoneApp.jsx` |
| Client API | `client/src/chatApi.js` |
| Lesson server route and persistence | `api/lessons/index.ts`, `src/db/queries/lessons.ts` |
| Output speech route and orchestration | `api/speech/output.ts`, `src/lib/runOutputTextToSpeech.ts`, `src/services/generateOpenAiSpeech.ts`, `src/server.ts` |
| Structured generation | `src/services/generateLanguageLesson.ts`, `src/services/generatePronunciationGuidance.ts` |
| Script-awareness | `src/lib/languages.ts` |
| Database | `supabase/migrations/20260728093000_create_lessons.sql` |

## Acceptance and verification plan

### Product acceptance

- [x] History replaces the former “Chat History” heading.
- [x] The History switch is visually icon-only and exposes accessible text through labels/tooltips.
- [x] Chat history and lesson history display independently.
- [x] Lessons is the fourth top-level mode, after Conversation.
- [x] A learner can create a topic-based lesson.
- [x] A learner can create a lesson from the latest current-chat messages.
- [x] A saved lesson can be selected from history and re-opened without generation.
- [x] The lesson builder includes a clear New lesson path.
- [x] The lesson builder and saved-lesson view both keep direct access to the History side panel.
- [x] Lesson rows in History are labeled in the learner's language instead of the target-language lesson title.
- [x] Entering Lessons from chat opens the latest lesson tied to the current saved conversation, or the builder when none exists.
- [x] Cross-script chat text shows one parenthesized phonetic guide in the viewer's writing system, only on the unfamiliar-script line.
- [x] Cross-script lesson content shows phonetic spellings for target-language title, key words, examples, phrases, and sample answer.
- [x] Text chat exposes output-language playback from the bubble itself.
- [x] Saved lesson content exposes target-language playback for title, vocabulary, examples, phrases, and sample answer.
- [x] Reopened saved chats keep the text-message speaker control clickable because message language metadata is restored during hydration.
- [x] Lesson and chat playback use the selected OpenAI TTS voice.
- [x] Saved lesson rows in History show the target-language flag instead of a generic lesson icon.

### Required deployment checks

1. Apply the new Supabase migration before or with the API deployment.
2. Sign in, send at least one chat message, open the graduation-cap mode, choose **This chat**, and create a lesson.
3. Return to the History drawer, select the lesson icon, and verify the generated title appears and re-opens.
4. While viewing both the lesson builder and a saved lesson, use the History trigger and verify the side panel opens without leaving lesson mode.
5. Verify the saved lesson row title is shown in the learner's language rather than the target-language lesson title.
6. Create a second lesson through **New topic** and verify it uses the current language pair.
7. Exercise an unauthenticated lesson creation attempt and verify it prompts for sign-in rather than leaking a lesson or writing a row.
8. Test an outgoing message in a cross-script pair, such as English to Persian, and verify the translated line shows a parenthesized phonetic guide in the sender's own writing system.
9. Test an incoming message in the same pair and verify the original foreign-script line, not the translated home-language line, shows the phonetic guide.
10. Click the speaker control on an outgoing typed chat message and verify it generates and plays the practice-language audio locally.
11. Open a saved lesson, play the title, a vocabulary item, a phrase, and the revealed sample answer, and verify each uses the target language rather than the home-language explanation text.
12. Open saved conversation A, create a lesson from chat, switch back to chat, open saved conversation B with no lesson, tap the top lesson icon, and verify the builder opens instead of conversation A's lesson.
13. Return to saved conversation A, tap the top lesson icon again, and verify the latest lesson tied to conversation A opens.
14. Create a lesson in a cross-script pair and verify the title, key words, examples, phrases, and sample answer show parenthesized phonetic spellings while same-script language pairs do not.
15. Reopen a saved conversation with typed messages, hover the speaker button in a text bubble, and verify it shows a normal actionable pointer state instead of a loading cursor and plays on click.
16. In an account with saved voice-message history, play lesson or typed-chat output and verify it uses the saved user-style voice; then test an account with no saved voice examples and verify playback still works with the provider default voice.

## Follow-up questions

- Should lesson history support archive/delete before wider usage produces clutter?
- Should typed chat and lesson playback expose an explicit saved voice or dialect preference instead of the current provider-default path?
- Should the learner be able to save a chat-derived lesson to a particular conversation after initially creating it from an unsaved chat?
- Do we want educator/linguist review for the generation prompt and an in-product accuracy-report affordance before adding slang or culture-specific content?
