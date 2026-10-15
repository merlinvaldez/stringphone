import type { TranslatedMessage } from '../shared';
import { createProcessingTransport } from './processingTransport';

export type TextTranslationInput = {
  text: string;
  sourceLanguage: { code: string };
  targetLanguage: { code: string };
  signal?: AbortSignal;
};

export class TextTranslationResponseError extends Error {
  constructor() {
    super('The server returned an invalid text translation response.');
    this.name = 'TextTranslationResponseError';
  }
}

// Separate from native environment configuration so contract checks can inject fetch.
export function createTextChatApi(transport: ReturnType<typeof createProcessingTransport>) {
  return {
    async translateTextMessage(input: TextTranslationInput): Promise<TranslatedMessage> {
      const response = await transport.post('/chat/messages/text', {
        text: input.text,
        sourceLanguage: input.sourceLanguage.code,
        targetLanguage: input.targetLanguage.code,
      }, input.signal);
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new TextTranslationResponseError(); }
      if (!body || typeof body !== 'object') throw new TextTranslationResponseError();
      const value = body as Record<string, unknown>;
      if (['originalText', 'translatedText', 'originalPronunciation', 'translatedPronunciation']
        .some(field => typeof value[field] !== 'string')) throw new TextTranslationResponseError();
      const language = (field: string, expectedCode: string) => {
        const candidate = value[field];
        if (!candidate || typeof candidate !== 'object') throw new TextTranslationResponseError();
        const data = candidate as Record<string, unknown>;
        if (data.code !== expectedCode || typeof data.label !== 'string' || !data.label.trim()) {
          throw new TextTranslationResponseError();
        }
        return { code: expectedCode, label: data.label };
      };
      return {
        originalText: value.originalText as string,
        translatedText: value.translatedText as string,
        originalPronunciation: value.originalPronunciation as string,
        translatedPronunciation: value.translatedPronunciation as string,
        sourceLanguage: language('sourceLanguage', input.sourceLanguage.code),
        targetLanguage: language('targetLanguage', input.targetLanguage.code),
      };
    },
  };
}
