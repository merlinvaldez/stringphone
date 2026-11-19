# Local Phrasebook

Step 7 adds a local learning library to the Phrasebook tab. Entries stay in the phone's existing SQLite history database; Phrasebook actions do not call an account collection or send saved content to the server.

## Saving and editing

Ready translated messages with source text have a **Save to Phrasebook** action in Chat, Single, and Conversation. Saving copies the source and translated text, language codes, and both pronunciation values into a Phrasebook entry. It also links any source or translated audio that is present and verified on disk. Repeating the action for the same message returns the existing entry rather than creating a duplicate.

**Add phrase** opens a manual form. Phrase text is required; translation and both pronunciation fields are optional. Entries can be edited later, including their language pair. The originating-message link is retained while that message exists. Deleting the conversation clears the link and keeps the saved text, translation, pronunciation, and Phrasebook audio links.

## Browsing and playback

Entries are grouped by source and translation language. Search checks phrase text, translation, and pronunciation using the local full-text index. Search input is treated literally. Results load in stable pages.

Existing source recordings and translated speech can play offline after they have been linked into the Phrasebook. If an entry has no saved audio for a side, **Play phrase** or **Play translation** generates speech through the existing speech endpoint and stores it locally. That first generation needs internet; later playback uses the saved file. Speech generation for a language unsupported by the configured endpoint reports the endpoint error without changing phrase text.

## Permanent deletion

**Delete phrase** asks for confirmation. It permanently removes only that Phrasebook entry. The originating message stays in history. Audio files are deleted only after no retained message or Phrasebook entry references them; a cleanup failure is reported and can be retried from the screen.

Conversation deletion uses the existing deletion service. It removes messages and clears Phrasebook source links while preserving copied Phrasebook fields and shared audio. This behavior is covered by the on-disk SQLite verification script.

## Checks

From the repository root:

```powershell
node --import tsx scripts/verify-mobile-phrasebook.mjs
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile run lint
```

On an Android phone, open **Phrasebook**, add a manual phrase, search its source/translation/pronunciation, edit it, and delete it after confirming the alert. In Chat, save a translated message, confirm its action changes to **Saved to Phrasebook**, then open Phrasebook and play both sides. Restart the app and confirm the entry remains. Delete the source conversation and verify the Phrasebook entry still opens. Try one saved audio clip in airplane mode; a phrase with no saved audio should show a clear speech-generation error until the network returns.
