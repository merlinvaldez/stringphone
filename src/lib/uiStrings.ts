export const ENGLISH_UI_STRINGS = {
  searchLanguages: "Search languages",
  you: "You",
  partner: "Partner",
  shareInviteMessage:
    "Let's chat on StringPhone so that we can understand each other better.",
  listening: "Listening",
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
} as const;

export type UiStringKey = keyof typeof ENGLISH_UI_STRINGS;
export type UiStrings = Record<UiStringKey, string>;

export const UI_STRING_KEYS = Object.keys(
  ENGLISH_UI_STRINGS,
) as UiStringKey[];
