/**
 * Pure helpers for phrasebook validation, formatting, and flashcard viewer parity.
 */

/**
 * Validates and normalizes phrasebook card input for both guest (IndexedDB)
 * and signed-in (Postgres) persistence.
 *
 * @param {object} [input={}]
 * @param {string} [input.phraseText]
 * @param {string} [input.phrasePronunciation]
 * @param {string} [input.meaningText]
 * @param {string} [input.meaningPronunciation]
 * @param {string} [input.noteText]
 * @param {string} [input.targetLanguageCode]
 * @param {string} [input.sourceLanguageCode]
 * @param {object} [options={}]
 * @param {boolean} [options.requireMeaning=false] When true, rejects empty meaningText.
 * @returns {object} Normalized payload ready for localStore or server update.
 */
export function validatePhrasebookEditorInput(input = {}, { requireMeaning = false } = {}) {
  const phraseText = typeof input?.phraseText === 'string' ? input.phraseText.trim() : '';
  if (!phraseText) {
    throw new Error('Phrase text is required.');
  }

  const meaningText = typeof input?.meaningText === 'string' ? input.meaningText.trim() : '';
  if (requireMeaning && !meaningText) {
    throw new Error('Meaning is required.');
  }

  const rawTargetLang = typeof input?.targetLanguageCode === 'string' ? input.targetLanguageCode.trim() : '';
  const targetLanguageCode = (rawTargetLang || 'es').toLowerCase();

  const rawSourceLang = typeof input?.sourceLanguageCode === 'string' ? input.sourceLanguageCode.trim() : '';
  const sourceLanguageCode = (rawSourceLang || 'en').toLowerCase();

  const phrasePron = typeof input?.phrasePronunciation === 'string' ? input.phrasePronunciation.trim() : '';
  const phrasePronunciation = phrasePron ? phrasePron : null;

  const meaningPron = typeof input?.meaningPronunciation === 'string' ? input.meaningPronunciation.trim() : '';
  const meaningPronunciation = meaningPron ? meaningPron : null;

  const note = typeof input?.noteText === 'string' ? input.noteText.trim() : '';

  return {
    targetLanguageCode,
    sourceLanguageCode,
    phraseText,
    phrasePronunciation,
    meaningText,
    meaningPronunciation,
    noteText: note,
  };
}

/**
 * Calculates display properties for the back of a phrasebook flashcard,
 * gracefully handling entries that omit meaning / translation.
 *
 * @param {object} entry Phrasebook entry
 * @returns {{
 *   hasMeaning: boolean,
 *   meaningText: string,
 *   meaningPronunciation: string | null,
 *   noteText: string,
 *   canPlayMeaningAudio: boolean,
 *   flipPrompt: string
 * }}
 */
export function getFlashcardBackDisplay(entry) {
  const meaningText = typeof entry?.meaningText === 'string' ? entry.meaningText.trim() : '';
  const meaningPron = typeof entry?.meaningPronunciation === 'string' ? entry.meaningPronunciation.trim() : '';
  const noteText = typeof entry?.noteText === 'string' ? entry.noteText.trim() : '';
  const hasMeaning = Boolean(meaningText);

  return {
    hasMeaning,
    meaningText: hasMeaning ? meaningText : '',
    meaningPronunciation: hasMeaning && meaningPron ? meaningPron : null,
    noteText,
    canPlayMeaningAudio: hasMeaning,
    flipPrompt: 'Tap card to flip',
  };
}
