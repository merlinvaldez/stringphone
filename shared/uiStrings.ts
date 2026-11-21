export const ENGLISH_UI_STRINGS = {
  searchLanguages: "Search languages",
  you: "You",
  partner: "Partner",
  shareInviteMessage:
    "Let's chat on StringPhone so that we can understand each other better.",
  listening: "Listening",
  liveTranslation: "Live translation",
  liveTranslationFallback: "Fallback translation — phrase-based updates",
  translating: "Translating",
  speaking: "Speaking",
  partnersTurn: "Partner's turn",
  tap: "Tap",
  speak: "Speak",
  listen: "Listen",
  messageIn: "Type message in {language}",
  translatingVoiceNote: "Translating voice note...",
  secondsLeft: "{seconds}s left",
  recordVoiceNote: "Record voice note",
  stopVoiceNote: "Stop voice note",
  invertLanguages: "Invert languages",
  sendTextMessage: "Send text message",
  playAudio: "Play audio",
  pauseAudio: "Pause audio",
  audioUnavailable: "Audio unavailable.",
  preparingAudio: "Preparing audio...",
  translationFailed: "Translation failed.",
  translatingShort: "Translating...",
  retry: "Retry",
  pending: "Pending",
  transcribing: "Transcribing",
  generatingAudio: "Generating audio",
  ready: "Ready",
  needsRetry: "Needs retry",
  connecting: "Connecting…",
  connectingMicrophone: "Connecting microphone…",
  stopRecording: "Stop recording",
  tapToSpeak: "Tap to speak",
  myLanguage: "My language",
  theirLanguage: "Their language",
  openHistory: "Open history",
  clearSearch: "Clear search",
  languagePickerHint: "Opens a searchable language list",
  noLanguagesFound: "No matching languages",
  startChatFirst: "Start a new chat first",
  openingHistory: "Opening local history…",
  loadOlderMessages: "Load older messages",
  retryStorageCleanup: "Retry storage cleanup",
  microphoneSettings: "Open microphone settings",
  voiceRecording: "Voice recording",
  original: "Original",
  translation: "Translation",
  playOriginalAudio: "Play original audio",
  stopOriginalAudio: "Stop original audio",
  playTranslatedAudio: "Play translated audio",
  stopTranslatedAudio: "Stop translated audio",
  saveToPhrasebook: "Save to Phrasebook",
  savedToPhrasebook: "Saved to Phrasebook",
  savingPhrase: "Saving phrase",
  returnHome: "Return home",
  stringPhoneModes: "StringPhone modes",
  modeChat: "Chat",
  modeLive: "Live",
  modeSingle: "Single",
  modeConversation: "Conversation",
  modePhrasebook: "Phrasebook",
  liveAutoPlayOn: "Auto-play translations on",
  liveAutoPlayOff: "Auto-play translations muted",
  liveListening: "Listening live",
  livePaused: "Live paused",
  voiceSettings: "Speech voice settings",
  speechVoice: "Speech voice",
  aiTtsVoice: "AI TTS voice",
  voiceClone: "Voice clone",
  female: "Female",
  male: "Male",
  clonedVoicesCleared: "Cloned voices cleared. Record 10s to clone again.",
  openChatForClones: "Open a chat to manage cloned voices.",
  clonedVoiceCountOne: "1 cloned voice in this chat.",
  clonedVoiceCountMany: "{count} cloned voices in this chat.",
  noClonedVoices: "No cloned voices in this chat yet.",
  clearClonedVoices: "Clear cloned voices",
  clearing: "Clearing...",
  history: "History",
  newConversation: "New Conversation",
  newChat: "New chat",
  singleSession: "Single session",
  twoWayConversation: "Two-way conversation",
  openPhrasebook: "Open phrasebook",
  searchHistory: "Search history",
  searchTitlesOrMessages: "Search titles or messages",
  searchPhrasebook: "Search phrasebook",
  noHistoryYet: "No history yet",
  noMatchingConversations: "No conversations match your search",
  noPhrasebookCardsYet: "No phrasebook cards yet",
  loadMoreConversations: "Load more conversations",
  closeHistory: "Close history",
  conversationActions: "Conversation actions",
  deleteLabel: "Delete",
  cardCountOne: "{count} card",
  cardCountMany: "{count} cards",
  phrasebookSubtitle: "Words and phrases you want to remember.",
  addPhrasebookCard: "Add phrasebook card",
  backToPhrasebook: "Back to phrasebook",
  searchLanguageCards: "Search {language}",
  noMatchingPhrasebookCards: "No phrasebook cards match your search.",
  noCardsInLanguageYet: "No cards in this language yet.",
  noMatchingCards: "No cards match your search.",
  newCard: "New card",
  wordOrPhrase: "Word or phrase",
  manualFields: "Manual fields",
  save: "Save",
  cancel: "Cancel",
  saving: "Saving...",
  editCard: "Edit card",
  deleteCard: "Delete card",
  cardActions: "Card actions",
  randomCard: "Random card",
  previousCard: "Previous card",
  nextCard: "Next card",
  tapCardToFlip: "Tap card to flip",
  editPhrase: "Edit phrase",
  addAPhrase: "Add a phrase",
  phraseEditorNote:
    "Phrase text is stored on this phone. Speech can be generated when you are online.",
  phraseLanguage: "Phrase language",
  translationLanguage: "Translation language",
  phrase: "Phrase",
  pronunciationOptional: "Pronunciation (optional)",
  translationOptional: "Translation (optional)",
  translationPronunciationOptional: "Translation pronunciation (optional)",
  savePhrase: "Save phrase",
  playPhrase: "Play phrase",
  playTranslation: "Play translation",
  addTranslationWhenEditing: "Add a translation when you edit this phrase.",
  close: "Close",
} as const;

