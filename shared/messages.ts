// Processing payloads contain no local or web history ownership IDs.
export type ChatLanguagePayload = { code: string; label: string };
export type TextChatMessageInput = {
  text: unknown;
  sourceLanguage: unknown;
  targetLanguage: unknown;
};
export type TranslatedMessage = {
  originalText: string;
  translatedText: string;
  originalPronunciation: string;
  translatedPronunciation: string;
  sourceLanguage: ChatLanguagePayload;
  targetLanguage: ChatLanguagePayload;
};
export type ProcessingFailure = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};
export type TextChatMessageResult = ({ ok: true } & TranslatedMessage) | ProcessingFailure;
