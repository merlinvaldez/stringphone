import assert from "node:assert/strict";
import {
  CollectionRequestError,
  parseCollectionUpdateInput,
} from "../src/services/languageCollections.ts";

// 1. Missing or invalid body
for (const invalidBody of [null, undefined, "", 123, []]) {
  assert.throws(
    () => parseCollectionUpdateInput(invalidBody),
    (err) => err instanceof CollectionRequestError && err.status === 400,
  );
}

// 2. Missing entryId
for (const bodyWithoutEntryId of [
  {},
  { entryId: "" },
  { entryId: "   " },
  { id: "" },
  { id: "   " },
]) {
  assert.throws(
    () =>
      parseCollectionUpdateInput({
        ...bodyWithoutEntryId,
        phraseText: "Hola",
        meaningText: "Hello",
        targetLanguageCode: "es",
        sourceLanguageCode: "en",
      }),
    (err) =>
      err instanceof CollectionRequestError &&
      err.status === 400 &&
      /entry id/i.test(err.message),
  );
}

// 3. Missing or empty phraseText
for (const phraseText of ["", "   ", null, undefined, 42]) {
  assert.throws(
    () =>
      parseCollectionUpdateInput({
        entryId: "entry-1",
        phraseText,
        meaningText: "Hello",
        targetLanguageCode: "es",
        sourceLanguageCode: "en",
      }),
    (err) =>
      err instanceof CollectionRequestError &&
      err.status === 400 &&
      /phrase/i.test(err.message),
  );
}

// 4. Missing or empty meaningText (Postgres meaning_text is NOT NULL)
for (const meaningText of ["", "   ", null, undefined, 42]) {
  assert.throws(
    () =>
      parseCollectionUpdateInput({
        entryId: "entry-1",
        phraseText: "Hola",
        meaningText,
        targetLanguageCode: "es",
        sourceLanguageCode: "en",
      }),
    (err) =>
      err instanceof CollectionRequestError &&
      err.status === 400 &&
      /meaning/i.test(err.message),
  );
}

// 5. Unsupported target language code
for (const targetLanguageCode of ["", "   ", "invalid-lang", null, undefined]) {
  assert.throws(
    () =>
      parseCollectionUpdateInput({
        entryId: "entry-1",
        phraseText: "Hola",
        meaningText: "Hello",
        targetLanguageCode,
        sourceLanguageCode: "en",
      }),
    (err) =>
      err instanceof CollectionRequestError &&
      err.status === 400 &&
      /target|collection/i.test(err.message),
  );
}

// 6. Unsupported source language code
for (const sourceLanguageCode of ["", "   ", "invalid-lang", null, undefined]) {
  assert.throws(
    () =>
      parseCollectionUpdateInput({
        entryId: "entry-1",
        phraseText: "Hola",
        meaningText: "Hello",
        targetLanguageCode: "es",
        sourceLanguageCode,
      }),
    (err) =>
      err instanceof CollectionRequestError &&
      err.status === 400 &&
      /source/i.test(err.message),
  );
}

// 7. Full normalization with trimmed fields and language name / code aliases
const normalizedFull = parseCollectionUpdateInput({
  entryId: "  entry-uuid-1234  ",
  phraseText: "  Buenos días  ",
  phrasePronunciation: "  bwenos deeas  ",
  meaningText: "  Good morning  ",
  meaningPronunciation: "  gʊd ˈmɔːrnɪŋ  ",
  noteText: "  Common morning greeting  ",
  targetLanguageCode: " Spanish ",
  sourceLanguageCode: " English ",
});

assert.equal(normalizedFull.entryId, "entry-uuid-1234");
assert.equal(normalizedFull.phraseText, "Buenos días");
assert.equal(normalizedFull.phrasePronunciation, "bwenos deeas");
assert.equal(normalizedFull.meaningText, "Good morning");
assert.equal(normalizedFull.meaningPronunciation, "gʊd ˈmɔːrnɪŋ");
assert.equal(normalizedFull.noteText, "Common morning greeting");
assert.equal(normalizedFull.targetLanguageCode, "es");
assert.equal(normalizedFull.sourceLanguageCode, "en");

// 8. Normalization with fallback aliases (id, languageCode) and optional fields omitted
const normalizedMinimal = parseCollectionUpdateInput({
  id: "  entry-uuid-5678  ",
  phraseText: "Merci",
  meaningText: "Thank you",
  languageCode: "fr",
  sourceLanguageCode: "en",
});

assert.equal(normalizedMinimal.entryId, "entry-uuid-5678");
assert.equal(normalizedMinimal.phraseText, "Merci");
assert.equal(normalizedMinimal.meaningText, "Thank you");
assert.equal(normalizedMinimal.phrasePronunciation, "");
assert.equal(normalizedMinimal.meaningPronunciation, "");
assert.equal(normalizedMinimal.noteText, "");
assert.equal(normalizedMinimal.targetLanguageCode, "fr");
assert.equal(normalizedMinimal.sourceLanguageCode, "en");

console.log("Collection update validation tests passed.");
