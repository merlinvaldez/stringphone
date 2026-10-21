import { getApiUrl } from '../config/api';

export type LiveLanguage = { code: string; label: string };
export type LiveTranslationResult = {
  utteranceId: string;
  revision: number;
  detectedSourceLanguage: LiveLanguage & { confidence: number; ambiguous: boolean };
  sourceLanguage: LiveLanguage;
  targetLanguage: LiveLanguage;
  sender: 'self' | 'partner';
  transcript: string;
  translatedText: string;
  originalPronunciation: string;
  translatedPronunciation: string;
};

function getErrorMessage(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' && value.error.trim()) {
    return value.error.trim().slice(0, 240);
  }
  return 'Live translation could not reach the service.';
}

async function postJson(path: string, payload: Record<string, string | number | boolean>, fetchRequest: typeof fetch) {
  const response = await fetchRequest(getApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== 'object') {
    throw new Error(getErrorMessage(body));
  }
  return body as Record<string, unknown>;
}

function asLiveTranslation(value: Record<string, unknown>): LiveTranslationResult {
  const source = value.sourceLanguage as Record<string, unknown> | undefined;
  const target = value.targetLanguage as Record<string, unknown> | undefined;
  const detected = value.detectedSourceLanguage as Record<string, unknown> | undefined;
  if (typeof value.utteranceId !== 'string' || !Number.isInteger(Number(value.revision)) ||
      typeof source?.code !== 'string' || typeof source.label !== 'string' ||
      typeof target?.code !== 'string' || typeof target.label !== 'string' ||
      typeof value.transcript !== 'string' || typeof value.translatedText !== 'string' ||
      (value.sender !== 'self' && value.sender !== 'partner')) {
    throw new Error('Live translation returned an incomplete result.');
  }
  return {
    utteranceId: value.utteranceId,
    revision: Number(value.revision),
    detectedSourceLanguage: {
      code: typeof detected?.code === 'string' ? detected.code : source.code,
      label: typeof detected?.label === 'string' ? detected.label : source.label,
      confidence: typeof detected?.confidence === 'number' ? detected.confidence : 0,
      ambiguous: detected?.ambiguous === true,
    },
    sourceLanguage: { code: source.code, label: source.label },
    targetLanguage: { code: target.code, label: target.label },
    sender: value.sender,
    transcript: value.transcript,
    translatedText: value.translatedText,
    originalPronunciation: typeof value.originalPronunciation === 'string' ? value.originalPronunciation : '',
    translatedPronunciation: typeof value.translatedPronunciation === 'string' ? value.translatedPronunciation : '',
  };
}

export function createNativeLiveApi(fetchRequest: typeof fetch = fetch) {
  return {
    async createTranscriptionSecret(sourceLanguage: string, targetLanguage: string) {
      const value = await postJson('/chat/live-transcription/token', {
        sourceLanguage,
        targetLanguage,
        fallbackReason: 'Live transcription streams speech and translates each turn on the server.',
        forceFallback: true,
      }, fetchRequest);
      if (typeof value.value !== 'string' || !value.value.trim()) {
        throw new Error('Live transcription did not return a session credential.');
      }
      return {
        value: value.value,
        liveMode: typeof value.liveMode === 'string' ? value.liveMode : 'fallback-transcription',
        fallbackReason: typeof value.fallbackReason === 'string' ? value.fallbackReason : '',
      };
    },
    async translateDraft(input: {
      utteranceId: string;
      revision: number;
      sourceLanguage: string;
      targetLanguage: string;
      transcript: string;
    }) {
      const value = await postJson('/chat/messages/live-translation', {
        utteranceId: input.utteranceId,
        revision: input.revision,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        transcript: input.transcript,
        sender: 'self',
      }, fetchRequest);
      return asLiveTranslation(value);
    },
    async finalizeTranscript(input: {
      utteranceId: string;
      revision: number;
      sourceLanguage: string;
      targetLanguage: string;
      transcript: string;
    }) {
      const value = await postJson('/chat/messages/live-transcript', {
        utteranceId: input.utteranceId,
        revision: input.revision,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        transcript: input.transcript,
        liveMode: 'fallback-transcription',
        sender: 'self',
      }, fetchRequest);
      return asLiveTranslation(value);
    },
  };
}

export const nativeLiveApi = createNativeLiveApi();
