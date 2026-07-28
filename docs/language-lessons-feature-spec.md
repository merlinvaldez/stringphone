# StringPhone language lessons

**Status:** Implemented on `feat/6-language-lessons` for issue [#6](https://github.com/merlinvaldez/stringphone/issues/6) on 2026-07-28.  
**Product:** StringPhone  
**Audience:** people using StringPhone to communicate across two languages who want a short, practical way to reinforce a situation or recent exchange.

## Outcome

StringPhone adds a focused Lessons mode that turns either the current chat or a learner's requested topic into a three-minute practice card. The lesson is saved to the authenticated learner's history so they can revisit it without re-sending or re-generating a chat.

The feature deliberately complements StringPhone's translation-first chat. It does not try to become a linear course, streak system, camera tool, or pronunciation scorer.

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

1. The top app-mode segmented control now ends with a graduation-cap icon. It opens Lessons mode after the multi-person Conversation icon.
2. The chat history drawer is renamed **History**. An icon-only segmented control directly under that heading switches between chat history and lesson history:
   - message-square icon: chats
   - graduation-cap icon: lessons
3. The Lessons tab in History exposes **New lesson**.
4. An existing saved lesson opens from lesson history and preserves its generated content.

All icon-only controls retain `aria-label`, `title`, `aria-selected`, and tab semantics.

### Lesson builder

The builder uses the currently selected language pair:

- **Home language:** current `myLang`; used for translations and explanations.
- **Practice language:** current `theirLang`; used for the terms, phrases, examples, and sample answer.

The learner selects one source:

- **New topic:** enters a practical intent such as “ordering breakfast at a café.”
- **This chat:** uses the most recent twelve ready chat messages. It requires at least one message.

The primary action is **Create lesson**. It is disabled for an empty chat source, shows an in-button loading state, and returns an actionable error when authentication, validation, or generation fails. Creating a lesson requires sign-in because saved lesson history is a user-owned artifact.

### Generated lesson

Every persisted lesson contains:

1. a title, one-sentence summary, and normalized topic;
2. up to four target-language vocabulary cards, each with a concise translation, optional transliteration, and example;
3. two or three natural phrases with a short use note;
4. one quick usage or grammar tip;
5. one open Try it prompt with a revealable sample answer; and
6. a **New lesson** action to return to the builder.

The initial release intentionally does not include text-to-speech, answer grading, progress scoring, editing, deletion, or a raw transcript viewer. These are follow-on decisions, not silent omissions.

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

`src/services/generateLanguageLesson.ts` calls `mistral-medium-3-5` (Mistral Medium 3.5) with JSON-object output and validates it before persistence. `MISTRAL_LESSON_MODEL` can override that model for an intentional rollout change, but lesson generation no longer falls back to the translation model. The call limits output to 900 tokens, uses low-variance sampling, and disables extra reasoning because this is a short schema-constrained generation task. The contract requires compact strings, at least two vocabulary items, at least one phrase, one tip, and a sample answer. It constrains topic and message lengths, passes only the latest twelve eligible messages, and tells the model to treat chat context as reference text rather than instructions. A Mistral request failure, blank response, invalid JSON, or incomplete lesson is logged server-side and returned to the client as a safe retryable error instead of being persisted.

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

## Implemented file map

| Area | Files |
| --- | --- |
| Lesson UI | `client/src/components/lessons/LessonScreen.jsx` |
| History toggle and saved-lesson list | `client/src/components/chat/ChatHistorySidebar.jsx` |
| Mode icon, state, and lesson orchestration | `client/src/StringPhoneApp.jsx` |
| Client API | `client/src/chatApi.js` |
| Server route and persistence | `api/lessons/index.ts`, `src/db/queries/lessons.ts` |
| Structured generation | `src/services/generateLanguageLesson.ts` |
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

### Required deployment checks

1. Apply the new Supabase migration before or with the API deployment.
2. Sign in, send at least one chat message, open the graduation-cap mode, choose **This chat**, and create a lesson.
3. Return to the History drawer, select the lesson icon, and verify the generated title appears and re-opens.
4. Create a second lesson through **New topic** and verify it uses the current language pair.
5. Exercise an unauthenticated lesson creation attempt and verify it prompts for sign-in rather than leaking a lesson or writing a row.
6. Test a language using a non-Latin script and verify transliteration remains optional rather than duplicated as a translation.

## Follow-up questions

- Should lesson history support archive/delete before wider usage produces clutter?
- Should existing StringPhone speech generation power per-term playback, with an explicit dialect setting?
- Should the learner be able to save a chat-derived lesson to a particular conversation after initially creating it from an unsaved chat?
- Do we want educator/linguist review for the generation prompt and an in-product accuracy-report affordance before adding slang or culture-specific content?
