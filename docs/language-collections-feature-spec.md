# StringPhone phrasebook

**Status:** Implemented on `feat/10-language-collections` for issue [#10](https://github.com/merlinvaldez/stringphone/issues/10) on August 3, 2026.  
**Product:** StringPhone  
**Audience:** people using StringPhone to save useful words and phrases from chats and lessons, then revisit them by language without leaving the product's existing learning flow.

## Outcome

StringPhone adds **Phrasebook** as a second learning surface beside Lessons. The feature keeps the current graduation-cap entry point, but reframes it as **Learning** and lets the user switch between lesson generation and saved phrasebook browsing.

The feature is deliberately lightweight. It is not a flashcard engine, spaced-repetition system, public phrasebook, or notes product. Its job is to let the user quickly keep language they want to reuse.

## Product decisions

| Requirement | StringPhone decision | Why |
| --- | --- | --- |
| Phrasebook lives under learning | Keep the current fourth mode slot, but rename the surface from **Lessons** to **Learning** | The app keeps one learning destination instead of adding a fifth primary mode |
| Phrasebook is stored by language | Persist one user-owned collection per target language, with entries nested inside it | The organization model stays obvious and matches how people review saved phrases |
| Save from any message | A ready chat message can be saved directly into the correct phrasebook from the bubble itself | The feature should start from the actual StringPhone conversation, not a separate workspace |
| Save from lessons | Key word cards in lessons carry the same compact phrasebook save affordance | Useful lesson vocabulary should not need to be retyped |
| Add from the phrasebook itself | The phrasebook browser includes a lightweight add-entry flow that translates a single input into the selected target language | Users should be able to start or extend a phrasebook even when they are not in chat |
| Searchable phrasebook | Search works at both the language-group level and inside a single language collection | Users need retrieval, not just storage |
| Alphabetical language ordering | Phrasebook groups are ordered by visible language name using the stable English display name already present in the app's language registry | Cross-script sorting stays predictable |
| Symbol/icon-first UI | Reuse icon toggles, compact buttons, flag markers, and the existing three-dot archive pattern instead of adding text-heavy controls | The feature should feel native to StringPhone rather than bolted on |
| Pronunciation playback | Saved cards reuse the compact TTS playback button pattern already used in chat | Phrasebook cards should preserve the same listen-and-repeat workflow as message playback |
| Return state | Signed-in users reopen the app where they last were, while tapping the StringPhone brand returns them to home | Learning and chat stay persistent without losing a reliable home action |

## User experience

### Learning entry point

1. The current top-level graduation-cap mode remains in place, but its visible label becomes **Learning**.
2. Opening Learning lands on the last-used learning subview:
   - `GraduationCap`: Lessons
   - `BookMarked`: Phrasebook
3. The Learning screen shows an icon-first segmented control near the top of the content surface for switching between those two subviews.
4. The control is visually icon-first and still exposes `aria-label`, `title`, `aria-selected`, and tab semantics.

### History drawer

1. The History drawer expands from two saved-content tabs to three:
   - `MessageSquare`: chats
   - `GraduationCap`: lessons
   - `BookMarked`: phrasebook
2. When the user opens History from the Learning surface, the drawer defaults to the active learning subview.
3. Phrasebook rows are grouped by language rather than by individual entry.
4. Language rows are sorted alphabetically from A to Z by the language's English display name while still showing the existing flag treatment.

### Phrasebook browser

The root Phrasebook view is a language-group browser, not a flat infinite list of saved phrases.

Each language row contains:

- the language flag
- the visible language name
- a compact entry count
- a chevron/open affordance

The root view includes:

- a `Search` field for filtering languages and saved content
- a `Plus` action for manually adding a phrasebook card
- empty-state guidance that remains minimal and icon-led

When the query is empty, the language rows remain strictly alphabetical. When the query is present, matching language groups remain alphabetical, and each group may show one or more matching previews.

### Phrasebook detail view

Selecting a language row opens that language's collection detail view.

The detail view includes:

- back navigation to the language-group browser
- the selected language flag and label
- a local search field for entries in that language
- a `Plus` action for adding a new entry directly into that language

Each saved entry card contains:

- the saved target-language phrase
- optional pronunciation text when available
- the paired meaning/translation line
- a compact playback button for the saved phrase
- the existing three-dot archive/delete affordance that soft-deletes the card

Selecting a saved card opens a focused card viewer that:

- takes over most of the screen
- closes with an `X` icon
- swipes left and right through neighboring cards
- includes previous and random-card icon actions

Each saved entry card reuses the existing compact speaker-button pattern for playback when TTS is supported for that saved phrase language.

## Saving from messages

### Save affordance

StringPhone should not add a large text button to every message bubble.

Instead:

1. A ready message bubble shows a compact bookmark-style icon button with an accessible label such as **Save to phrasebook**.
2. Saving succeeds inline and confirms with the existing spinner/check state.
3. If the user is signed out, the same action routes through the existing sign-in requirement flow instead of silently failing.

### What gets saved

The collection entry stores the phrase the user is most likely trying to learn, plus its paired meaning.

- For outgoing messages, save the translated/practice-language line as the collection phrase and the original/home-language line as the meaning.
- For incoming messages, save the original foreign-language line as the collection phrase and the translated/home-language line as the meaning.
- For voice messages, save the text content shown in the bubble rather than raw audio.
- When pronunciation guidance already exists on the saved line, persist it with the collection entry.

This rule keeps collections language-centered and avoids saving the wrong side of the bubble.

### De-duplication

Repeatedly saving the same phrase should not create noisy duplicates.

For the initial release:

- treat a normalized `(user, language_code, phrase_text, meaning_text)` match as the same active entry;
- return the existing entry when the user saves a duplicate from chat; and
- show the same saved confirmation state rather than an error.

## Saving from lessons

Lesson vocabulary cards should also save directly into the phrasebook.

1. Cards inside the **Key words** lesson section expose the same compact phrasebook save button used in chat.
2. Saving a lesson keyword stores the lesson target-language term as the phrase and the paired translation as the meaning.
3. The save action should not replace the existing pronunciation playback button on the card.
4. Signed-out users are routed through the existing sign-in requirement flow.

## Adding from the phrasebook

The phrasebook feature must not depend entirely on chat or lesson capture.

### Manual add flow

1. The root Phrasebook view exposes a `Plus` action.
2. If launched from the root browser, the add flow starts with language selection.
3. If launched from a language detail view, the selected language is prefilled and locked.
4. The entry composer stays compact and includes:
   - one source-language input for the word or phrase the user wants to remember
5. Saving translates that input into the selected target language using the same translation path used in chat.
6. After save succeeds, the new card opens directly in the focused card viewer.
7. The primary save action remains compact and icon-first.

Manual add creates the language collection on demand if that user does not already have one for the selected language.

## Search behavior

### Root collection search

The top-level collection search should match against:

- language name
- saved phrase text
- saved meaning/translation
- pronunciation
- note

The root result stays grouped by language so search does not destroy the feature's organization model.

### In-language search

Inside a specific language collection, search filters only entries from that language and returns them in-place without navigating away.

### Search implementation target

Initial rollout can use case-insensitive substring matching over normalized text columns. Full-text ranking can wait unless collection volume proves that the simple query is insufficient.

## Data model

### `public.language_collections`

One row per `(user_id, language_code)`.

| Field | Purpose |
| --- | --- |
| `id`, `user_id`, `created_at`, `updated_at` | ownership and ordering metadata |
| `language_code` | collection language |
| `language_name` | stable visible display label used for response payloads |
| `language_sort_name` | stable A-Z ordering key, initially the English display name |
| `archived_at` | future-safe soft archive field |

Unique constraint: `(user_id, language_code)` where `archived_at is null`.

### `public.language_collection_entries`

One row per saved phrase.

| Field | Purpose |
| --- | --- |
| `id`, `collection_id`, `user_id`, `created_at`, `updated_at` | ownership and ordering metadata |
| `source_type` | `message` or `manual` |
| `phrase_text` | required target-language text shown in the collection |
| `phrase_pronunciation` | optional pronunciation/transliteration |
| `meaning_text` | required paired meaning/home-language line |
| `meaning_pronunciation` | optional, future-safe companion field |
| `note_text` | optional user note |
| `source_language_code` | language of the meaning text |
| `target_language_code` | language of the saved phrase |
| `source_conversation_id` | optional saved-conversation link when one exists |
| `source_message_kind` | `text` or `voice` when saved from chat |
| `source_message_sender` | `self` or `partner` for future filtering |
| `source_snapshot` | compact JSON snapshot of the saved message pair so unsaved chats do not break collection rendering |
| `archived_at` | future-safe soft archive field |

The feature should persist a snapshot of the saved content even when the message came from an unsaved or shared-chat context. The collection must not depend on a conversation row continuing to exist.

## API shape

### `GET /api/collections`

Returns the authenticated user's collection groups in alphabetical order.

Optional query params:

```txt
q=...
```

Response includes grouped summaries:

```json
[
  {
    "languageCode": "fr",
    "languageName": "French",
    "languageSortName": "French",
    "entryCount": 12,
    "previewEntries": [
      {
        "id": "entry-1",
        "phraseText": "Bonjour",
        "meaningText": "Hello"
      }
    ]
  }
]
```

### `GET /api/collections/:languageCode`

Returns one language collection plus its entries.

Optional query params:

```txt
q=...
```

Entries are returned newest-first within the selected language.

### `POST /api/collections/entries`

Accepts both message-derived and manual entries.

Message-derived payload:

```json
{
  "sourceType": "message",
  "languageCode": "fr",
  "phraseText": "Bonjour",
  "phrasePronunciation": "",
  "meaningText": "Hello",
  "sourceConversationId": "optional-uuid",
  "sourceMessageKind": "text",
  "sourceMessageSender": "partner",
  "sourceSnapshot": {
    "originalText": "Bonjour",
    "translatedText": "Hello"
  }
}
```

Manual payload:

```json
{
  "sourceType": "manual",
  "languageCode": "fr",
  "phraseText": "Bonjour",
  "phrasePronunciation": "",
  "meaningText": "Hello",
  "noteText": "Morning greeting"
}
```

Rules:

- authentication required
- language code must be supported by StringPhone
- phrase and meaning are required
- duplicate saves return the existing active entry instead of failing

### `DELETE /api/collections/entries?entryId=...`

Archives one collection entry for the authenticated user.

## Proposed implementation map

| Area | Files |
| --- | --- |
| Learning-mode rename and subview state | `client/src/StringPhoneApp.jsx` |
| Learning wrapper and collection UI | `client/src/components/learning/LearningScreen.jsx`, `client/src/components/learning/CollectionScreen.jsx` |
| Existing lesson UI integration | `client/src/components/lessons/LessonScreen.jsx` |
| History drawer collections tab | `client/src/components/chat/ChatHistorySidebar.jsx` |
| Message save affordance | `client/src/components/chat/MessageBubble.jsx` |
| Return-to-last-location and brand-home behavior | `client/src/StringPhoneApp.jsx`, `client/src/authReturnState.js`, `client/src/lastViewState.js` |
| Client API | `client/src/chatApi.js` |
| Collection routes | `api/collections/index.ts`, `api/collections/[languageCode].ts`, `api/collections/entries.ts` |
| DB queries | `src/db/queries/languageCollections.ts` |
| Database | `supabase/migrations/<timestamp>_create_language_collections.sql` |

## Acceptance criteria

- [ ] The current graduation-cap mode becomes Learning rather than a lessons-only destination.
- [ ] Learning can toggle between Lessons and Phrasebook without leaving the mode.
- [ ] History exposes icon-first tabs for chats, lessons, and collections.
- [ ] Phrasebook groups are ordered alphabetically by language.
- [ ] Tapping a ready chat message exposes a compact save-to-collection action.
- [ ] Tapping a lesson keyword card exposes a compact save-to-phrasebook action without removing playback.
- [ ] Saving an outgoing message stores the translated/practice-language line as the collection phrase.
- [ ] Saving an incoming message stores the original foreign-language line as the collection phrase.
- [ ] Voice-message saves capture the displayed text pair rather than raw audio blobs.
- [ ] A signed-out save attempt routes through sign-in rather than failing silently.
- [ ] A user can add a manual entry from the root Collections view.
- [ ] A user can add a manual entry from inside a specific language collection.
- [ ] Manual phrasebook add uses a single input and translates into the selected target language before save.
- [ ] Saving a new manual card opens it directly in the focused card viewer.
- [ ] Root collection search can find a phrase by language name, phrase text, meaning, or note.
- [ ] In-language search filters entries without leaving that collection.
- [ ] Saving the same phrase twice reuses the existing entry instead of creating duplicates.
- [ ] Collection cards expose compact pronunciation playback using the existing chat-style TTS control.
- [ ] A user can archive a saved collection card from the collection detail view.
- [ ] A user can tap a phrasebook card to open a focused viewer, close it with `X`, swipe between cards, and jump to a random card.
- [ ] A signed-in user who reopens the app returns to the last active chat or learning screen instead of always landing on home.
- [ ] Tapping the StringPhone brand returns the user to home.

## Out of scope for this release

- spaced repetition or quizzes
- bulk import/export
- shared or public collections
- collection folders beyond the language grouping
- auto-saving every message without user intent
- lesson-to-collection auto-sync without an explicit save action

## Open questions

- Should collection search live entirely on the server from the first release, or is client-side filtering acceptable until the collection size proves otherwise?