export type UiStringKey = keyof typeof ENGLISH_UI_STRINGS;
export type UiStrings = Record<UiStringKey, string>;

export const UI_STRING_KEYS = Object.keys(
  ENGLISH_UI_STRINGS,
) as UiStringKey[];

export type UiStringLoaderOptions = {
  bundledCatalogs?: Record<string, Partial<Record<UiStringKey, string>>>;
  onFailure?: (language: string, error: unknown) => void;
};

export type UiStringLoader = ((language: string) => Promise<UiStrings>) & {
  getSync: (language: string) => UiStrings | null;
  isCached: (language: string) => boolean;
};

function normalizeUiLanguageCode(language: string): string {
  return (language || 'en').trim().toLowerCase() || 'en';
}

export function interpolateTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : placeholder,
  );
}

export function isCompleteUiStringCatalog(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  for (const key of UI_STRING_KEYS) {
    const value = record[key];
    if (typeof value !== 'string' || !value.trim()) {
      return false;
    }
    const placeholders = ENGLISH_UI_STRINGS[key].match(/\{\w+\}/g) ?? [];
    if (!placeholders.every(placeholder => value.includes(placeholder))) {
      return false;
    }
  }
  return true;
}

export function coerceUiStrings(payload: unknown): UiStrings {
  const strings = { ...ENGLISH_UI_STRINGS } as UiStrings;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return strings;

  for (const key of UI_STRING_KEYS) {
    const value = (payload as Record<string, unknown>)[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const placeholders = ENGLISH_UI_STRINGS[key].match(/\{\w+\}/g) ?? [];
    if (placeholders.every(placeholder => value.includes(placeholder))) {
      strings[key] = value.trim();
    }
  }
  return strings;
}

export function createUiStringLoader(
  requestStrings: (language: string) => Promise<unknown>,
  optionsOrOnFailure?: UiStringLoaderOptions | ((language: string, error: unknown) => void),
): UiStringLoader {
  const options: UiStringLoaderOptions =
    typeof optionsOrOnFailure === 'function'
      ? { onFailure: optionsOrOnFailure }
      : (optionsOrOnFailure ?? {});

  const cache = new Map<string, UiStrings>([['en', ENGLISH_UI_STRINGS]]);
  const partialBundled = new Map<string, UiStrings>();
  const inflight = new Map<string, Promise<UiStrings>>();

  if (options.bundledCatalogs) {
    for (const [rawCode, catalog] of Object.entries(options.bundledCatalogs)) {
      const code = normalizeUiLanguageCode(rawCode);
      if (code === 'en' || !catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
        continue;
      }
      const coerced = coerceUiStrings(catalog);
      if (isCompleteUiStringCatalog(catalog)) {
        cache.set(code, coerced);
      } else {
        partialBundled.set(code, coerced);
      }
    }
  }

  const loadUiStrings = function loadUiStrings(language: string): Promise<UiStrings> {
    const code = normalizeUiLanguageCode(language);
    const cached = cache.get(code);
    if (cached) return Promise.resolve(cached);

    const pending = inflight.get(code);
    if (pending) return pending;

    const request = Promise.resolve()
      .then(() => requestStrings(code))
      .then(payload => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Invalid UI translation catalog.');
        }
        const mergedPayload = partialBundled.has(code)
          ? { ...partialBundled.get(code), ...(payload as Record<string, unknown>) }
          : payload;
        const strings = coerceUiStrings(mergedPayload);
        cache.set(code, strings);
        return strings;
      })
      .catch(error => {
        options.onFailure?.(code, error);
        return partialBundled.get(code) ?? ENGLISH_UI_STRINGS;
      })
      .finally(() => inflight.delete(code));

    inflight.set(code, request);
    return request;
  } as UiStringLoader;

  loadUiStrings.getSync = (language: string): UiStrings | null => {
    const code = normalizeUiLanguageCode(language);
    return cache.get(code) ?? partialBundled.get(code) ?? null;
  };

  loadUiStrings.isCached = (language: string): boolean => {
    const code = normalizeUiLanguageCode(language);
    return cache.has(code);
  };

  return loadUiStrings;
}
