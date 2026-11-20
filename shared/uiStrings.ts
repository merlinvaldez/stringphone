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
} as const;

export type UiStringKey = keyof typeof ENGLISH_UI_STRINGS;
export type UiStrings = Record<UiStringKey, string>;

export const UI_STRING_KEYS = Object.keys(
  ENGLISH_UI_STRINGS,
) as UiStringKey[];

export function interpolateTemplate(template: string, variables: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : placeholder,
  );
}

export function coerceUiStrings(payload: unknown): UiStrings {
  const strings = { ...ENGLISH_UI_STRINGS } as UiStrings;
  if (!payload || typeof payload !== 'object') return strings;

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

export function createUiStringLoader(requestStrings: (language: string) => Promise<unknown>) {
  const cache = new Map<string, UiStrings>([['en', ENGLISH_UI_STRINGS]]);
  const inflight = new Map<string, Promise<UiStrings>>();

  return function loadUiStrings(language: string): Promise<UiStrings> {
    const cached = cache.get(language);
    if (cached) return Promise.resolve(cached);

    const pending = inflight.get(language);
    if (pending) return pending;

    const request = Promise.resolve()
      .then(() => requestStrings(language))
      .then(payload => {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          return ENGLISH_UI_STRINGS;
        }
        const strings = coerceUiStrings(payload);
        cache.set(language, strings);
        return strings;
      })
      .catch(() => ENGLISH_UI_STRINGS)
      .finally(() => inflight.delete(language));

    inflight.set(language, request);
    return request;
  };
}
